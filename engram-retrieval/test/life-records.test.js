import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { LifeRecords } from "../src/life-records.js";
import { makeServer } from "../src/server.js";
function fixture() {
  const cfg = { ...config(), mode: "memory", subjectIds: ["margaret"], timezone: "Europe/London" };
  const service = new EngramService(new MemoryStore(), cfg, () => new Date("2026-10-26T12:00:00Z"));
  const life = new LifeRecords(service);
  const log = { patient_id: "margaret", id: "medicine1", activity: "medication", label: "Morning medicine", outcome: "reported_done",
    occurred_at: "2026-10-25T08:00:00Z", original_text: "I think I took my morning medicine." };
  return { cfg, service, life, log };
}
test("daily logs require review, retain self-report provenance and deduplicate retries", async () => {
  const f = fixture(); await f.life.addLog(f.log);
  assert.equal((await f.life.daily({ patient_id: "margaret", day: "2026-10-25" })).logs.length, 0);
  await f.life.review({ patient_id: "margaret", collection: "daily_logs", id: "medicine1", status: "approved" });
  assert.equal((await f.life.addLog(f.log)).created, false);
  const report = await f.life.daily({ patient_id: "margaret", day: "2026-10-25" });
  assert.equal(report.logs[0].sourceType, "user_report");
  assert.equal(report.logs[0].outcome, "reported_done");
  assert.equal(report.logs[0].reviewStatus, "approved");
  await assert.rejects(f.life.addLog({ ...f.log, outcome: "uncertain" }), e => e.status === 409);
  await f.life.review({ patient_id: "margaret", collection: "daily_logs", id: "medicine1", status: "draft" });
  assert.equal((await f.life.daily({ patient_id: "margaret", day: "2026-10-25" })).logs.length, 0);
});
test("London 25-hour day includes both repeated hours and excludes next midnight", async () => {
  const f = fixture();
  for (const [id, time] of [["one", "2026-10-25T00:30:00Z"], ["two", "2026-10-25T01:30:00Z"], ["next", "2026-10-26T00:00:00Z"]]) {
    await f.life.addLog({ ...f.log, id, occurred_at: time });
  }
  const result = await f.life.daily({ patient_id: "margaret", day: "2026-10-25" }, true);
  assert.deepEqual(result.logs.map(l => l.recordId), ["one", "two"]);
});
test("person records expose family relationship and private photo reference, hide contact from companion", async () => {
  const f = fixture();
  await f.service.addPerson({ subjectId: "margaret", id: "priya", name: "Priya", relationship: "daughter" });
  const input = { patient_id: "margaret", id: "daughtercard", kind: "person", person_id: "priya", title: "My daughter",
    original_text: "Priya is my daughter.", source_type: "caregiver_report", photo_ref: "private/photos/priya.jpg", contact: { phone: "+440000000000" } };
  await f.life.addPersonal(input, true);
  await f.life.review({ patient_id: "margaret", collection: "personal_records", id: input.id, status: "approved" });
  const patient = (await f.life.personal({ patient_id: "margaret" })).records[0];
  assert.equal(patient.person.relationship, "daughter"); assert.equal(patient.photoRef, input.photo_ref);
  assert.equal("contact" in patient, false);
  const caregiver = (await f.life.personal({ patient_id: "margaret" }, true)).records[0];
  assert.equal(caregiver.contact.phone, input.contact.phone);
});
test("patient personal facts become drafts and cannot forge caregiver provenance", async () => {
  const f = fixture();
  const input = { patient_id: "margaret", id: "tea", kind: "preference", title: "Tea", original_text: "I like tea without sugar." };
  await f.life.addPersonal(input);
  assert.equal((await f.life.personal(input)).records.length, 0);
  assert.equal((await f.life.personal(input, true)).records[0].sourceType, "user_report");
  await assert.rejects(f.life.addPersonal({ ...input, source_type: "caregiver_report" }), e => e.status === 403);
  await assert.rejects(f.life.addLog({ ...f.log, source_type: "caregiver_report" }), e => e.status === 403);
  await assert.rejects(f.life.addLog({ ...f.log, occurred_at: "2026-10-27T00:00:00Z" }), e => e.status === 400);
  await assert.rejects(f.life.daily({ patient_id: "other" }), e => e.status === 403);
});
test("HTTP caregiver review and contact records require admin token", async t => {
  const f = fixture(); const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/admin/life-records/review", "/admin/personal-records", "/admin/daily-logs"]) {
    const r = await fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${f.cfg.companionToken}` }, body: "{}" });
    assert.equal(r.status, 403);
  }
  const r = await fetch(base + "/daily-logs", { method: "POST", headers: { Authorization: `Bearer ${f.cfg.companionToken}`, "Content-Type": "application/json" }, body: JSON.stringify(f.log) });
  assert.equal(r.status, 201);
});
