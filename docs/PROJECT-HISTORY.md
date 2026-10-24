# Project history and build ledger

This ledger records the retrieval/trigger component built in this chat, not every teammate's work. It separates durable Git checkpoints from the earlier development sequence reconstructed from the session. **Commit time is a recorded Git timestamp, not proof of when every line was first written or when a push happened.** No exact start/end times are invented for uncommitted steps.

## Repository and working copies

- Canonical tracked checkout: `hackathon/Engram-Hackathon/`.
- Component: `Engram-Hackathon/engram-retrieval/`.
- Earlier standalone working copy: `hackathon/engram-retrieval/`. It was synchronized after changes, but is not the authoritative Git checkout. Make future edits in the tracked checkout to avoid divergence.
- Remote: `https://github.com/4thul-jk/Engram-Hackathon.git`; branch: `main`.
- Root README is the entry point; the component README describes setup. This document explains what changed and why; [PROCESS.md](PROCESS.md) explains how the code executes; [BACKTRACKING.md](BACKTRACKING.md) explains inspection and recovery.

## Verified checkpoints

IST means Asia/Kolkata (UTC+05:30). London times below are BST (UTC+01:00) on **23 October**. Both columns refer to the same instants.

| Step | Git checkpoint | IST: 24 Oct 2026 | London: 23 Oct 2026 | What the checkpoint contains | Verification recorded in the session |
|---|---|---|---|---|---|
| H1 | [e765601](https://github.com/4thul-jk/Engram-Hackathon/commit/e7656017e772cb9dbb88655156322ef801dc0ec3) | 00:33:27 | 20:03:27 | Initial published retrieval/trigger backend, team API adapter, fixtures, index and stream templates, README and handoff | 36 tests passed; local browser retrieval and scheduled/context prompts observed; contract demo passed |
| H2 | [8a9ee92](https://github.com/4thul-jk/Engram-Hackathon/commit/8a9ee920bdb29f2e9f6dd0aeec6309805f64d882) | 00:53:44 | 20:23:44 | Experimental stability model, recall-attempt logging, capped rehearsal sets, nightly command | 50 tests passed; live memory demo and next-review generation passed |
| H3 | [e3198b9](https://github.com/4thul-jk/Engram-Hackathon/commit/e3198b99dd917d754b2f9e04f5dbadba824091ee) | 00:56:28 | 20:26:28 | Corrected Atlas Automated Embedding release status; clarified native retrieval prerequisites | Documentation-only change; no new provider execution claimed |
| H4 | [415b59d](https://github.com/4thul-jk/Engram-Hackathon/commit/415b59d372c03605fc1706eaa2a5147a68acc7fe) | 01:02:46 | 20:32:46 | Native fusion, optional native reranking, explicit fallback, completion flags, diagnostic command | 59 tests passed; native provider behavior mocked/inspected, not live Atlas tested |
| H5 | [4afcc3b](https://github.com/4thul-jk/Engram-Hackathon/commit/4afcc3b) | 01:13:15 | 20:43:15 | Project history, executable process guide, backtracking runbook and history-report command | History command and local documentation links checked; runtime behavior unchanged |

To obtain exact author and committer times for H5 and later commits, run `npm run project:history` inside the component. The command reads live Git history; it avoids a hardcoded timestamp that would become inaccurate when the documentation is committed.

## Earlier build sequence (before H1)

These steps occurred in order in the working session. Exact per-step completion times were not committed, so they are intentionally marked **not recorded**.

| Step | Time evidence | Work done | Reason/result |
|---|---|---|---|
| B1 | Not recorded | Read the Engram proposal and clarified the user's responsibility | Scope became retrieval, source evidence and proactive triggers; media encoding and the conversational agent remained teammate responsibilities |
| B2 | Not recorded | Created a new standalone `engram-retrieval` folder | Existing workspace had no Engram app; independent service allowed teammates to integrate by HTTP |
| B3 | Not recorded | Added Node HTTP service, memory/Mongo stores, request validation, tokens and deployment scope | Local demo could run without keys; backend credentials stayed out of the patient-facing integration contract |
| B4 | Not recorded | Added sources, episodes, people, exact lookups, text/vector adapters and application rank fusion | Original evidence remained separate from generated summaries; missing records and failed retrieval had different responses |
| B5 | Not recorded | Added saved plans, jobs, a worker, context candidates and prompt response states | Assistance could be initiated by time/context instead of requiring a question |
| B6 | Not recorded | Added index creation, Automated Embedding/manual Voyage options and a Stream Processing template | Atlas features were prepared but not represented as live integrations |
| B7 | Not recorded | Built local developer console and fictional fixtures | Browser check showed retrieval, automatic visit reminder and explicit desk-check-in assistance |
| B8 | Not recorded | Tested auth, scheduling, cancellation, expiry, retry recovery and grounding | Initial loopback test failed because of sandbox networking; authorized loopback rerun passed. Suite grew through 24 and 27 tests |
| B9 | Not recorded | Added `/episodes`, `/episodes/review`, `/retrieve`, and field mapping | Aligned the team's `patient_id`/episode contract while preserving existing routes; suite grew to 36 |
| B10 | Commit time recorded at H1 | Prepared clean Git checkout, root README and upload ZIP; committed the component | Excluded `.env`, dependencies and unrelated workspace data |
| B11 | Push attempts recorded in session; exact times not retained | GitHub upload initially failed with 403 for the signed-in account; authentication/access was corrected and push succeeded | Authentication failure did not change implementation. H1 remains the initial code checkpoint |

The earlier upload ZIP is a **historical snapshot**. It is not regenerated after every new commit; use current GitHub `main` or export a chosen commit when sharing current code.

## Decisions and their consequences

**Subsequent live milestone:** on 24 October 2026 at 03:41:20.542 IST (23 October at 23:11:20.542 London), final runtime checks passed against Atlas. Both search indexes were ready; native fusion and automated embeddings retrieved an approved fictional record. Actual server version was 8.0.34. See [LIVE-ATLAS-VERIFICATION.md](LIVE-ATLAS-VERIFICATION.md) for the ordered setup/testing steps and their limits. This is a runtime timestamp, not a source-authoring timestamp.

| Decision | Introduced | Why | What to revisit |
|---|---|---|---|
| Local keyword mode is explicit | H1 | Permit integration without external credentials without pretending vectors run | Validate Atlas separately before a sponsor demo |
| Approval and canonical reload | H1 | A stale search index must not reintroduce withdrawn records | Add deletion cascade and production identity integration |
| Candidate search is not an answer | H1 | Similarity and citation IDs alone do not prove a claim | Teammate agent needs semantic support checks and evaluations |
| Narrow prompt templates | H1 | Demonstrate visits and photo-album intentions without arbitrary instructions | New routine types need explicit policy and validation |
| Clock worker separate from stream processing | H1 | A database change is different from time becoming due | Provision a durable deployment scheduler and delivery channel |
| Capped, opt-in practice | H2 | Bound the prototype and avoid repeated prompting | User research, consent/preferences and clinical evaluation |
| Ordinary attempt collection | H2 | Unique IDs and recovery flags support idempotent state updates | Evaluate time-series analytics separately; do not claim a time-series collection was implemented |
| Corrected blanket preview warning | H3 | Atlas GA announcement differs from self-managed preview notes | Check deployment-specific docs when configuring a cluster |
| Native fusion with observable fallback | H4 | Use Atlas-native retrieval when supported without losing the tested route | Run live diagnostics and evaluate relevance/latency |
| Native reranking OFF by default | H4 | Older 8.3 announcement and newer 9.0/model requirements differ | Confirm actual cluster/model support and project enablement |

## Verification boundaries

**Observed locally:** actual HTTP server, fictional text ingestion, approval filtering, memory retrieval, reminder generation, context prompt, response states, memory practice and nightly review generation.

**Covered by automated tests:** formula branches, timezone/DST boundaries, scope and approval checks, missing evidence, duplicate submissions, cancellation, snooze, job leases, practice caps/recovery and native pipeline/fallback construction.

**Live verification update:** Atlas connection, text/vector indexes, Automated Embedding and native fusion subsequently passed the fictional-record checks in [LIVE-ATLAS-VERIFICATION.md](LIVE-ATLAS-VERIFICATION.md). The server reported 8.0.34. Native reranking, external Voyage API reranking and Stream Processing are still not verified. The earlier 8.3-or-later report was not confirmed for this connection.

**Outside implemented scope:** capture/encoding with Gemini, face identity, full graph expansion, hot-caption buffer, WhatsApp/Saint workflow, medication/escalation engines, full caregiver console, media retention/deletion and clinical benefit. Native reranking tests do not replace a provider smoke test.

## Record future changes

### S1 — Stream Processing pipeline and verification tooling

- Checkpoint/time: Git metadata for the commit containing this entry. Previous checkpoint `5464b75`.
- Corrected source config syntax; added pipeline generator, scoped/time-filtered lookup, replay-safe merge and versioned processing-path markers. Atlas backend mode accepts the new marked output contract only; local mode unchanged.
- Commands: stream:prepare succeeded; npm test passed 99 tests after updating the existing simulated stream fixture to the versioned contract. Pipeline execution itself is not simulated as a claimed Atlas feature.
- Live stream:verify run stream_0bdeb733ba9e4983a93522070f258981 failed: no candidate arrived within its bounded polling attempts. Fictional source/plan fixtures retained. User confirmed workspace/connection have not been created. No workspace-management credentials or Atlas CLI available in environment. Stream Processing is NOT live verified.
- Remaining setup: create workspace, add engramAtlas connection, deploy/start EngramContext using generated JSON, rerun stream:verify. Leave active app CONTEXT_PROCESSING=local until verification passes. Exact steps and references: STREAM-PROCESSING.md.
- No paid workspace, permissions, main config or existing processor changed. Backtrack by reverting this commit; prior stream templates would require corresponding backend contract restoration.

### U1 — Unified memory-context API

- Verified 2026-10-24T00:03:35.156Z; commit/time via Git for the commit containing this entry. Previous checkpoint `61c9d2f`.
- Added POST /memory-context, client method, typed citation/evidence helpers, explicit section filters and partial/unavailable semantics. Caregiver contacts excluded; reports and intentions retain provenance.
- 95 automated tests passed. Expanded verify:core passed 10 checks on live Atlas in fictional household verify_2f7d6737fab649919c6ba784946f1029. No Gemini call or new index provisioning performed. HTTP checked separately in local tests.
- Handoff MEMORY-CONTEXT.md. Old /retrieve and /api/answer behaviour retained. Structured data is not silently promoted to event truth; snapshots can change after read.
- Scheduler, review queue and pushed delivery remain subsequent steps; device and game development remain parked.

### L1 — Daily logs and personal information

- Commit/time: Git metadata for the commit containing this entry. Previous checkpoint: `116f72c`.
- Added daily_logs and personal_records with patient-scoped APIs, provenance, immutable idempotent IDs and caregiver review/withdrawal. Linked familiar-person cards use existing people records, private image references and admin-only contacts. Patient facts/preferences enter as drafts.
- Daily views use configured timezone with DST-aware bounds; medication reports remain reports, not verified ingestion. No medication scheduling, face recognition or automatic clinical action introduced.
- 88 local tests passed, covering provenance, daily bounds, contact access, review/idempotency, patient scope, HTTP permissions and client mapping. Atlas index provisioning prepared but not run for these new collections. Structured agent routing still requires team integration; /retrieve does not silently search the new collections.
- Handoff: DAILY-AND-PERSONAL.md. New data is additive; revert code to backtrack, retaining collections for explicit retention decisions.

### C1 — Assigned scope completion: retrieval and triggers

- Verified 2026-10-23T22:51:19.065Z. Previous checkpoint: `3df312d`; exact commit time available through project:history.
- Parked device/guardian/demo development. Fixed context-event retry recovery after interrupted candidate creation; changed event contents now conflict instead of being silently accepted.
- Added verify:core with unique fictional household, controlled clock and explicit Atlas opt-in. 83 tests passed; all 9 core acceptance checks passed locally and on live Atlas. Live run `verify_97d774067aa847e69d5268a6415c3dac` retained for review.
- Live features: Atlas Search, Vector Search, native rank fusion, automated Voyage embedding. Quiet hours disabled only in verifier; no real-time or clinical claim. Details and scope boundaries: YOUR-PART-COMPLETE.md.
- No production configuration change or destructive migration. HTTP checked locally; new live workflow invokes services directly against MongoDB. Team website/audio connection remains external integration work.

### A1 — Device telemetry and assistance review

- Checkpoint/time: Git metadata for the commit containing this entry. Previous checkpoint: `f222dc8`.
- Added AssistanceService, authenticated endpoints and client methods for device registration, immutable scoped observations, latest-device freshness, explicit help requests and guardian acknowledgement. No actual tracking or external communication.
- Added index provisioning for devices, device_observations and assistance_requests; not applied to live Atlas in this checkpoint.
- Tests: 82 passed, including client-method mapping; controlled clock and local HTTP tests cover stale/unknown states, location validation, source attribution, idempotency, out-of-order observations, help acknowledgement and admin permissions. No live GPS, Atlas or calling test claimed.
- Backtracking: revert this commit and restart; new collections can remain unused. Deleting location history requires an explicit separate retention decision.
- Limitations: shared backend auth, no per-device credentials/revocation, no cross-ID rate control, no geofence detection, provider delivery or escalation; see DEVICE-ASSISTANCE.md.

### W1 — Website backend client

- Checkpoint/time: Git metadata for the commit containing this entry (`npm run project:history`). Preceding checkpoint: `cd1de9c`.
- Added server-side EngramClient for scoped retrieval, check-in, plans, cancellation and prompt responses; sequential cancellable prompt polling and a forwarding example for the teammate's existing website transport.
- Documentation: WEBSITE-INTEGRATION.md. No game interface, patient authentication service, new collections or database migration introduced.
- Validation: 76 tests passed. New tests cover field mapping, bound patient ID, polling deduplication/reappearance, abort, error handling and the real localhost HTTP workflow using an in-memory store. No new live Atlas/Gemini verification claimed.
- Limits: website authentication and SSE/WebSocket delivery remain team integration work. Pending prompts can repeat across reconnections; website must reconcile IDs and expiry. New-arrival watcher does not notify of cancellation; use full polling snapshots for card reconciliation.

### T1 — Team-facing trigger contract

- Checkpoint and exact time: Git metadata for the commit containing this entry (`npm run project:history`).
- Added patient_id adapters for approved plan creation/cancellation, place check-ins, prompt polling and responses. Existing routes and worker policy retained. No new collections or migration.
- Updated TEAM-HANDOFF.md with request examples, credentials, response shapes and polling guidance; corrected its outdated statement about the optional Gemini SDK.
- Validation: 71 tests passed. Four new local tests cover context-to-prompt delivery, event deduplication, acknowledgement semantics, cancelled plans, stale input, patient scope and HTTP admin enforcement. No new live Atlas or Gemini verification claimed.
- Backtrack: `f91c15c` is the preceding checkpoint.

### G1 — Gemini answer bridge

- Recorded at 2026-10-23T22:17:17Z (24 October 03:47:17 IST; 23 October 23:17:17 London). Checkpoint: the commit containing this entry.
- Added `POST /api/answer`, official Gemini SDK, configurable model, structured claims, explicit abstention and original text evidence filtering. Rechecks retrieval after generation to catch withdrawn approval.
- Handoff and flow diagram: [GEMINI-BRIDGE.md](../engram-retrieval/GEMINI-BRIDGE.md). Existing `/api/recall` remains available for a teammate-owned model call.
- Validation: `npm test`: 67 passed, including eight new bridge tests with an injected provider. SDK exposes Interactions locally. No live Gemini request was made; API key was absent at implementation time.
- Limitation: valid citations do not prove semantic entailment. Model access, actual provider response and live latency require a private key and live smoke test.
- Backtrack to `cb9ad78` for the preceding Atlas-verified checkpoint. No database migration or new collections in this step.

For each meaningful change, add a ledger entry using this template, then commit code and documentation together:

```text
Step ID:
Commit SHA: fill from Git after commit, or refer to the commit containing this entry
Time basis: Git author/committer metadata, or independently recorded UTC event time
Change and reason:
Files/API/collection changes:
Commands run:
Expected result / actual result:
Tests and provider mode (local, mocked, or live Atlas):
Known limitations and follow-up:
Backtracking checkpoint:
```

Never put connection strings, tokens or real patient records in this ledger. Git history records code changes; it does not automatically retain runtime database data or establish clinical outcomes.
