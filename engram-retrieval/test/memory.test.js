import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { TeamContract } from "../src/team-contract.js";
import { RehearsalService } from "../src/rehearsal.js";
import { retention, updateStability, nextDueAt, dayBounds, localDayKey } from "../src/memory-model.js";
import { makeServer } from "../src/server.js";

function fixture() {
  let now = new Date("2026-10-24T12:00:00Z");
  const cfg = { ...config(), mode: "memory", householdId: "test", subjectIds: ["margaret"], rerank: false, timezone: "Europe/London" };
  const store = new MemoryStore();
  const service = new EngramService(store, cfg, () => new Date(now));
  const team = new TeamContract(service), practice = new RehearsalService(service);
  async function episode(index, changes = {}) {
    return team.ingest({ id: `episode_${index}`, patient_id: "margaret", start: "2026-10-22T09:00:00Z", people: [],
      gist: `A fictional garden visit ${index}`, confidence: 0.9, salience: 0.8, status: "carer_verified",
      evidence: { text: `Fictional source ${index}: garden visit`, source_type: "caregiver_report" }, ...changes });
  }
  return { cfg, store, service, team, practice, episode, advance: ms => { now = new Date(+now + ms); } };
}
test("memory formula: unaided gain, answer shown no gain, failed recall floor", () => {
  assert.equal(updateStability(1, 0, true), 2.5);
  assert.equal(updateStability(1, 3, true), 1);
  assert.equal(updateStability(2, 2, true), 3);
  assert.equal(updateStability(1, 1, false), 0.5);
  assert.equal(updateStability(0.5, 3, false), 0.5);
});
test("retention is derived from elapsed time; due time matches target", () => {
  const start = new Date("2026-10-24T12:00:00Z");
  assert.equal(retention(0, 1), 1);
  assert.ok(retention(2, 1) < retention(1, 1));
  const due = nextDueAt(start, 1);
  assert.ok(Math.abs(retention((+due - +start) / 86400000, 1) - 0.7) < 1e-7);
  assert.throws(() => updateStability(1, 4, true));
  assert.throws(() => retention(-1, 1));
  assert.throws(() => nextDueAt(start, 1, 1));
});
test("local-day boundaries handle London's daylight-saving transition", () => {
  const london = dayBounds("2026-10-25", "Europe/London");
  assert.equal((+london.end - +london.start) / 3600000, 25);
  const india = dayBounds("2026-10-25", "Asia/Kolkata");
  assert.equal((+india.end - +india.start) / 3600000, 24);
  assert.equal(localDayKey(new Date("2026-10-24T19:00:00Z"), "Asia/Kolkata"), "2026-10-25");
  assert.throws(() => dayBounds("2026-02-30", "Europe/London"));
});
test("daily selection is capped at three and repeated generation preserves snapshot", async () => {
  const f = fixture(); for (let index = 0; index < 5; index++) await f.episode(index);
  const first = await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  assert.equal(first.episodes.length, 3);
  await f.episode("important", { salience: 1 });
  const second = await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  assert.deepEqual(second.episodes.map(e => e.id), first.episodes.map(e => e.id));
  assert.equal((await f.store.list("rehearsal_sets")).length, 1);
});
test("low or unknown confidence, draft and uninspected media excluded", async () => {
  const f = fixture();
  await f.episode("good");
  await f.episode("low", { confidence: 0.2 });
  await f.episode("unknown", { confidence: null });
  await f.episode("draft", { status: "auto" });
  await f.episode("media", { evidence: undefined, media_ptr: "private/clip.mp4" });
  const result = await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  assert.deepEqual(result.episodes.map(e => e.id), ["episode_good"]);
});
test("withdrawn episode disappears without adding a replacement to daily set", async () => {
  const f = fixture(); for (let index = 0; index < 4; index++) await f.episode(index);
  const first = await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const removed = first.episodes[0].id;
  await f.team.review({ patient_id: "margaret", id: removed, status: "auto" });
  const next = await f.practice.getSet({ patient_id: "margaret", day: "2026-10-24" });
  assert.equal(next.episodes.length, 2); assert.ok(!next.episodes.some(e => e.id === removed));
});
test("attempt updates state once, preserves retry and distinguishes answer shown", async () => {
  const f = fixture(); await f.episode(1); await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const input = { patient_id: "margaret", episode_id: "episode_1", attempt_id: "attempt1", cue_level: 3, outcome: "recalled" };
  const first = await f.practice.attempt(input), second = await f.practice.attempt(input);
  assert.equal(first.state.stabilityDays, 1); assert.equal(first.state.version, 1);
  assert.equal(second.state.version, 1); assert.equal(second.state.attempts, 1);
  await assert.rejects(f.practice.attempt({ ...input, attempt_id: "attempt2" }), /already practiced/);
  await assert.rejects(f.practice.attempt({ ...input, outcome: "not_recalled" }), /different content/);
});
test("skip consumes one daily slot without changing stability or rehearsal timestamp", async () => {
  const f = fixture(); await f.episode(1); await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const before = await f.practice.readState({ patient_id: "margaret", episode_id: "episode_1" });
  const result = await f.practice.attempt({ patient_id: "margaret", episode_id: "episode_1", attempt_id: "skip1", cue_level: 0, outcome: "skipped" });
  assert.equal(result.state.stabilityDays, before.stabilityDays);
  assert.equal(result.state.lastRehearsalAt, null);
  assert.equal(result.state.attempts, 0);
  assert.equal(+result.state.nextDueAt, +before.nextDueAt);
});
test("failed recall reduces stability; unaided recall increases it", async () => {
  const f = fixture(); await f.episode(1); await f.episode(2);
  await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const failed = await f.practice.attempt({ patient_id: "margaret", episode_id: "episode_1", attempt_id: "failed1", cue_level: 2, outcome: "not_recalled" });
  assert.equal(failed.state.stabilityDays, 0.5);
  const success = await f.practice.attempt({ patient_id: "margaret", episode_id: "episode_2", attempt_id: "success1", cue_level: 0, outcome: "recalled" });
  assert.equal(success.state.stabilityDays, 2.5);
});
test("interrupted attempt recovers from immutable attempt and slot", async () => {
  const f = fixture(); await f.episode(1); await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const realUpdate = f.store.update.bind(f.store); let fail = true;
  f.store.update = async (...args) => { if (args[0] === "memory_state" && fail) { fail = false; throw new Error("simulated crash"); } return realUpdate(...args); };
  const input = { patient_id: "margaret", episode_id: "episode_1", attempt_id: "recover", cue_level: 0, outcome: "recalled" };
  await assert.rejects(f.practice.attempt(input), /simulated crash/);
  const recovered = await f.practice.attempt(input);
  assert.equal(recovered.state.version, 1); assert.equal(recovered.state.stabilityDays, 2.5);
});
test("concurrent same attempt applies once; competing ID loses daily slot", async () => {
  const f = fixture(); await f.episode(1); await f.practice.generate({ patient_id: "margaret", day: "2026-10-24" });
  const input = { patient_id: "margaret", episode_id: "episode_1", attempt_id: "same", cue_level: 0, outcome: "recalled" };
  await Promise.all([f.practice.attempt(input), f.practice.attempt(input)]);
  const state = await f.practice.readState({ patient_id: "margaret", episode_id: "episode_1" });
  assert.equal(state.version, 1); assert.equal(state.stabilityDays, 2.5);
  await assert.rejects(f.practice.attempt({ ...input, attempt_id: "competing" }), /already practiced/);
});
test("not-generated, future day, unauthorized subject and unselected attempt handled", async () => {
  const f = fixture(); await f.episode(1);
  assert.equal((await f.practice.getSet({ patient_id: "margaret" })).status, "not_generated");
  await assert.rejects(f.practice.generate({ patient_id: "margaret", day: "2026-10-26" }), /today's or tomorrow's/);
  await assert.rejects(f.practice.generate({ patient_id: "other" }), error => error.status === 403);
  await assert.rejects(f.practice.attempt({ patient_id: "margaret", episode_id: "episode_1", attempt_id: "a", cue_level: 0, outcome: "recalled" }), /today's practice set/);
});
test("default nightly list targets tomorrow without scheduling patient notifications", async () => {
  const f = fixture(); await f.episode(1);
  const result = await f.practice.generate({ patient_id: "margaret" });
  assert.equal(result.day, "2026-10-25"); assert.equal(result.episodes.length, 1);
  assert.equal((await f.store.list("prompt_jobs")).length, 0);
});
test("rehearsal API requires caregiver generation and accepts companion attempt logs", async t => {
  const f = fixture(); await f.episode(1);
  const server = makeServer(f.service, f.cfg);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, value, admin = false) => {
    const response = await fetch(base + path, { method: value ? "POST" : "GET", headers: {
      Authorization: `Bearer ${admin ? f.cfg.adminToken : f.cfg.companionToken}`, "Content-Type": "application/json"
    }, ...(value ? { body: JSON.stringify(value) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call("/admin/rehearsals/generate", { patient_id: "margaret" })).status, 403);
  assert.equal((await call("/admin/rehearsals/generate", { patient_id: "margaret", day: "2026-10-24" }, true)).status, 200);
  const list = await call("/rehearsals?patient_id=margaret&day=2026-10-24");
  assert.equal(list.body.episodes.length, 1);
  const result = await call("/recall-attempts", { patient_id: "margaret", episode_id: "episode_1", attempt_id: "http1", cue_level: 0, outcome: "recalled" });
  assert.equal(result.body.state.stabilityDays, 2.5);
});
