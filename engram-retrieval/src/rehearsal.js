import { createHash } from "node:crypto";
import { ApiError, id, choice } from "./validation.js";
import { MODEL_VERSION, DAY_MS, initialState, retention, nextDueAt, updateStability, localDayKey, dayBounds, shiftDay } from "./memory-model.js";

const key = (scope, day) => createHash("sha256").update(JSON.stringify({ ...scope, day })).digest("hex");
export class RehearsalService {
  constructor(service) { this.service = service; this.store = service.store; this.cfg = service.cfg; }
  async eligible(scope, episodeId) {
    const doc = await this.store.one("episodes", { ...scope, _id: episodeId, reviewStatus: "approved", isCurrent: true });
    if (!doc || doc.eventStart > this.service.clock() || !Number.isFinite(doc.confidence) || doc.confidence < 0.8) return null;
    // Do not rehearse uninspected media or missing original evidence.
    if (!Array.isArray(doc.sourceIds) || !doc.sourceIds.length) return null;
    for (const sourceId of doc.sourceIds) {
      const source = await this.store.one("sources", { ...scope, _id: sourceId });
      if (!source || source.sourceType === "media_reference" || typeof source.content !== "string" || !source.content.trim()) return null;
    }
    return doc;
  }
  async state(scope, episode) {
    await this.store.insert("memory_state", initialState(episode, scope));
    return this.store.one("memory_state", { ...scope, _id: episode._id });
  }
  async readState(input) {
    const scope = this.service.scope(input.patient_id), episodeId = id(input.episode_id, "episode_id");
    const episode = await this.eligible(scope, episodeId);
    if (!episode) throw new ApiError(404, "Episode is not eligible for rehearsal");
    const state = await this.state(scope, episode);
    return { ...state, estimatedRetention: retention(Math.max(0, (+this.service.clock() - +state.anchorAt) / DAY_MS), state.stabilityDays), experimental: true };
  }
  async generate(input) {
    const scope = this.service.scope(input.patient_id), now = this.service.clock();
    const day = input.day || shiftDay(localDayKey(now, this.cfg.timezone), 1);
    let bounds;
    try { bounds = dayBounds(day, this.cfg.timezone); }
    catch { throw new ApiError(400, "day must be a valid YYYY-MM-DD in the configured timezone"); }
    const today = localDayKey(now, this.cfg.timezone);
    if (day < today || day > shiftDay(today, 1)) throw new ApiError(400, "Generate only today's or tomorrow's review");
    const listId = `review_${key(scope, day)}`;
    let list = await this.store.one("rehearsal_sets", { ...scope, _id: listId });
    if (!list) {
      // Snapshot once per local calendar day. Re-running never adds another 3 memories.
      const candidates = await this.store.list("episodes", { ...scope, reviewStatus: "approved", isCurrent: true,
        confidence: { $gte: 0.8 }, eventStart: { $lte: now } }, { eventStart: -1 }, 1000);
      const scored = [];
      for (const candidate of candidates) {
        const episode = await this.eligible(scope, candidate._id);
        if (!episode) continue;
        const state = await this.state(scope, episode);
        if (state.nextDueAt >= bounds.end) continue;
        const estimate = retention(Math.max(0, (+bounds.start - +state.anchorAt) / DAY_MS), state.stabilityDays);
        scored.push({ episodeId: episode._id, stateVersion: state.version,
          priority: (episode.salience ?? 0.5) * (1 - estimate) });
      }
      scored.sort((a,b) => b.priority - a.priority || a.episodeId.localeCompare(b.episodeId));
      list = { _id: listId, ...scope, day, timezone: this.cfg.timezone, episodeIds: scored.slice(0, 3).map(x => x.episodeId),
        createdAt: now, modelVersion: MODEL_VERSION, experimental: true };
      await this.store.insert("rehearsal_sets", list);
      list = await this.store.one("rehearsal_sets", { ...scope, _id: listId });
    }
    return this.materialize(scope, list);
  }
  async materialize(scope, list) {
    const episodes = [];
    for (const episodeId of list.episodeIds) {
      const doc = await this.eligible(scope, episodeId);
      if (doc) episodes.push({ id: doc._id, gist: doc.summary, source_ids: doc.sourceIds,
        confidence: doc.confidence, state: await this.state(scope, doc) });
    }
    return { id: list._id, patient_id: scope.subjectId, day: list.day, timezone: list.timezone,
      episodes, dailyLimit: 3, experimental: true,
      note: "Scheduling heuristic, not a cognitive measurement. Offer practice only with consent and a skip option. No prompts are sent by this endpoint." };
  }
  async getSet(input) {
    const scope = this.service.scope(input.patient_id);
    const day = input.day || localDayKey(this.service.clock(), this.cfg.timezone);
    try { dayBounds(day, this.cfg.timezone); } catch { throw new ApiError(400, "Invalid day"); }
    const list = await this.store.one("rehearsal_sets", { ...scope, _id: `review_${key(scope, day)}` });
    if (!list) return { patient_id: scope.subjectId, day, episodes: [], dailyLimit: 3, status: "not_generated", experimental: true };
    return this.materialize(scope, list);
  }
  async attempt(input) {
    const scope = this.service.scope(input.patient_id), now = this.service.clock();
    const attemptId = id(input.attempt_id, "attempt_id"), episodeId = id(input.episode_id, "episode_id");
    const outcome = choice(input.outcome, ["recalled", "not_recalled", "skipped"], "outcome");
    const cue = input.cue_level;
    if (!Number.isInteger(cue) || cue < 0 || cue > 3) throw new ApiError(400, "cue_level must be 0 to 3");
    const day = localDayKey(now, this.cfg.timezone);
    const previous = await this.store.one("recall_attempts", { ...scope, _id: attemptId });
    if (previous) {
      if (previous.episodeId !== episodeId || previous.outcome !== outcome || previous.cueLevel !== cue) throw new ApiError(409, "attempt_id already has different content");
      return this.applyAttempt(scope, previous);
    }
    const list = await this.store.one("rehearsal_sets", { ...scope, _id: `review_${key(scope, day)}` });
    if (!list || !list.episodeIds.includes(episodeId)) throw new ApiError(409, "Episode is not in today's practice set");
    const episode = await this.eligible(scope, episodeId);
    if (!episode) throw new ApiError(409, "Episode is no longer eligible");
    const before = await this.state(scope, episode);
    // One attempt per selected episode per day: unique deterministic slot (max 3/day).
    const slotId = `slot_${key(scope, day)}_${episodeId}`;
    const slot = await this.store.one("practice_slots", { ...scope, _id: slotId });
    if (slot && slot.attemptId !== attemptId) throw new ApiError(409, "This memory was already practiced today");
    const stabilityDays = outcome === "skipped" ? before.stabilityDays : updateStability(before.stabilityDays, cue, outcome === "recalled");
    const record = { _id: attemptId, ...scope, episodeId, day, outcome, cueLevel: cue, recordedAt: now,
      expectedVersion: before.version, beforeStabilityDays: before.stabilityDays, afterStabilityDays: stabilityDays,
      nextDueAt: outcome === "skipped" ? before.nextDueAt : nextDueAt(now, stabilityDays), modelVersion: MODEL_VERSION, applied: false };
    // Reserve immutable attempt first; an interrupted slot/state update is recovered by retry.
    const inserted = await this.store.insert("recall_attempts", record);
    const canonical = inserted ? record : await this.store.one("recall_attempts", { ...scope, _id: attemptId });
    if (!canonical || canonical.episodeId !== episodeId || canonical.outcome !== outcome || canonical.cueLevel !== cue) throw new ApiError(409, "attempt_id conflict");
    return this.applyAttempt(scope, canonical);
  }
  async applyAttempt(scope, record) {
    // Revalidate even on retries: revoked evidence must not be rehearsed.
    if (!await this.eligible(scope, record.episodeId)) throw new ApiError(409, "Episode is no longer eligible");
    const slotId = `slot_${key(scope, record.day)}_${record.episodeId}`;
    await this.store.insert("practice_slots", { _id: slotId, ...scope, attemptId: record._id, day: record.day, episodeId: record.episodeId });
    const slot = await this.store.one("practice_slots", { ...scope, _id: slotId });
    if (!slot || slot.attemptId !== record._id) throw new ApiError(409, "This memory was already practiced today");
    let current = await this.store.one("memory_state", { ...scope, _id: record.episodeId });
    if (!record.applied && current?.lastAttemptId !== record._id) {
      const skipped = record.outcome === "skipped";
      const updated = await this.store.update("memory_state", { ...scope, _id: record.episodeId, version: record.expectedVersion }, {
        stabilityDays: record.afterStabilityDays, nextDueAt: record.nextDueAt,
        anchorAt: skipped ? current.anchorAt : record.recordedAt,
        lastRehearsalAt: skipped ? current.lastRehearsalAt : record.recordedAt,
        attempts: current.attempts + (skipped ? 0 : 1), version: current.version + 1, lastAttemptId: record._id
      });
      current = updated || await this.store.one("memory_state", { ...scope, _id: record.episodeId });
      if (current?.lastAttemptId !== record._id) throw new ApiError(409, "Memory state changed; review attempt history before retrying");
    }
    await this.store.update("recall_attempts", { ...scope, _id: record._id }, { applied: true });
    return { attempt_id: record._id, episode_id: record.episodeId, outcome: record.outcome,
      applied: true, state: current, experimental: true };
  }
}
