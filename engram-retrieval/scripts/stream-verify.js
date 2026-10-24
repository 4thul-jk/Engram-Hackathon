import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { STREAM_PIPELINE_VERSION } from "../src/stream-pipeline.js";

const runId = `stream_${randomUUID().replaceAll("-", "")}`;
const cfg = { ...config(), mode: "mongodb", householdId: runId, subjectIds: ["fixture"], contextProcessing: "atlas",
  quietStart: "22:00", quietEnd: "22:00", cooldownSeconds: 0 };
const store = await createStore(cfg);
const service = new EngramService(store, cfg);
try {
  const now = Date.now(), planId = `${runId}_plan`, eventId = `${runId}_event`;
  await service.createPlan({ subjectId: "fixture", id: planId, kind: "photo_album", triggerType: "context", placeId: "desk",
    eventStart: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 180000).toISOString() });
  const event = { subjectId: "fixture", eventId, placeId: "desk", observedAt: new Date().toISOString() };
  await service.context(event);
  console.log(JSON.stringify({ phase: "waiting_for_atlas_processor", runId, timeoutSeconds: 60, localCandidateCreation: false }));
  let candidate;
  for (let attempt = 0; attempt < 30; attempt++) {
    candidate = await store.one("assistance_candidates", { _id: eventId, householdId: runId, subjectId: "fixture" });
    if (candidate) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!candidate) throw new Error("StreamCandidateTimeout");
  assert.equal(candidate.processingPath, "atlas_stream_processing");
  assert.equal(candidate.pipelineVersion, STREAM_PIPELINE_VERSION);
  await service.tick();
  let prompts = await service.prompts("fixture");
  assert.equal(prompts.length, 1); assert.equal(prompts[0].reason, "context_match");
  assert.equal((await service.context(event)).duplicate, true);
  await service.tick(); assert.equal((await service.prompts("fixture")).length, 1);
  await service.cancelPlan({ subjectId: "fixture", planId });
  prompts = await service.prompts("fixture"); assert.equal(prompts.length, 0);
  console.log(JSON.stringify({ passed: true, verifiedAt: new Date().toISOString(), runId, pipelineVersion: STREAM_PIPELINE_VERSION,
    checks: ["externally_produced_candidate_marker", "context_prompt_created", "retry_no_duplicate", "cancellation_suppresses_delivery"],
    featuresUsed: ["atlas_stream_processing"], localFallbackDisabled: true, fictionalFixturesRetained: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, runId, errorType: error.name,
    reason: error.message === "StreamCandidateTimeout" ? "candidate_timeout" : "verification_failed",
    action: "Check workspace, running processor, Atlas connection name, pipeline version and database. Stream Processing is NOT verified by this run." }));
  process.exitCode = 1;
} finally { await store.close(); }
