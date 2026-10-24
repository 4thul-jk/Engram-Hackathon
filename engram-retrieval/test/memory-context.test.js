import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { LifeRecords } from "../src/life-records.js";
import { MemoryContext, validateContextCitations, buildContextEvidenceInput } from "../src/memory-context.js";
import { makeServer } from "../src/server.js";

async function fixture() {
  const cfg = { ...config(), mode: "memory", subjectIds: ["margaret"], timezone: "Europe/London", rerank: false };
  const service = new EngramService(new MemoryStore(), cfg, () => new Date("2026-10-24T12:00:00Z"));
  const life = new LifeRecords(service), context = new MemoryContext(service);
  await service.addSource({ subjectId: "margaret", id: "source1", sourceType: "caregiver_report", content: "Priya visited with flowers." });
  await service.addEpisode({ subjectId: "margaret", id: "event1", summary: "Priya flowers visit", sourceIds: ["source1"], reviewStatus: "approved", eventStart: "2026-10-24T09:00:00Z" });
  await life.addLog({ patient_id: "margaret", id: "log1", activity: "exercise", label: "Walk", outcome: "reported_done", occurred_at: "2026-10-24T09:30:00Z", original_text: "I walked in the garden." });
  await life.review({ patient_id: "margaret", collection: "daily_logs", id: "log1", status: "approved" });
  await service.addPerson({ subjectId: "margaret", id: "priya", name: "Priya", relationship: "daughter" });
  await life.addPersonal({ patient_id: "margaret", id: "card1", kind: "person", person_id: "priya", title: "Daughter", original_text: "Priya is my daughter.", contact: { phone: "private-number" } }, true);
  await life.review({ patient_id: "margaret", collection: "personal_records", id: "card1", status: "approved" });
  await service.createPlan({ subjectId: "margaret", id: "plan1", kind: "visit", personId: "priya", dueAt: "2026-10-24T14:55:00Z", eventStart: "2026-10-24T15:00:00Z", expiresAt: "2026-10-24T16:00:00Z" });
  return { cfg, service, life, context, input: { patient_id: "margaret", query: "Priya flowers", day: "2026-10-24" } };
}
test("unified context separates evidence, reports, personal cards and future plans without contacts", async () => {
  const f = await fixture(); const result = await f.context.retrieve(f.input);
  assert.equal(result.status, "context_ready");
  for (const s of Object.values(result.sections)) assert.equal(s.records.length, 1);
  assert.equal(result.sections.daily_logs.records[0].sourceType, "user_report");
  assert.equal(result.sections.plans.records[0].eventStatus, "planned");
  assert.equal(JSON.stringify(result).includes("private-number"), false);
  assert.equal(JSON.parse(buildContextEvidenceInput(result)).question, f.input.query);
});
test("withdrawn records vanish from structured context", async () => {
  const f = await fixture();
  await f.life.review({ patient_id: "margaret", collection: "daily_logs", id: "log1", status: "draft" });
  await f.life.review({ patient_id: "margaret", collection: "personal_records", id: "card1", status: "draft" });
  const result = await f.context.retrieve(f.input);
  assert.equal(result.sections.daily_logs.status, "empty");
  assert.equal(result.sections.personal_records.records.length, 0);
});
test("a failed section is unavailable, never a no-record result", async () => {
  const f = await fixture();
  f.service.recall = async () => { throw Error("private-provider-payload"); };
  const result = await f.context.retrieve(f.input);
  assert.equal(result.status, "context_partial");
  assert.equal(result.sections.episodes.status, "unavailable");
  assert.equal(result.sections.daily_logs.records.length, 1);
  assert.equal(JSON.stringify(result).includes("private-provider-payload"), false);
  await assert.rejects(f.context.retrieve({ ...f.input, include: ["episodes"] }), e => e.status === 503);
});
test("limit marks truncation explicitly and include avoids unnecessary branches", async () => {
  const f = await fixture();
  await f.life.addPersonal({ patient_id: "margaret", id: "fact2", kind: "preference", title: "Tea", original_text: "I like tea." });
  await f.life.review({ patient_id: "margaret", collection: "personal_records", id: "fact2", status: "approved" });
  f.service.recall = async () => { throw Error("must not call"); };
  const result = await f.context.retrieve({ ...f.input, include: ["personal_records"], limit: 1 });
  assert.deepEqual(Object.keys(result.sections), ["personal_records"]);
  assert.equal(result.complete, false); assert.equal(result.sections.personal_records.truncated, true);
});
test("input and patient scope validation happen before retrieval", async () => {
  const f = await fixture();
  for (const changes of [{ include: ["bad"] }, { include: ["plans", "plans"] }, { limit: 1000 }, { day: "invalid" }, { time_range: [] }, { plan_range: { start: "bad" } }, { activity: "bad" }]) {
    await assert.rejects(f.context.retrieve({ ...f.input, ...changes }), e => e.status === 400);
  }
  await assert.rejects(f.context.retrieve({ ...f.input, patient_id: "other" }), e => e.status === 403);
});
test("typed citations reject invented source IDs and accept reports without promoting truth", async () => {
  const f = await fixture(); const context = await f.context.retrieve(f.input);
  const record = context.sections.daily_logs.records[0];
  const output = { claims: [{ text: "You reported a walk.", citations: [{ section: "daily_logs", recordId: record._id, sourceId: record._id }] }] };
  assert.equal(validateContextCitations(context, output).allowed, true);
  output.claims[0].citations[0].sourceId = "invented";
  assert.equal(validateContextCitations(context, output).allowed, false);
  output.claims[0].citations = [{ section: "episodes", recordId: "event1", sourceId: "source1" }];
  assert.equal(validateContextCitations(context, output).allowed, true);
  context.sections.episodes.records[0].evidence[0].inspection_required = true;
  assert.equal(validateContextCitations(context, output).allowed, false);
});
test("HTTP unified endpoint requires auth and allows companion context reads", async t => {
  const f = await fixture(); const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/memory-context`;
  const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f.input) };
  assert.equal((await fetch(url, options)).status, 401);
  const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${f.cfg.companionToken}` } });
  assert.equal(response.status, 200); assert.equal((await response.json()).status, "context_ready");
});
