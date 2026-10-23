import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { TeamContract } from "../src/team-contract.js";
import { makeServer } from "../src/server.js";
import { validateCitations } from "../src/grounding.js";

function fixture() {
  const cfg = { ...config(), mode: "memory", householdId: "test-household", subjectIds: ["margaret"], rerank: false };
  const store = new MemoryStore();
  const service = new EngramService(store, cfg, () => new Date("2026-10-24T12:00:00Z"));
  const team = new TeamContract(service);
  const input = { id: "episode_team", patient_id: "margaret", start: "2026-10-24T09:00:00Z", end: "2026-10-24T09:01:00Z",
    place: "living_room", people: [], what: "Object placement", gist: "Glasses were left on the bookshelf.",
    salience: 0.7, confidence: 0.9, status: "auto", media_ptr: "private/demo/glasses.mp4",
    evidence: { text: "DEMO report: I left the glasses on the bookshelf.", source_type: "user_report" } };
  return { cfg, store, service, team, input };
}
test("team episode round-trips metadata, waits for review and returns source evidence", async () => {
  const f = fixture();
  const saved = await f.team.ingest(f.input);
  assert.equal(saved.created, true); assert.equal(saved.episode.status, "auto");
  assert.equal(saved.episode.confidence, 0.9); assert.equal(saved.episode.media_ptr, f.input.media_ptr);
  const request = { patient_id: "margaret", query: "glasses", time_range: { start: "2026-10-24T00:00:00Z", end: "2026-10-25T00:00:00Z" } };
  assert.deepEqual((await f.team.retrieve(request)).episodes, []);
  await f.team.review({ patient_id: "margaret", id: f.input.id, status: "carer_verified" });
  const result = await f.team.retrieve(request);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].id, f.input.id);
  assert.equal(result.episodes[0].place, "living_room");
  assert.equal(result.episodes[0].confidence, 0.9);
  assert.equal(result.episodes[0].evidence[0].text, f.input.evidence.text);
  assert.equal(result.episodes[0].evidence[0].inspection_required, false);
});
test("retries reuse episode/source and never undo caregiver review", async () => {
  const f = fixture(); await f.team.ingest(f.input);
  await f.team.review({ patient_id: "margaret", id: f.input.id, status: "carer_verified" });
  const replay = await f.team.ingest(f.input);
  assert.equal(replay.created, false); assert.equal(replay.episode.status, "carer_verified");
  assert.equal((await f.store.list("episodes")).length, 1);
  assert.equal((await f.store.list("sources")).length, 1);
  await assert.rejects(f.team.ingest({ ...f.input, gist: "Changed story" }), error => error.status === 409);
});
test("concurrent identical episode retries do not duplicate evidence", async () => {
  const f = fixture();
  const results = await Promise.all([f.team.ingest(f.input), f.team.ingest(f.input)]);
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal((await f.store.list("sources")).length, 1);
});
test("media-only input stays uninspected and cannot pass text citation gate", async () => {
  const f = fixture(); const { evidence, ...input } = f.input;
  await f.team.ingest({ ...input, status: "carer_verified" });
  const result = await f.service.recall({ subjectId: "margaret", query: "glasses" });
  assert.equal(result.evidence[0].sources[0].content, null);
  assert.equal(result.evidence[0].sources[0].inspectionRequired, true);
  const claim = { text: "Glasses are on the bookshelf.", citations: [{ episodeId: f.input.id, sourceId: result.evidence[0].sources[0].id }] };
  assert.equal(validateCitations(result, { claims: [claim] }).allowed, false);
});
test("gist alone is not accepted as original evidence", async () => {
  const f = fixture(); const { evidence, media_ptr, ...input } = f.input;
  await assert.rejects(f.team.ingest(input), /gist alone is not evidence/);
  assert.equal((await f.store.list("sources")).length, 0);
});
test("confidence threshold is explicit and invalid values rejected", async () => {
  const f = fixture(); await f.team.ingest({ ...f.input, status: "carer_verified" });
  assert.equal((await f.team.retrieve({ patient_id: "margaret", query: "glasses", min_confidence: 0.95 })).episodes.length, 0);
  assert.equal((await f.team.retrieve({ patient_id: "margaret", query: "glasses", min_confidence: 0.8 })).episodes.length, 1);
  for (const confidence of [2, -1, "0.9"]) await assert.rejects(f.team.ingest({ ...f.input, id: "invalid", confidence }), /between 0 and 1/);
});
test("unknown people, foreign patients, future events and bad ranges are rejected", async () => {
  const f = fixture();
  await assert.rejects(f.team.ingest({ ...f.input, people: ["unknown"] }), /existing person IDs/);
  await assert.rejects(f.team.ingest({ ...f.input, patient_id: "arthur" }), error => error.status === 403);
  await assert.rejects(f.team.ingest({ ...f.input, start: "2026-10-25T09:00:00Z" }), /past event/);
  await assert.rejects(f.team.retrieve({ patient_id: "margaret", query: "glasses", time_range: { start: "2026-10-25T00:00:00Z", end: "2026-10-24T00:00:00Z" } }), /precede/);
  await assert.rejects(f.team.ingest({ ...f.input, embedding: [0.1, 0.2] }), /Do not submit embedding/);
});
test("review revocation immediately excludes stale indexed episode", async () => {
  const f = fixture(); await f.team.ingest({ ...f.input, status: "carer_verified" });
  const stale = await f.store.one("episodes", { _id: f.input.id });
  await f.team.review({ patient_id: "margaret", id: f.input.id, status: "auto" });
  f.store.mode = "mongodb"; f.store.search = async () => [stale];
  assert.equal((await f.team.retrieve({ patient_id: "margaret", query: "glasses" })).episodes.length, 0);
});
test("team HTTP endpoints require caregiver ingestion/review and support companion retrieval", async t => {
  const f = fixture(), server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, input, token = f.cfg.adminToken) => {
    const response = await fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call("/episodes", f.input, f.cfg.companionToken)).status, 403);
  assert.equal((await call("/episodes", f.input)).status, 201);
  assert.equal((await call("/episodes", f.input)).status, 200);
  const review = { patient_id: "margaret", id: f.input.id, status: "carer_verified" };
  assert.equal((await call("/episodes/review", review, f.cfg.companionToken)).status, 403);
  assert.equal((await call("/episodes/review", review)).status, 200);
  const result = await call("/retrieve", { patient_id: "margaret", query: "glasses" }, f.cfg.companionToken);
  assert.equal(result.status, 200); assert.equal(result.body.episodes[0].id, f.input.id);
  const missing = await call("/retrieve", { patient_id: "margaret", query: "penguin" }, f.cfg.companionToken);
  assert.deepEqual(missing.body.episodes, []); assert.equal(missing.body.status, "no_record");
});
