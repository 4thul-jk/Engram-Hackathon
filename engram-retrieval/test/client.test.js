import test from "node:test";
import assert from "node:assert/strict";
import { EngramClient, EngramClientError } from "../src/client.js";
import { config } from "../src/config.js";
import { EngramService } from "../src/service.js";
import { MemoryStore } from "../src/store.js";
import { makeServer } from "../src/server.js";
const response = value => ({ ok: true, json: async () => value });
function client(fetchImpl) { return new EngramClient({ token: "private-test-token", patientId: "margaret", fetchImpl }); }
test("client binds patient scope and maps integration requests", async () => {
  const requests = []; const c = client(async (url, options) => { requests.push({ url, ...options }); return response({}); });
  await c.retrieve({ query: "flowers" });
  await c.checkIn({ eventId: "event1", placeId: "desk", observedAt: "2026-10-24T12:00:00Z" });
  await c.respond({ promptId: "p1", action: "acknowledged" });
  await c.createPlan({ patient_id: "other", kind: "photo_album" });
  await c.cancelPlan("plan1"); await c.prompts();
  for (const r of requests.slice(0, 5)) assert.equal(JSON.parse(r.body).patient_id, "margaret");
  assert.equal(JSON.parse(requests[1].body).event_id, "event1");
  assert.equal(JSON.parse(requests[2].body).prompt_id, "p1");
  assert.equal(requests[5].method, "GET");
  await c.reportDevice({ patient_id: "other", event_id: "obs1" });
  await c.deviceStatus();
  await c.requestHelp({ requestId: "help1", deviceId: "watch1" });
  assert.equal(JSON.parse(requests[6].body).patient_id, "margaret");
  assert.match(requests[7].url, /device-status\?patient_id=margaret$/);
  assert.equal(JSON.parse(requests[8].body).reason, "user_requested_help");
  assert.equal(JSON.parse(requests[8].body).device_id, "watch1");
  await c.addDailyLog({ patient_id: "other", id: "log1" });
  await c.dailyLogs({ day: "2026-10-25", activity: "exercise" });
  await c.addPersonalRecord({ id: "fact1" });
  await c.personalRecords({ kind: "person", personId: "priya" });
  assert.equal(JSON.parse(requests[9].body).patient_id, "margaret");
  assert.match(requests[10].url, /activity=exercise/);
  assert.equal(JSON.parse(requests[11].body).patient_id, "margaret");
  assert.match(requests[12].url, /person_id=priya/);
  await c.memoryContext({ patient_id: "other", query: "Who visited?", include: ["episodes"] });
  assert.equal(JSON.parse(requests[13].body).patient_id, "margaret");
  assert.match(requests[13].url, /memory-context$/);
});
test("poller emits once while visible and again after disappearance", async () => {
  const batches = [[{ _id: "p1" }], [{ _id: "p1" }], [], [{ _id: "p1" }]];
  let calls = 0; const stop = new AbortController();
  const c = client(async () => response({ prompts: batches[calls++] || [] }));
  const received = [];
  for await (const prompt of c.watchPrompts({ intervalMs: 100, signal: stop.signal })) {
    received.push(prompt._id); if (received.length === 2) stop.abort();
  }
  assert.deepEqual(received, ["p1", "p1"]); assert.equal(calls, 4);
});
test("polling errors remain visible without leaking response payload", async () => {
  const c = client(async () => ({ ok: false, status: 401, json: async () => ({ secret: "do-not-read" }) }));
  await assert.rejects(c.watchPrompts().next(), e => e instanceof EngramClientError && e.status === 401 && !e.message.includes("do-not-read"));
});
test("aborted watcher does not request; invalid origins rejected", async () => {
  const stop = new AbortController(); stop.abort();
  const c = client(() => { throw Error("must not call"); });
  assert.equal((await c.watchPrompts({ signal: stop.signal }).next()).done, true);
  assert.throws(() => new EngramClient({ baseUrl: "https://secret@example.com", token: "x", patientId: "margaret" }));
});
test("client completes plan, check-in and response flow through HTTP backend", async t => {
  const cfg = { ...config(), mode: "memory", subjectIds: ["margaret"], contextProcessing: "local", cooldownSeconds: 0 };
  const service = new EngramService(new MemoryStore(), cfg, () => new Date("2026-10-24T12:00:00Z"));
  const server = makeServer(service, cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const options = { baseUrl: `http://127.0.0.1:${server.address().port}`, patientId: "margaret" };
  const caregiver = new EngramClient({ ...options, token: cfg.adminToken });
  const patient = new EngramClient({ ...options, token: cfg.companionToken });
  const plan = { id: "clientplan", kind: "photo_album", status: "carer_verified", trigger_type: "context", place_id: "desk", event_start: "2026-10-24T11:59:00Z", expires_at: "2026-10-24T13:00:00Z" };
  await assert.rejects(patient.createPlan(plan), e => e.status === 403);
  await caregiver.createPlan(plan);
  await patient.checkIn({ eventId: "clientevent", placeId: "desk", observedAt: "2026-10-24T12:00:00Z" });
  await service.tick();
  const result = await patient.prompts(); assert.equal(result.prompts.length, 1);
  assert.equal(typeof result.prompts[0].message, "string");
  await patient.respond({ promptId: result.prompts[0]._id, action: "acknowledged" });
  assert.equal((await patient.prompts()).prompts.length, 0);
  assert.equal((await patient.retrieve({ query: "flowers" })).status, "no_record");
  await caregiver.cancelPlan("clientplan");
});
