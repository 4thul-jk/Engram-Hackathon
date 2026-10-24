import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { TeamContract } from "../src/team-contract.js";
import { TriggerContract } from "../src/trigger-contract.js";
import { LifeRecords } from "../src/life-records.js";
import { MemoryContext } from "../src/memory-context.js";

// Fictional fixtures in a unique household, never the active patient household.
// Atlas fixtures remain for review; no automatic deletion is performed.
const live = process.argv.includes("--atlas");
const runId = `verify_${randomUUID().replaceAll("-", "")}`;
const cfg = { ...config(), mode: live ? "mongodb" : "memory", householdId: runId, subjectIds: ["fixture"],
  contextProcessing: "local", cooldownSeconds: 0, quietStart: "22:00", quietEnd: "22:00" };
let now = new Date();
const store = await createStore(cfg);
const service = new EngramService(store, cfg, () => new Date(now));
const team = new TeamContract(service), triggers = new TriggerContract(service);
const checks = [];
const pass = name => checks.push(name);
try {
  const episode = { id: `${runId}_memory`, patient_id: "fixture", start: new Date(+now - 600000).toISOString(),
    end: new Date(+now - 590000).toISOString(), gist: "A fictional brass compass was put on the desk.",
    people: [], status: "auto", evidence: { text: "FICTIONAL VERIFICATION: I put the brass compass on the desk.", source_type: "user_report" } };
  await team.ingest(episode);
  const query = { patient_id: "fixture", query: "brass compass" };
  assert.equal((await team.retrieve(query)).episodes.length, 0); pass("draft_excluded");
  await team.review({ patient_id: "fixture", id: episode.id, status: "carer_verified" });
  let result;
  for (let i = 0; i < (live ? 30 : 1); i++) {
    result = await team.retrieve(query);
    if (result.episodes.some(e => e.id === episode.id)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(result.episodes.some(e => e.id === episode.id));
  assert.equal(result.retrieval_complete, true); pass("approved_memory_with_source");
  assert.equal((await team.ingest(episode)).created, false); pass("ingestion_retry_deduplicated");
  const life = new LifeRecords(service);
  await life.addLog({ patient_id: "fixture", id: `${runId}_log`, activity: "exercise", label: "Fictional walk", outcome: "reported_done", occurred_at: now.toISOString(), original_text: "FICTIONAL REPORT: I walked in the garden." });
  await life.review({ patient_id: "fixture", collection: "daily_logs", id: `${runId}_log`, status: "approved" });
  await life.addPersonal({ patient_id: "fixture", id: `${runId}_fact`, kind: "preference", title: "Fictional tea preference", original_text: "FICTIONAL REPORT: I like tea without sugar." });
  await life.review({ patient_id: "fixture", collection: "personal_records", id: `${runId}_fact`, status: "approved" });
  const combined = await new MemoryContext(service).retrieve({ patient_id: "fixture", query: "brass compass" });
  assert.equal(combined.status, "context_ready");
  assert.equal(combined.sections.episodes.records.length, 1);
  assert.equal(combined.sections.daily_logs.records[0].sourceType, "user_report");
  assert.equal(combined.sections.personal_records.records[0].kind, "preference");
  assert.equal(combined.sections.plans.status, "empty"); pass("unified_context_preserves_typed_records");
  await team.review({ patient_id: "fixture", id: episode.id, status: "auto" });
  assert.equal((await team.retrieve(query)).episodes.length, 0); pass("withdrawn_approval_excluded");
  await triggers.create({ patient_id: "fixture", id: `${runId}_time`, status: "carer_verified", kind: "photo_album", trigger_type: "time",
    due_at: now.toISOString(), event_start: now.toISOString(), expires_at: new Date(+now + 300000).toISOString() });
  await service.tick(); await service.tick();
  let prompts = (await triggers.poll({ patient_id: "fixture" })).prompts;
  assert.equal(prompts.length, 1); pass("time_trigger_once");
  await triggers.respond({ patient_id: "fixture", prompt_id: prompts[0]._id, action: "snoozed" });
  assert.equal((await triggers.poll({ patient_id: "fixture" })).prompts.length, 0);
  now = new Date(+now + 61000);
  assert.equal((await triggers.poll({ patient_id: "fixture" })).prompts.length, 1); pass("snooze_and_return");
  await triggers.respond({ patient_id: "fixture", prompt_id: prompts[0]._id, action: "acknowledged" });
  assert.equal((await store.one("plans", { _id: `${runId}_time` })).eventStatus, "planned"); pass("acknowledgement_not_completion");
  await triggers.create({ patient_id: "fixture", id: `${runId}_context`, status: "carer_verified", kind: "photo_album", trigger_type: "context", place_id: "desk",
    event_start: now.toISOString(), expires_at: new Date(+now + 300000).toISOString() });
  const event = { patient_id: "fixture", event_id: `${runId}_checkin`, place_id: "desk", observed_at: now.toISOString() };
  await triggers.context(event); assert.equal((await triggers.context(event)).duplicate, true);
  await service.tick();
  prompts = (await triggers.poll({ patient_id: "fixture" })).prompts;
  assert.equal(prompts.length, 1); assert.equal(prompts[0].reason, "context_match"); pass("context_trigger_once");
  await triggers.cancel({ patient_id: "fixture", plan_id: `${runId}_context` });
  assert.equal((await triggers.poll({ patient_id: "fixture" })).prompts.length, 0); pass("cancellation_suppresses_prompt");
  console.log(JSON.stringify({ passed: true, verifiedAt: new Date().toISOString(), mode: cfg.mode, runId, checks,
    featuresUsed: result.features_used, controlledClock: true, quietHoursDisabledOnlyForIsolatedFixture: true,
    fixturesRetained: live }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, runId, completedChecks: checks, errorType: error.name,
    action: "Check indexes, database access and failing core assertion; no secrets logged." }));
  process.exitCode = 1;
} finally { await store.close(); }
