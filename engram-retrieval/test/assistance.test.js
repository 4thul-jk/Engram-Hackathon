import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { AssistanceService } from "../src/assistance.js";
import { makeServer } from "../src/server.js";
async function fixture() {
  let now = new Date("2026-10-24T12:00:00Z");
  const cfg = { ...config(), mode: "memory", subjectIds: ["margaret"] };
  const service = new EngramService(new MemoryStore(), cfg, () => now);
  const a = new AssistanceService(service);
  await a.register({ patient_id: "margaret", device_id: "phone1", kind: "phone", label: "Phone" });
  const event = { patient_id: "margaret", device_id: "phone1", event_id: "obs1", connection: "connected", battery_fraction: 0.8,
    observed_at: now.toISOString(), location: { latitude: 51.5, longitude: -0.1, accuracy_meters: 30, observed_at: now.toISOString() } };
  return { a, service, cfg, event, advance: ms => { now = new Date(+now + ms); } };
}
test("missing telemetry and stale telemetry never report monitoring healthy", async () => {
  const f = await fixture(); const input = { patient_id: "margaret" };
  assert.equal((await f.a.status(input)).devices[0].monitoring, "unavailable");
  await f.a.telemetry(f.event);
  let report = (await f.a.status(input)).devices[0];
  assert.equal(report.monitoring, "reporting");
  assert.equal(report.lastDeviceLocation.attribution, "device_location_not_verified_person_location");
  f.advance(121000); report = (await f.a.status(input)).devices[0];
  assert.equal(report.monitoring, "unavailable"); assert.equal(report.lastDeviceLocation.fresh, false);
});
test("observation retries are idempotent and changed payloads conflict", async () => {
  const f = await fixture();
  assert.equal((await f.a.telemetry(f.event)).duplicate, false);
  assert.equal((await f.a.telemetry(f.event)).duplicate, true);
  await assert.rejects(f.a.telemetry({ ...f.event, connection: "disconnected" }), e => e.status === 409);
});
test("out of order event cannot overwrite latest device observation", async () => {
  const f = await fixture(); await f.a.telemetry(f.event);
  await f.a.telemetry({ ...f.event, event_id: "older", location: null, connection: "disconnected", observed_at: "2026-10-24T11:59:00Z" });
  assert.equal((await f.a.status({ patient_id: "margaret" })).devices[0].connection, "connected");
});
test("rejects bad coordinates, future and stale observations, foreign devices and patients", async () => {
  const f = await fixture();
  for (const change of [{ observed_at: "2026-10-24T13:00:00Z" }, { observed_at: "2026-10-24T11:00:00Z" },
    { location: { ...f.event.location, latitude: 100 } }, { location: { ...f.event.location, observed_at: "2026-10-24T12:00:01Z" } }]) {
    await assert.rejects(f.a.telemetry({ ...f.event, ...change }), e => e.status === 400);
  }
  await assert.rejects(f.a.telemetry({ ...f.event, device_id: "unknown" }), e => e.status === 404);
  await assert.rejects(f.a.status({ patient_id: "other" }), e => e.status === 403);
});
test("help request retries preserve guardian acknowledgement and never claim notification sent", async () => {
  const f = await fixture(); const input = { patient_id: "margaret", device_id: "phone1", request_id: "help1", reason: "user_requested_help" };
  const results = await Promise.all([f.a.request(input), f.a.request(input)]);
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal(results[0].request.deliveryStatus, "not_sent");
  assert.equal((await f.a.queue(input)).requests.length, 1);
  await f.a.acknowledge(input); await f.a.acknowledge(input);
  assert.equal((await f.a.request(input)).request.status, "acknowledged");
  assert.equal((await f.a.queue(input)).requests.length, 0);
  await assert.rejects(f.a.request({ ...input, reason: "connection_lost" }), e => e.status === 409);
});
test("HTTP registration, guardian queue and acknowledgement are admin only", async t => {
  const f = await fixture(); const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, method] of [["/admin/devices", "POST"], ["/admin/assistance?patient_id=margaret", "GET"], ["/admin/assistance/acknowledge", "POST"]]) {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${f.cfg.companionToken}` }, ...(method === "POST" ? { body: "{}" } : {}) });
    assert.equal(r.status, 403);
  }
  const r = await fetch(base + "/device-events", { method: "POST", headers: { Authorization: `Bearer ${f.cfg.companionToken}`, "Content-Type": "application/json" }, body: JSON.stringify(f.event) });
  assert.equal(r.status, 202);
});
