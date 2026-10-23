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
