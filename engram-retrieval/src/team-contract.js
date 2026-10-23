import { createHash } from "node:crypto";
import { ApiError, id, ids, text, date, choice, unitNumber, range } from "./validation.js";

const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const optionalText = (value, name, max) => value == null ? null : text(value, name, max);

// Team-facing adapter. It doesn't parse natural-language dates, fetch media,
// identify people, or turn a model confidence score into a truth guarantee.
export class TeamContract {
  constructor(service) { this.service = service; }
  async ingest(input) {
    const scope = this.service.scope(input.patient_id);
    const episodeId = id(input.id);
    const start = date(input.start, "start");
    const end = input.end == null ? null : date(input.end, "end");
    if (start > this.service.clock() || (end && (end < start || end > this.service.clock()))) throw new ApiError(400, "Episode must describe a past event with valid start/end");
    const status = choice(input.status || "auto", ["auto", "carer_verified"], "status");
    const people = ids(input.people || [], "people").sort();
    for (const personId of people) if (!await this.service.store.one("people", { ...scope, _id: personId })) throw new ApiError(400, "people must contain existing person IDs in this patient scope");
    const value = {
      id: episodeId, patient_id: scope.subjectId, start: start.toISOString(), end: end?.toISOString() ?? null,
      place: optionalText(input.place, "place", 200), people,
      what: optionalText(input.what, "what", 2000), gist: text(input.gist, "gist", 2000),
      salience: input.salience == null ? null : unitNumber(input.salience, "salience"),
      confidence: input.confidence == null ? null : unitNumber(input.confidence, "confidence"),
      status, media_ptr: optionalText(input.media_ptr, "media_ptr", 2000),
      source_ids: ids(input.source_ids || [], "source_ids").sort(), evidence: null
    };
    if (input.embedding !== undefined) throw new ApiError(400, "Do not submit embedding; this service manages the configured embedding space");
    if (input.evidence !== undefined) {
      if (!input.evidence || typeof input.evidence !== "object" || Array.isArray(input.evidence)) throw new ApiError(400, "Invalid evidence");
      value.evidence = {
        text: text(input.evidence.text, "evidence.text", 12000),
        source_type: choice(input.evidence.source_type, ["caregiver_report", "user_report", "recording_transcript"], "evidence.source_type")
      };
    }
    if (!value.source_ids.length && !value.evidence && !value.media_ptr) throw new ApiError(400, "Provide source_ids, original evidence text, or media_ptr; gist alone is not evidence");
    for (const sourceId of value.source_ids) if (!await this.service.store.one("sources", { ...scope, _id: sourceId })) throw new ApiError(400, "Source missing or outside patient scope");
    const contractDigest = digest(value);
    const existing = await this.service.store.one("episodes", { ...scope, _id: episodeId });
    if (existing) return this.replay(existing, contractDigest);
    const sourceIds = [...value.source_ids];
    if (value.evidence || (!sourceIds.length && value.media_ptr)) {
      const sourceId = `source_${digest({ scope, episodeId, contractDigest })}`;
      const source = { id: sourceId, subjectId: scope.subjectId,
        sourceType: value.evidence?.source_type || "media_reference",
        content: value.evidence?.text, mediaPtr: value.media_ptr };
      // Deterministic source IDs make retries recoverable if embedding/insertion fails.
      if (!await this.service.store.one("sources", { ...scope, _id: sourceId })) {
        try { await this.service.addSource(source); }
        catch (error) {
          if (error.status !== 409 || !await this.service.store.one("sources", { ...scope, _id: sourceId })) throw error;
        }
      }
      sourceIds.push(sourceId);
    }
    try {
      const doc = await this.service.addEpisode({ id: episodeId, subjectId: scope.subjectId,
        summary: value.gist, searchText: [value.gist, value.what, value.place].filter(Boolean).join(". "),
        eventStart: value.start, eventEnd: value.end, personIds: people, sourceIds,
        reviewStatus: status === "carer_verified" ? "approved" : "draft",
        confidence: value.confidence, salience: value.salience, place: value.place, what: value.what,
        mediaPtr: value.media_ptr, contractDigest });
      return { created: true, episode: this.episode(doc) };
    } catch (error) {
      if (error.status === 409) {
        const concurrent = await this.service.store.one("episodes", { ...scope, _id: episodeId });
        if (concurrent) return this.replay(concurrent, contractDigest);
      }
      throw error;
    }
  }
  replay(doc, expectedDigest) {
    if (doc.contractDigest !== expectedDigest) throw new ApiError(409, "Episode ID already exists with different content; review or correct explicitly");
    return { created: false, episode: this.episode(doc) };
  }
  episode(doc) {
    return { id: doc._id, patient_id: doc.subjectId, start: doc.eventStart, end: doc.eventEnd ?? null,
      place: doc.place ?? null, people: doc.personIds, what: doc.what ?? null, gist: doc.summary,
      salience: doc.salience ?? null, confidence: doc.confidence ?? null,
      status: doc.reviewStatus === "approved" ? "carer_verified" : "auto",
      media_ptr: doc.mediaPtr ?? null, source_ids: doc.sourceIds };
  }
  async review(input) {
    const scope = this.service.scope(input.patient_id);
    const episodeId = id(input.id);
    const status = choice(input.status, ["auto", "carer_verified"], "status");
    const existing = await this.service.store.one("episodes", { ...scope, _id: episodeId });
    if (!existing || !existing.isCurrent) throw new ApiError(404, "Current episode not found");
    // Recheck source existence; approval is a trusted caregiver action, not model judgement.
    for (const sourceId of existing.sourceIds) if (!await this.service.store.one("sources", { ...scope, _id: sourceId })) throw new ApiError(409, "Episode has missing evidence");
    const doc = await this.service.store.update("episodes", { ...scope, _id: episodeId, isCurrent: true }, {
      reviewStatus: status === "carer_verified" ? "approved" : "draft", reviewedAt: this.service.clock()
    });
    if (!doc) throw new ApiError(409, "Episode changed; reload");
    await this.service.audit(scope, "episode_review", episodeId, { status });
    return { episode: this.episode(doc) };
  }
  async retrieve(input) {
    this.service.scope(input.patient_id);
    if (input.time_range != null && (typeof input.time_range !== "object" || Array.isArray(input.time_range))) throw new ApiError(400, "time_range must be {start, end}");
    const timeRange = input.time_range || {};
    // Explicit bounds only; do not infer dates from query strings here.
    const bounds = range({ from: timeRange.start, to: timeRange.end });
    const min = input.min_confidence == null ? null : unitNumber(input.min_confidence, "min_confidence");
    const result = await this.service.recall({ subjectId: input.patient_id, query: input.query,
      mode: input.mode || "hybrid", from: bounds.from?.toISOString(), to: bounds.to?.toISOString() });
    const evidence = result.evidence.filter(e => min === null || (e.confidence !== null && e.confidence >= min));
    return {
      patient_id: input.patient_id,
      status: evidence.length ? "candidates_found" : !result.retrievalComplete ? "retrieval_incomplete" : "no_record",
      episodes: evidence.map(e => ({ id: e.episodeId, patient_id: input.patient_id,
        start: e.eventStart, end: e.eventEnd, place: e.place, people: e.personIds,
        what: e.what, gist: e.summary, salience: e.salience, confidence: e.confidence,
        status: "carer_verified", media_ptr: e.mediaPtr, source_ids: e.sources.map(s => s.id),
        evidence: e.sources.map(s => ({ id: s.id, text: s.content, source_type: s.sourceType,
          media_ptr: s.mediaPtr ?? null, inspection_required: s.inspectionRequired })) })),
      warnings: result.warnings, features_used: result.featuresUsed, retrieval_complete: result.retrievalComplete,
      note: "Candidates are not verified answers. Confidence is supplied metadata, not calibrated truth or retrieval similarity. Media-only evidence requires inspection before claims."
    };
  }
}
