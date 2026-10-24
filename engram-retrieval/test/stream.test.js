import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contextStreamPipeline, STREAM_PIPELINE_VERSION } from "../src/stream-pipeline.js";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";

test("stream pipeline uses current source config, scoped plan join and idempotent sink", async () => {
  const p = contextStreamPipeline({ connectionName: "testConnection", database: "testDb" });
  assert.equal(p[0].$source.config.fullDocument, "updateLookup");
  assert.equal(p[0].$source.fullDocument, undefined);
  const lookup = p.find(s => s.$lookup).$lookup;
  assert.equal(lookup.from.connectionName, "testConnection");
  const clauses = lookup.pipeline[0].$match.$expr.$and;
  for (const field of ["householdId", "subjectId", "placeId", "triggerType", "reviewStatus", "eventStatus", "eventStart", "expiresAt"]) assert.ok(JSON.stringify(clauses).includes(`$${field}`));
  assert.equal(p.at(-1).$merge.whenMatched, "keepExisting");
  assert.equal(p.find(s => s.$set).$set.pipelineVersion, STREAM_PIPELINE_VERSION);
  const template = JSON.parse(await readFile(new URL("../atlas/context-pipeline.json", import.meta.url)));
  assert.ok(template[0].$source.config); assert.equal(template.at(-1).$merge.whenMatched, "keepExisting");
});
test("rejects unsafe connection and database configuration", () => {
  assert.throws(() => contextStreamPipeline({ database: "bad/name" }));
  assert.throws(() => contextStreamPipeline({ connectionName: "" }));
});
async function fixture() {
  const cfg = { ...config(), mode: "memory", contextProcessing: "atlas", subjectIds: ["margaret"], quietStart: "22:00", quietEnd: "22:00", cooldownSeconds: 0 };
  const store = new MemoryStore(), service = new EngramService(store, cfg, () => new Date("2026-10-24T12:00:00Z"));
  await service.createPlan({ subjectId: "margaret", id: "streamplan", kind: "photo_album", triggerType: "context", placeId: "desk", eventStart: "2026-10-24T11:59:00Z", expiresAt: "2026-10-24T13:00:00Z" });
  await service.context({ subjectId: "margaret", eventId: "streamevent", placeId: "desk", observedAt: "2026-10-24T12:00:00Z" });
  return { service, store, original: await store.one("context_events", { _id: "streamevent" }) };
}
test("atlas mode does not locally fabricate a candidate; marked external candidate triggers once", async () => {
  const f = await fixture();
  await f.service.tick(); assert.equal((await f.store.list("assistance_candidates")).length, 0);
  // Explicit test fixture, not a real Atlas processor execution.
  await f.store.insert("assistance_candidates", { ...f.original, status: "pending", processingPath: "atlas_stream_processing", pipelineVersion: STREAM_PIPELINE_VERSION });
  await f.service.tick(); await f.service.tick();
  assert.equal((await f.service.prompts("margaret")).length, 1);
});
test("unmarked candidate is ignored; marked candidate still requires authoritative matching event", async () => {
  const f = await fixture();
  await f.store.insert("assistance_candidates", { ...f.original, status: "pending" });
  await f.service.tick(); assert.equal((await f.service.prompts("margaret")).length, 0);
  await f.store.update("assistance_candidates", { _id: "streamevent" }, { processingPath: "atlas_stream_processing", pipelineVersion: STREAM_PIPELINE_VERSION });
  await f.service.cancelPlan({ subjectId: "margaret", planId: "streamplan" });
  await f.service.tick(); assert.equal((await f.service.prompts("margaret")).length, 0);
});
