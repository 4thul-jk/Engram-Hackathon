import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { TriggerContract } from "../src/trigger-contract.js";
import { makeServer } from "../src/server.js";

function fixture() {
  const cfg = { ...config(), mode: "memory", subjectIds: ["margaret"], cooldownSeconds: 0 };
  const service = new EngramService(new MemoryStore(), cfg, () => new Date("2026-10-24T12:00:00Z"));
  const input = { patient_id: "margaret", id: "album", kind: "photo_album", status: "carer_verified",
    trigger_type: "context", place_id: "desk", event_start: "2026-10-24T11:59:00Z", expires_at: "2026-10-24T13:00:00Z" };
  return { cfg, service, input, contract: new TriggerContract(service) };
}
test("team context event produces one prompt; acknowledgement does not complete plan", async () => {
  const f = fixture(); await f.contract.create(f.input);
  const event = { patient_id: "margaret", event_id: "checkin", place_id: "desk", observed_at: "2026-10-24T12:00:00Z" };
  assert.equal((await f.contract.context(event)).duplicate, false);
  assert.equal((await f.contract.context(event)).duplicate, true);
  await f.service.tick();
  const { prompts } = await f.contract.poll({ patient_id: "margaret" });
  assert.equal(prompts.length, 1);
  await f.contract.respond({ patient_id: "margaret", prompt_id: prompts[0]._id, action: "acknowledged" });
  assert.equal((await f.service.store.one("plans", { _id: "album" })).eventStatus, "planned");
});
test("team cancellation suppresses pending prompt and stale context is rejected", async () => {
  const f = fixture(); await f.contract.create(f.input);
  await assert.rejects(f.contract.context({ patient_id: "margaret", event_id: "old", place_id: "desk", observed_at: "2026-10-24T11:00:00Z" }), e => e.status === 400);
  await f.contract.cancel({ patient_id: "margaret", plan_id: "album" });
  await f.contract.context({ patient_id: "margaret", event_id: "now", place_id: "desk", observed_at: "2026-10-24T12:00:00Z" });
  await f.service.tick();
  assert.equal((await f.contract.poll({ patient_id: "margaret" })).prompts.length, 0);
});
test("explicit caregiver approval and subject scope required", async () => {
  const f = fixture();
  await assert.rejects(f.contract.create({ ...f.input, status: "auto" }), e => e.status === 400);
  await assert.rejects(f.contract.poll({ patient_id: "other" }), e => e.status === 403);
});
test("HTTP plan aliases enforce admin authorization", async t => {
  const f = fixture(); const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/plans", "/plans/cancel"]) {
    const response = await fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${f.cfg.companionToken}`, "Content-Type": "application/json" }, body: JSON.stringify(f.input) });
    assert.equal(response.status, 403);
  }
  const response = await fetch(base + "/plans", { method: "POST", headers: { Authorization: `Bearer ${f.cfg.adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify(f.input) });
  assert.equal(response.status, 201);
});
