import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/store.js";
import { EngramService, isQuiet } from "../src/service.js";
import { config } from "../src/config.js";
import { seedDemo } from "../src/fixtures.js";
import { fuse, textPipeline, vectorPipeline } from "../src/search.js";
import { makeServer } from "../src/server.js";
import { validateCitations } from "../src/grounding.js";
import { STREAM_PIPELINE_VERSION } from "../src/stream-pipeline.js";

function fixture(extra = {}) {
  let time = new Date("2026-10-24T12:00:00Z");
  const cfg = { ...config(), mode: "memory", householdId: "demo-household", subjectIds: ["margaret"], quietStart: "22:00", quietEnd: "22:00", cooldownSeconds: 0, rerank: false, contextProcessing: "local", ...extra };
  const store = new MemoryStore();
  const service = new EngramService(store, cfg, () => new Date(time));
  return { cfg, store, service, advance: ms => { time = new Date(+time + ms); }, now: () => new Date(time) };
}
async function visit(f) {
  await f.service.addPerson({ subjectId: "margaret", id: "priya", name: "Priya", relationship: "granddaughter" });
  return f.service.createPlan({ subjectId: "margaret", id: "visit", kind: "visit", personId: "priya", dueAt: f.now().toISOString(),
    eventStart: new Date(+f.now() + 60000).toISOString(), expiresAt: new Date(+f.now() + 180000).toISOString() });
}
test("scheduled job produces one prompt without a user question", async () => {
  const f = fixture(); await visit(f); await f.service.tick(); await f.service.tick();
  const prompts = await f.service.prompts("margaret");
  assert.equal(prompts.length, 1); assert.match(prompts[0].message, /scheduled to visit/);
  assert.equal((await f.store.list("prompt_jobs"))[0].status, "completed");
});

test("context retries reject changed content and repair an interrupted candidate write", async () => {
  const f = fixture();
  const event = { subjectId: "margaret", eventId: "repair", placeId: "desk", observedAt: f.now().toISOString() };
  const insert = f.store.insert.bind(f.store); let fail = true;
  f.store.insert = async (name, doc) => {
    if (name === "assistance_candidates" && fail) { fail = false; throw Error("interrupted write"); }
    return insert(name, doc);
  };
  await assert.rejects(f.service.context(event));
  assert.equal((await f.service.context(event)).duplicate, true);
  assert.equal((await f.store.list("assistance_candidates")).length, 1);
  await assert.rejects(f.service.context({ ...event, placeId: "kitchen" }), e => e.status === 409);
  await f.store.update("assistance_candidates", { _id: "repair" }, { status: "processed" });
  await f.service.context(event);
  assert.equal((await f.store.one("assistance_candidates", { _id: "repair" })).status, "processed");
});
test("worker restart reconciliation does not lose a saved plan", async () => {
  const f = fixture(); await visit(f);
  assert.equal((await f.store.list("prompt_jobs")).length, 0);
  await new EngramService(f.store, f.cfg, f.now).tick();
  assert.equal((await f.service.prompts("margaret")).length, 1);
});
test("cancelled plan never delivers and hides already created prompts", async () => {
  const f = fixture(); await visit(f); await f.service.tick();
  const prompt = (await f.service.prompts("margaret"))[0];
  await f.service.cancelPlan({ subjectId: "margaret", planId: "visit" });
  assert.equal((await f.service.prompts("margaret")).length, 0);
  await assert.rejects(f.service.respond({ subjectId: "margaret", promptId: prompt._id, action: "self_reported_done" }), /Plan changed/);
});
test("cancel before processing invalidates queued job", async () => {
  const f = fixture(); await visit(f); await f.service.reconcile();
  await f.service.cancelPlan({ subjectId: "margaret", planId: "visit" }); await f.service.tick();
  assert.equal((await f.store.list("prompts")).length, 0);
  assert.equal((await f.store.list("prompt_jobs"))[0].status, "cancelled");
});
test("quiet hours suppress delivery and eventually expire overdue job", async () => {
  const f = fixture({ quietStart: "00:00", quietEnd: "23:59" });
  await visit(f); await f.service.tick(); assert.equal((await f.service.prompts("margaret")).length, 0);
  f.advance(200000); await f.service.tick();
  assert.equal((await f.store.list("prompt_jobs"))[0].status, "expired");
});
test("expired worker lease is recoverable and doesn't duplicate prompt", async () => {
  const f = fixture(); await visit(f); await f.service.reconcile();
  const abandoned = await f.store.claimJob(f.now());
  assert.ok(abandoned.leaseToken); f.advance(31000);
  await f.service.tick(); assert.equal((await f.service.prompts("margaret")).length, 1);
});
test("worker does not claim another household's jobs", async () => {
  const f = fixture();
  await f.store.insert("prompt_jobs", { _id: "foreign", householdId: "other", subjectId: "margaret", status: "pending", dueAt: f.now() });
  await f.service.tick();
  assert.equal((await f.store.one("prompt_jobs", { _id: "foreign" })).status, "pending");
});
test("fresh context generates one intention prompt; repeated check-ins don't repeat", async () => {
  const f = fixture(); await seedDemo(f.service);
  await f.service.context({ subjectId: "margaret", eventId: "desk_1", placeId: "desk", observedAt: f.now().toISOString() });
  await f.service.tick();
  assert.equal((await f.service.prompts("margaret")).filter(p => p.reason === "context_match").length, 1);
  await f.service.context({ subjectId: "margaret", eventId: "desk_2", placeId: "desk", observedAt: f.now().toISOString() });
  await f.service.tick();
  assert.equal((await f.store.list("prompts")).length, 1);
});
test("context prompt expires with observation, not with long-lived plan", async () => {
  const f = fixture(); await seedDemo(f.service);
  await f.service.context({ subjectId: "margaret", eventId: "desk_1", placeId: "desk", observedAt: f.now().toISOString() });
  await f.service.tick(); f.advance(121000);
  assert.equal((await f.service.prompts("margaret")).filter(p => p.reason === "context_match").length, 0);
});
test("stale and future context rejected", async () => {
  const f = fixture();
  for (const delta of [-121000, 11000]) await assert.rejects(f.service.context({ subjectId: "margaret", eventId: "bad", placeId: "desk", observedAt: new Date(+f.now() + delta).toISOString() }), /fresh/);
});
test("stream candidates require a corresponding original context event", async () => {
  const f = fixture({ contextProcessing: "atlas" }); await seedDemo(f.service);
  await f.store.insert("assistance_candidates", { _id: "forged", householdId: f.cfg.householdId, subjectId: "margaret", status: "pending", placeId: "desk", observedAt: f.now() });
  await f.service.tick(); assert.equal((await f.store.list("prompts")).length, 0);
});
test("Atlas context mode waits for a marked candidate (simulated fixture)", async () => {
  const f = fixture({ contextProcessing: "atlas" }); await seedDemo(f.service);
  await f.service.context({ subjectId: "margaret", eventId: "desk_1", placeId: "desk", observedAt: f.now().toISOString() });
  await f.service.tick(); assert.equal((await f.store.list("prompts")).length, 0);
  const event = await f.store.one("context_events", { _id: "desk_1" });
  await f.store.insert("assistance_candidates", { ...event, status: "pending", processingPath: "atlas_stream_processing", pipelineVersion: STREAM_PIPELINE_VERSION });
  await f.service.tick(); assert.equal((await f.service.prompts("margaret")).length, 1);
});
test("snooze hides prompt; acknowledgement doesn't complete plan", async () => {
  const f = fixture(); await visit(f); await f.service.tick();
  const prompt = (await f.service.prompts("margaret"))[0];
  await f.service.respond({ subjectId: "margaret", promptId: prompt._id, action: "snoozed" });
  assert.equal((await f.service.prompts("margaret")).length, 0);
  f.advance(61000);
  assert.equal((await f.service.prompts("margaret")).length, 1);
  await f.service.respond({ subjectId: "margaret", promptId: prompt._id, action: "acknowledged" });
  assert.equal((await f.store.one("plans", { _id: "visit" })).eventStatus, "planned");
});
test("self-reported completion stays explicitly self-reported", async () => {
  const f = fixture(); await visit(f); await f.service.tick();
  const prompt = (await f.service.prompts("margaret"))[0];
  await f.service.respond({ subjectId: "margaret", promptId: prompt._id, action: "self_reported_done" });
  assert.equal((await f.store.one("plans", { _id: "visit" })).eventStatus, "self_reported_done");
  assert.equal((await f.service.prompts("margaret")).length, 0);
});
test("recall returns scoped source evidence and a missing-record fallback", async () => {
  const f = fixture(); await seedDemo(f.service);
  const found = await f.service.recall({ subjectId: "margaret", query: "Priya flowers" });
  assert.equal(found.status, "candidates_found"); assert.equal(found.evidence.length, 1);
  assert.equal(found.evidence[0].sources[0].sourceType, "caregiver_report");
  const absent = await f.service.recall({ subjectId: "margaret", query: "Did I go to the park yesterday?" });
  assert.equal(absent.status, "no_record"); assert.match(absent.fallback, /don't have a saved record/);
});
test("date filtering separates similar days", async () => {
  const f = fixture(); await seedDemo(f.service);
  const result = await f.service.recall({ subjectId: "margaret", query: "Priya", from: "2026-10-24T00:00:00Z", to: "2026-10-25T00:00:00Z" });
  assert.equal(result.evidence.length, 0);
});
test("drafts, superseded records, foreign records and missing sources are excluded", async () => {
  const f = fixture(); const seed = await seedDemo(f.service);
  await f.store.update("episodes", { _id: seed.episodeId }, { reviewStatus: "draft" });
  assert.equal((await f.service.recall({ subjectId: "margaret", query: "Priya" })).evidence.length, 0);
  await f.store.update("episodes", { _id: seed.episodeId }, { reviewStatus: "approved", householdId: "foreign" });
  assert.equal((await f.service.recall({ subjectId: "margaret", query: "Priya" })).evidence.length, 0);
  await f.store.update("episodes", { _id: seed.episodeId }, { householdId: f.cfg.householdId, sourceIds: ["missing"] });
  assert.equal((await f.service.recall({ subjectId: "margaret", query: "Priya" })).evidence.length, 0);
});
test("unauthorized subject and cross-household source rejected", async () => {
  const f = fixture();
  await assert.rejects(f.service.recall({ subjectId: "other", query: "Priya" }), /not authorized/);
  await f.store.insert("sources", { _id: "foreign", householdId: "other", subjectId: "margaret", content: "test" });
  await assert.rejects(f.service.addEpisode({ subjectId: "margaret", summary: "test", sourceIds: ["foreign"], eventStart: f.now().toISOString() }), /outside scope/);
});
test("provider failure is not reported as no memory", async () => {
  const f = fixture(); f.store.mode = "mongodb"; f.store.search = async () => { throw new Error("provider down"); };
  await assert.rejects(f.service.recall({ subjectId: "margaret", query: "Priya" }), error => error.status === 503);
});
test("partial search failure is explicit and empty result remains incomplete", async () => {
  const f = fixture(); f.store.mode = "mongodb";
  f.store.search = async (_s, _q, _o, method) => { if (method === "vector") throw new Error(); return []; };
  const result = await f.service.recall({ subjectId: "margaret", query: "park" });
  assert.equal(result.status, "retrieval_incomplete"); assert.match(result.fallback, /couldn't check/);
});
test("rank fusion merges by ID without mixing raw score scales", () => {
  const results = fuse({ text: [{ _id: "a" }, { _id: "b" }], vector: [{ _id: "b" }, { _id: "c" }] });
  assert.equal(results[0]._id, "b"); assert.deepEqual(results[0].methods, ["text", "vector"]);
});
test("Atlas pipelines prefilter both branches and auto mode does not call embedding API", async () => {
  const f = fixture(); const scope = f.service.scope("margaret");
  const options = { from: new Date("2026-10-23T00:00:00Z") };
  const text = textPipeline(f.cfg, scope, "flowers", options);
  assert.ok(text[0].$search.compound.filter.some(x => x.equals?.path === "householdId"));
  const vector = await vectorPipeline({ ...f.cfg, embeddingMode: "auto" }, scope, "flowers", options);
  assert.deepEqual(vector[0].$vectorSearch.query, { text: "flowers" });
  assert.equal(vector[0].$vectorSearch.filter.householdId, scope.householdId);
});
test("overnight quiet hours evaluate in configured timezone", () => {
  const cfg = { timezone: "Asia/Kolkata", quietStart: "22:00", quietEnd: "07:00" };
  assert.equal(isQuiet(new Date("2026-10-24T18:00:00Z"), cfg), true);
  assert.equal(isQuiet(new Date("2026-10-24T06:00:00Z"), cfg), false);
});
test("HTTP auth, caregiver permissions, validation and integration routes", async t => {
  const f = fixture(); const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, payload) => fetch(base + path, {
    method: payload ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  assert.equal((await request("/api/prompts?subjectId=margaret", "wrong")).status, 401);
  assert.equal((await request("/admin/demo/seed", f.cfg.companionToken, {})).status, 403);
  assert.equal((await request("/admin/demo/seed", f.cfg.adminToken, {})).status, 201);
  const response = await request("/api/recall", f.cfg.companionToken, { subjectId: "margaret", query: "flowers" });
  assert.equal(response.status, 200); assert.equal((await response.json()).evidence.length, 1);
  assert.equal((await request("/api/recall", f.cfg.companionToken, { subjectId: "margaret", query: { $ne: null } })).status, 400);
  assert.equal((await request("/api/prompts?subjectId=other", f.cfg.companionToken)).status, 403);
  const forbidden = await fetch(base + "/health", { headers: { Origin: "https://untrusted.example" } });
  assert.equal(forbidden.status, 403);
});
test("citation validation rejects forged sources and malformed model output", async () => {
  const f = fixture(); await seedDemo(f.service);
  const retrieval = await f.service.recall({ subjectId: "margaret", query: "flowers" });
  const episode = retrieval.evidence[0];
  const claim = { text: "Priya visited.", citations: [{ episodeId: episode.episodeId, sourceId: episode.sources[0].id }] };
  assert.equal(validateCitations(retrieval, { claims: [claim] }).allowed, true);
  assert.equal(validateCitations(retrieval, { claims: [{ ...claim, citations: [{ episodeId: episode.episodeId, sourceId: "invented" }] }] }).allowed, false);
  assert.equal(validateCitations(retrieval, { claims: [null] }).allowed, false);
  assert.equal(validateCitations(retrieval, { claims: [{ ...claim, citations: [null] }] }).allowed, false);
});
test("cooldown defers another prompt rather than dropping it", async () => {
  const f = fixture({ cooldownSeconds: 30 }); await seedDemo(f.service);
  await f.service.context({ subjectId: "margaret", eventId: "desk", placeId: "desk", observedAt: f.now().toISOString() });
  await f.service.tick(); assert.equal((await f.store.list("prompts")).length, 1);
  f.advance(16000); await f.service.tick();
  assert.equal((await f.store.list("prompts")).length, 1);
  f.advance(31000); await f.service.tick();
  assert.equal((await f.store.list("prompts")).length, 2);
});
test("superseded canonical record is excluded even if a search index still returns it", async () => {
  const f = fixture(); const seed = await seedDemo(f.service);
  const stale = await f.store.one("episodes", { _id: seed.episodeId });
  await f.store.update("episodes", { _id: seed.episodeId }, { isCurrent: false });
  f.store.mode = "mongodb"; f.store.search = async () => [stale];
  const result = await f.service.recall({ subjectId: "margaret", query: "flowers" });
  assert.equal(result.evidence.length, 0);
});
