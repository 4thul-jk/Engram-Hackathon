import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore, MongoStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { TeamContract } from "../src/team-contract.js";
import { nativeHybridPipeline } from "../src/search.js";

function settings(extra = {}) { return { ...config(), mode: "mongodb", hybridBackend: "native", nativeRerank: true,
  nativeRerankModel: "rerank-2.5", embeddingMode: "auto", householdId: "test", subjectIds: ["margaret"], rerank: false, ...extra }; }
function mockMongo(cfg, execute) {
  return new MongoStore({}, { collection: name => ({ aggregate: (pipeline, options) => ({ toArray: () => execute(name, pipeline, options) }) }) }, cfg);
}
async function seeded() {
  const cfg = settings();
  const store = new MemoryStore(), service = new EngramService(store, cfg, () => new Date("2026-10-24T12:00:00Z"));
  await new TeamContract(service).ingest({ id: "ep", patient_id: "margaret", start: "2026-10-23T12:00:00Z", gist: "Priya brought flowers", status: "carer_verified", people: [],
    confidence: 0.9, evidence: { text: "Fictional caregiver note: Priya brought flowers", source_type: "caregiver_report" } });
  store.mode = "mongodb";
  return { cfg, store, service, episode: await store.one("episodes", { _id: "ep" }) };
}
test("native pipeline fuses unmodified filtered branches then reranks and projects", async () => {
  const cfg = settings(), scope = { householdId: "test", subjectId: "margaret" };
  const options = { from: new Date("2026-10-23T00:00:00Z"), to: new Date("2026-10-24T00:00:00Z"), personId: "priya" };
  const pipeline = await nativeHybridPipeline(cfg, scope, "flowers", options);
  const branches = pipeline[0].$rankFusion.input.pipelines;
  assert.deepEqual(Object.keys(branches), ["text", "semantic"]);
  for (const branch of Object.values(branches)) for (const stage of branch) assert.ok(!stage.$project && !stage.$rerank);
  const textFilters = branches.text[0].$search.compound.filter;
  assert.ok(textFilters.some(f => f.equals?.path === "householdId" && f.equals.value === "test"));
  assert.ok(textFilters.some(f => f.equals?.path === "personIds"));
  assert.ok(textFilters.some(f => f.range?.path === "eventStart"));
  const vector = branches.semantic[0].$vectorSearch;
  assert.equal(vector.filter.householdId, "test"); assert.equal(vector.filter.personIds, "priya");
  assert.deepEqual(vector.query, { text: "flowers" });
  assert.equal(vector.filter.eventStart.$gte, options.from);
  assert.equal(pipeline.find(s => s.$rerank).$rerank.model, "rerank-2.5");
  assert.equal(pipeline.at(-1).$project.embedding, 0);
});
test("native fusion can run with reranking disabled and no model/API call", async () => {
  const pipeline = await nativeHybridPipeline(settings({ nativeRerank: false }), { householdId: "h", subjectId: "p" }, "flowers");
  assert.ok(pipeline[0].$rankFusion); assert.ok(!pipeline.some(s => s.$rerank));
});
test("Mongo adapter executes native pipeline once when it succeeds", async () => {
  let calls = 0;
  const store = mockMongo(settings(), async (name, pipeline) => {
    calls++; assert.equal(name, "episodes"); assert.ok(pipeline.some(s => s.$rerank)); return [{ _id: "ep" }];
  });
  const result = await store.nativeHybridSearch({ householdId: "h", subjectId: "p" }, "flowers", {});
  assert.equal(calls, 1); assert.equal(result.reranked, true); assert.equal(result.docs[0]._id, "ep");
});
test("optional reranker failure retries fusion-only, without claiming reranking", async () => {
  const calls = [];
  const store = mockMongo(settings(), async (_name, pipeline) => {
    calls.push(pipeline); if (pipeline.some(s => s.$rerank)) throw new Error("setting disabled"); return [{ _id: "ep" }];
  });
  const result = await store.nativeHybridSearch({ householdId: "h", subjectId: "p" }, "flowers", {});
  assert.equal(calls.length, 2); assert.equal(result.reranked, false);
  assert.ok(!calls[1].some(s => s.$rerank)); assert.match(result.warnings[0], /without reranking/);
});
test("native fusion failure surfaces to service for application fallback", async () => {
  const store = mockMongo(settings({ nativeRerank: false }), async () => { throw new Error("unsupported fusion"); });
  await assert.rejects(store.nativeHybridSearch({ householdId: "h", subjectId: "p" }, "flowers", {}), /unsupported/);
});
test("successful native path reports real features and preserves canonical checks", async () => {
  const f = await seeded();
  f.store.nativeHybridSearch = async () => ({ docs: [f.episode], reranked: true, warnings: [] });
  f.store.search = async () => { throw new Error("should not execute fallback"); };
  const result = await f.service.recall({ subjectId: "margaret", query: "flowers" });
  assert.equal(result.evidence.length, 1);
  assert.ok(result.featuresUsed.includes("atlas_rank_fusion"));
  assert.ok(result.featuresUsed.includes("atlas_native_rerank_voyage"));
  assert.ok(!result.featuresUsed.includes("application_reciprocal_rank_fusion"));
  await f.store.update("episodes", { _id: "ep" }, { reviewStatus: "draft" });
  assert.equal((await f.service.recall({ subjectId: "margaret", query: "flowers" })).evidence.length, 0);
});
test("native failure with successful complete fallback is not a no-record outage", async () => {
  const f = await seeded();
  f.store.nativeHybridSearch = async () => { throw new Error("unsupported"); };
  f.store.search = async () => [];
  const result = await f.service.recall({ subjectId: "margaret", query: "park" });
  assert.equal(result.status, "no_record"); assert.equal(result.retrievalComplete, true);
  assert.ok(result.featuresUsed.includes("application_reciprocal_rank_fusion"));
  assert.ok(!result.featuresUsed.includes("atlas_rank_fusion"));
});
test("native and partial fallback failure stays incomplete; total failure is 503", async () => {
  const f = await seeded();
  f.store.nativeHybridSearch = async () => { throw new Error(); };
  f.store.search = async (_s, _q, _o, method) => { if (method === "vector") throw new Error(); return []; };
  const result = await f.service.recall({ subjectId: "margaret", query: "park" });
  assert.equal(result.status, "retrieval_incomplete"); assert.equal(result.retrievalComplete, false);
  f.store.search = async () => { throw new Error(); };
  await assert.rejects(f.service.recall({ subjectId: "margaret", query: "park" }), e => e.status === 503);
});
test("local mode never claims native Atlas features even when configured", async () => {
  const cfg = settings(), service = new EngramService(new MemoryStore(), cfg);
  const result = await service.recall({ subjectId: "margaret", query: "flowers" });
  assert.deepEqual(result.featuresUsed, ["local_keyword_demo"]);
});
