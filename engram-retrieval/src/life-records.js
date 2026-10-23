import { createHash } from "node:crypto";
import { ApiError, id, text, choice, date } from "./validation.js";
import { localDayKey, dayBounds } from "./memory-model.js";

const key = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const optional = (value, name, max) => value == null ? null : text(value, name, max);

export class LifeRecords {
  constructor(service) { this.service = service; this.store = service.store; }
  scope(input) { return this.service.scope(input.patient_id); }
  async save(collection, scope, recordId, content) {
    const _id = key(collection, scope, recordId), digest = key(content);
    const created = await this.store.insert(collection, { _id, ...scope, recordId, ...content,
      digest, reviewStatus: "draft", recordedAt: this.service.clock() });
    const doc = await this.store.one(collection, { _id, ...scope });
    if (doc.digest !== digest) throw new ApiError(409, "Record ID reused with changed content; create a new record");
    return { created, record: this.publicRecord(doc) };
  }
  publicRecord(doc, caregiver = false) {
    const { digest, contact, ...rest } = doc;
    return { ...rest, ...(caregiver ? { contact: contact ?? null } : {}) };
  }
  async addLog(input, caregiver = false) {
    const scope = this.scope(input);
    const occurredAt = date(input.occurred_at, "occurred_at");
    if (occurredAt > this.service.clock()) throw new ApiError(400, "Future activities belong in plans");
    const sourceType = caregiver ? choice(input.source_type || "caregiver_report", ["caregiver_report", "user_report", "recording_transcript"], "source_type") : "user_report";
    if (!caregiver && input.source_type && input.source_type !== "user_report") throw new ApiError(403, "Patient submissions must be user reports");
    return this.save("daily_logs", scope, id(input.id), {
      activity: choice(input.activity, ["medication", "exercise", "meal", "hydration", "sleep", "other"], "activity"),
      label: text(input.label, "label", 200),
      outcome: choice(input.outcome, ["reported_done", "reported_not_done", "uncertain"], "outcome"),
      occurredAt, sourceType, originalText: text(input.original_text, "original_text", 4000),
      sourceRef: optional(input.source_ref, "source_ref", 2000)
    });
  }
  async daily(input, caregiver = false) {
    const scope = this.scope(input), timezone = this.service.cfg.timezone;
    const day = input.day || localDayKey(this.service.clock(), timezone);
    let bounds;
    try { bounds = dayBounds(day, timezone); } catch { throw new ApiError(400, "Invalid calendar day"); }
    const filter = { ...scope, occurredAt: { $gte: bounds.start, $lt: bounds.end }, ...(caregiver ? {} : { reviewStatus: "approved" }) };
    if (input.activity) filter.activity = choice(input.activity, ["medication", "exercise", "meal", "hydration", "sleep", "other"], "activity");
    const docs = await this.store.list("daily_logs", filter, { occurredAt: 1 }, 501);
    return { patient_id: input.patient_id, day, timezone, logs: docs.slice(0, 500).map(d => this.publicRecord(d)), truncated: docs.length > 500,
      interpretation: "Reported observations only. Missing records do not mean an activity was missed; approval does not prove medication ingestion. Conflicting reports remain separate." };
  }
  async addPersonal(input, caregiver = false) {
    const scope = this.scope(input);
    if (!caregiver && input.contact != null) throw new ApiError(403, "Contact details require caregiver backend");
    if (!caregiver && input.source_type && input.source_type !== "user_report") throw new ApiError(403, "Patient submissions must be user reports");
    const kind = choice(input.kind, ["person", "fact", "preference"], "kind");
    let personId = null, contact = null;
    if (kind === "person") {
      personId = id(input.person_id, "person_id");
      if (!await this.store.one("people", { ...scope, _id: personId })) throw new ApiError(400, "Create the scoped person card first");
      if (input.contact != null) {
        if (typeof input.contact !== "object" || Array.isArray(input.contact)) throw new ApiError(400, "Invalid contact");
        contact = { phone: optional(input.contact.phone, "phone", 60), email: optional(input.contact.email, "email", 254) };
      }
    } else if (input.contact != null || input.photo_ref != null || input.person_id != null) throw new ApiError(400, "Person fields require kind person");
    return this.save("personal_records", scope, id(input.id), {
      kind, personId, title: text(input.title, "title", 200),
      originalText: text(input.original_text, "original_text", 4000),
      sourceType: caregiver ? choice(input.source_type || "caregiver_report", ["caregiver_report", "user_report", "recording_transcript"], "source_type") : "user_report",
      photoRef: optional(input.photo_ref, "photo_ref", 2000), contact
    });
  }
  async personal(input, caregiver = false) {
    const scope = this.scope(input);
    const filter = { ...scope, ...(caregiver ? {} : { reviewStatus: "approved" }) };
    if (input.kind) filter.kind = choice(input.kind, ["person", "fact", "preference"], "kind");
    if (input.person_id) filter.personId = id(input.person_id, "person_id");
    const docs = await this.store.list("personal_records", filter, { recordedAt: -1 }, 501);
    const records = await Promise.all(docs.slice(0, 500).map(async doc => {
      const person = doc.personId ? await this.store.one("people", { ...scope, _id: doc.personId }) : null;
      return { ...this.publicRecord(doc, caregiver), person: person ? { id: person._id, name: person.name, relationship: person.relationship } : null };
    }));
    return { patient_id: input.patient_id, records, truncated: docs.length > 500,
      note: "Approved personal reports, not face recognition or identity verification. Photo references are not fetched by this backend." };
  }
  async review(input) {
    const scope = this.scope(input);
    const collection = choice(input.collection, ["daily_logs", "personal_records"], "collection");
    const _id = key(collection, scope, id(input.id));
    const reviewStatus = choice(input.status, ["draft", "approved"], "status");
    const doc = await this.store.update(collection, { ...scope, _id }, { reviewStatus, reviewedAt: this.service.clock() });
    if (!doc) throw new ApiError(404, "Record not found");
    await this.service.audit(scope, "life_record_review", _id, { collection, reviewStatus });
    return { record: this.publicRecord(doc, true) };
  }
}
