# Engram retrieval and proactive prompts

Your standalone component for MongoDB memory retrieval, evidence delivery to the team's Gemini backend, and rule-based proactive prompts. Node.js 20.18+; JavaScript ES modules.

**Stream Processing:** [STREAM-PROCESSING.md](STREAM-PROCESSING.md) covers pipeline preparation, Atlas deployment and a no-fallback live verification command. Do not claim it as live until that verification succeeds.

**Unified agent context:** [MEMORY-CONTEXT.md](MEMORY-CONTEXT.md) documents `POST /memory-context` for approved episodes, daily reports, personal records and scheduled plans in one typed response.

**Daily logs and familiar people:** [DAILY-AND-PERSONAL.md](DAILY-AND-PERSONAL.md) documents daily reports, family photo/contact cards and patient-provided facts/preferences with caregiver review.

**Assigned-part completion and live acceptance results:** [YOUR-PART-COMPLETE.md](YOUR-PART-COMPLETE.md). Re-run `npm run verify:core` locally or add `-- --atlas` for isolated fictional Atlas checks.

**Device assistance:** [DEVICE-ASSISTANCE.md](DEVICE-ASSISTANCE.md) describes registered devices, timestamped telemetry and a guardian review queue. Tracking and external notifications require separate integrations.

**Website connection:** [WEBSITE-INTEGRATION.md](WEBSITE-INTEGRATION.md) covers the server-side client and reminder forwarding example. No Gemini credentials are needed for retrieval and prompts.

**Gemini integration:** [GEMINI-BRIDGE.md](GEMINI-BRIDGE.md) documents `POST /api/answer`, backend key setup, citation validation and website handoff. Provider tests are mocked until a private Gemini key is configured.

**Project traceability:** [Build history](../docs/PROJECT-HISTORY.md), [process walkthrough](../docs/PROCESS.md), and [backtracking runbook](../docs/BACKTRACKING.md). Run `npm run project:history` in the tracked checkout to read exact Git checkpoint times in IST and London time.

**Team contract:** [TEAM-HANDOFF.md](TEAM-HANDOFF.md) documents `POST /episodes`, caregiver review, and `POST /retrieve` using `patient_id` and the team's episode fields. Run `npm run demo:contract` against the running service to check this integration. Existing endpoints below remain supported.

**Memory scheduling:** [MEMORY-MODEL.md](MEMORY-MODEL.md) documents the experimental stability model, maximum-three daily review, practice attempts and nightly invocation. Run `npm run demo:memory` against a fresh local service to exercise the loop. This is a scheduling heuristic, not a clinical assessment.

**Native Atlas retrieval:** [NATIVE-ATLAS.md](NATIVE-ATLAS.md) covers native fusion, optional native reranking, deployment/model checks and automatic fallback. Use `npm run atlas:check` for a live diagnostic once Atlas is configured.

## Run the local demo now

```powershell
cd engram-retrieval
npm start
```

Open http://127.0.0.1:4317. In the developer console, enter `local-admin-change-me`, click **Connect**, then **Add fictional demo records**. Search for `Priya yellow flowers`. A server worker creates a visit prompt after 15 seconds, subject to quiet hours. Click **Check in at desk** to exercise the context trigger. Cooldown may delay the second prompt by 30 seconds. Cancel a plan to suppress its prompts.

The local mode needs no installed packages and no API keys. It stores data **in memory**, resets on restart, uses **keyword matching only**, and does not simulate Atlas/Voyage features. Sources are fictional text reports, not real video. `/health` and retrieval responses disclose the mode and features used. The demo UI doesn't call Gemini; it shows the real evidence payload your Gemini teammate should consume.

Default timezone is `Europe/London` for the event. Quiet hours are 22:00-07:00 in that timezone. For a deliberate daytime simulation, copy `.env.example` to `.env` and set `QUIET_START=00:00` and `QUIET_END=00:00` (equal times disable quiet hours). Do not silently disable this in a real deployment.

## What is implemented

- Text, vector, and hybrid retrieval adapters for MongoDB Atlas. Hybrid tries native `$rankFusion` and optional `$rerank`; standalone branches and application-side fusion remain an explicit fallback.
- Atlas Automated Embedding index configuration, or manual Voyage embedding fallback. Optional Voyage reranking. Different key providers/geographies require matching API endpoints.
- Canonical record reload after search, household/subject/date/approval filtering, source validation, structured no-record/degraded-service responses.
- Exact upcoming-plan and person retrieval. Plans never enter the historical episode index.
- Scheduled reminder worker with persisted jobs, atomic claims, expiring leases, retries and idempotent prompt records. Reconciliation recovers a plan saved just before a process crash.
- Fresh explicit place-check-in events, pending-intention matching, and a Stream Processing pipeline template.
- Quiet hours, cooldown, cancellation/version checks, expiry, snooze, acknowledgement, dismissal and explicitly self-reported completion.
- Separate caregiver/backend and companion bearer tokens; constrained deployment scope; input validation; bounded request bodies and origin allowlist.
- Local developer dashboard, synthetic fixtures, grounding helper and integration tests.

## Configure Atlas

1. Run `npm install` (only runtime dependency: the MongoDB Node driver).
2. Copy `.env.example` to `.env`. Never commit `.env`.
3. Set `STORE=mongodb`, `MONGODB_URI`, database, strong distinct tokens, household and subject IDs. Point to a dedicated hackathon database; do not use real patient records.
4. Choose `EMBEDDING_MODE=auto` for Atlas Automated Embedding (generally available on Atlas since 12 August 2026). Confirm your Atlas deployment supports it. `VOYAGE_EMBED_MODEL=voyage-4` is configurable. This integration requests an `autoEmbed` field on `searchText` and sends query text rather than a query vector.
5. Run `npm run atlas:indexes`. It creates ordinary indexes and requests text/vector indexes. Wait in Atlas until search indexes are ready/queryable; embedding generation is asynchronous. The script does not replace existing search definitions.
6. Set `CONFIRM_DEMO_SEED=yes` in your terminal and run `npm run demo:seed` if you want fictional fixtures in Atlas. Otherwise your ingestion teammate calls the caregiver endpoints below.
7. Run `npm start`. In Atlas mode the demo page seed button is disabled server-side; seeding is an explicit CLI operation.

Manual embedding fallback: set `EMBEDDING_MODE=manual`, provide `VOYAGE_API_KEY`, choose a **new** `VECTOR_INDEX` name, and rerun index setup. New episodes are embedded via the Voyage API before insertion. Existing episodes must be backfilled/re-ingested; this service doesn't silently migrate embedding spaces. Set model and dimensions consistently for documents and queries.

For Atlas-issued unscoped model keys, `VOYAGE_BASE_URL=https://ai.mongodb.com/v1`. Match scoped Atlas keys to their geography endpoint, or use `https://api.voyageai.com/v1` for a Voyage-platform key. Reranking is opt-in with `VOYAGE_RERANK=true` and a valid key. Search degrades explicitly if a branch or reranker is unavailable; a complete retrieval failure returns HTTP 503, not "no memory".

The worker runs inside the server by default. For a separate Atlas worker, set `RUN_WORKER=false` for the API and run `npm run worker` in another process. **Run one active worker per household** in this prototype: atomic job claims prevent the same job being claimed twice, but cooldown across different jobs isn't protected by a distributed per-person lock. The worker scans up to 1,000 active plans per subject per tick, processes 50 context candidates per subject and up to 25 jobs. Add pagination/queue orchestration before scaling beyond the demo.

## Team API contract

All `/api` and `/admin` routes require `Authorization: Bearer <token>`. `/admin` requires `ADMIN_TOKEN`. Use the companion token from a trusted backend that authenticates the actual user. Each service deployment is scoped by `HOUSEHOLD_ID` and `SUBJECT_IDS`; a client-supplied household ID cannot change this scope. These tokens are service credentials, **not production patient authentication**. A token can access every configured subject, so deploy per household or add your team's real per-user membership/auth layer before shared use.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Public mode/readiness configuration (not a live Atlas search probe) |
| POST | `/api/recall` | Search past episodes and return evidence for Gemini |
| GET | `/api/plans?subjectId=margaret` | Exact approved future plans; optional `from`/`to` |
| GET | `/api/person?subjectId=margaret&personId=...` | Exact approved person card |
| GET | `/api/prompts?subjectId=margaret` | Eligible prompts for the companion |
| POST | `/api/prompts/respond` | Acknowledge, snooze, dismiss or self-report completion |
| POST | `/api/context-events` | Explicit fresh place check-in |
| POST | `/admin/sources` | Add original source text/provenance |
| POST | `/admin/people` | Add an approved person card |
| POST | `/admin/episodes` | Add a reviewed episode (draft is default) |
| POST | `/admin/plans` | Approve a supported low-risk plan and reminder rule |
| POST | `/admin/plans/cancel` | Cancel plan and invalidate prompts |
| GET | `/admin/activity?subjectId=margaret` | Job/prompt/action history |

All incoming date/time values require ISO datetime strings with an explicit offset or `Z`; stored dates are BSON dates in Atlas. API ranges use inclusive `from`, exclusive `to`. Natural-language time parsing belongs to your ingestion/Gemini backend. Compute the person's local calendar-day boundaries there using an IANA timezone and convert to UTC. Don't send ambiguous strings such as "tomorrow at 3" to this component.

### Ingestion teammate: save original source, then episode

```json
POST /admin/sources
{
  "id": "source_visit_1",
  "subjectId": "margaret",
  "sourceType": "caregiver_report",
  "content": "Priya visited with yellow flowers and had tea."
}
```

```json
POST /admin/people
{
  "id": "priya",
  "subjectId": "margaret",
  "name": "Priya",
  "relationship": "granddaughter"
}
```

```json
POST /admin/episodes
{
  "id": "episode_visit_1",
  "subjectId": "margaret",
  "summary": "Priya visited with yellow flowers and had tea.",
  "searchText": "Priya, granddaughter, visited with yellow flowers. They had tea.",
  "eventStart": "2026-10-23T09:40:00Z",
  "personIds": ["priya"],
  "sourceIds": ["source_visit_1"],
  "reviewStatus": "approved"
}
```

People and sources must exist in the same subject/household scope. Never mark model output approved without your review step. The admin API trusts the caregiver/backend to make that review decision; it cannot determine whether a report is true. Future dates are rejected for episodes. In this MVP corrections/review transitions require your ingestion integration to update the canonical record in MongoDB; there is no general-purpose public update API. Keep `reviewStatus`, `isCurrent` and source references consistent.

### Gemini teammate: retrieve before answering

```json
POST /api/recall
{
  "subjectId": "margaret",
  "query": "Who brought yellow flowers?",
  "mode": "hybrid",
  "from": "2026-10-23T00:00:00Z",
  "to": "2026-10-24T00:00:00Z"
}
```

Response: `status`, `evidence[]` containing original source text, `featuresUsed`, `warnings`, a fallback, and generation policy. Status `candidates_found` means search candidates exist, **not that the question is answered**. Gemini must determine whether the sources actually support the requested claim. The service does not silently infer dates from the query: pass an explicit date range when the question says "today" or "yesterday".

Use `examples/team-backend.js`. It accepts your existing `generateJson` function rather than creating another Gemini implementation. `src/grounding.js` validates claim citation IDs against the same request's evidence. It does **not** prove semantic entailment: a model can cite a real record while misdescribing it. Add semantic evaluation and conservative wording. Render only checked claims; never append an unchecked answer string. Revalidate records if there is a long gap between retrieval and display.

### Scheduled plan

```json
POST /admin/plans
{
  "id": "priya_visit",
  "subjectId": "margaret",
  "kind": "visit",
  "personId": "priya",
  "triggerType": "time",
  "dueAt": "2026-10-24T13:45:00Z",
  "eventStart": "2026-10-24T14:00:00Z",
  "expiresAt": "2026-10-24T14:10:00Z"
}
```

Use times appropriate to your current run. `expiresAt` must be after the event and still in the future. For a changed appointment, cancel the old plan and submit a new ID. Its stale jobs/prompts will fail canonical plan validation. Only `visit` and `photo_album` kinds are supported intentionally; arbitrary medication, money or hazardous routine instructions are not accepted. Prompt wording uses controlled templates rather than an LLM.

### Context trigger

Create a `photo_album` plan with `triggerType: "context"`, `placeId: "desk"`, an eligible `eventStart`, and future `expiresAt`. No `dueAt` is needed. Submit:

```json
POST /api/context-events
{
  "subjectId": "margaret",
  "eventId": "desk_checkin_unique_1",
  "placeId": "desk",
  "observedAt": "2026-10-24T13:00:00Z"
}
```

The event must be no older than two minutes, and no more than ten seconds ahead of the server. A context job checks freshness again when processed; its resulting prompt expires with that observation. Each intention version prompts at most once, even across fresh repeat check-ins. This is a bounded prototype policy, not a learned assessment that someone forgot something.

### Frontend teammate: poll and respond

Poll `/api/prompts` every two seconds while the page is open, using your backend proxy/auth layer. Deduplicate by prompt `_id`. Stop polling on teardown and handle reconnect/errors. You can use the message verbatim, display its reason and provide buttons:

```json
POST /api/prompts/respond
{
  "subjectId": "margaret",
  "promptId": "<returned _id>",
  "action": "acknowledged"
}
```

Actions: `acknowledged`, `snoozed` (one minute), `dismissed`, `self_reported_done`. Acknowledgement never completes a plan. Self-report remains distinct from verified completion. Created/fetched prompts are not proof a person saw them. Push, audio playback, background execution and a presentation receipt are not implemented here. The page must be open for polling; a real deployment needs a separate push delivery path.

## Atlas Stream Processing (optional, not locally emulated)

`atlas/context-pipeline.json` is a deployable-shape template, **not verified against your Atlas workspace**:

1. Create a Stream Processing workspace and an Atlas connection named `engramAtlas` with access to `engram.context_events`, `plans`, and `assistance_candidates`.
2. Edit connection/database names in the JSON if yours differ. Verify `$source` change-stream options against your deployed Stream Processing version.
3. Create/start a processor with that pipeline. Configure a dead-letter queue using your workspace's supported options.
4. Set `CONTEXT_PROCESSING=atlas` and restart the service. There is deliberately no local fallback in this mode.
5. Send a fresh context event **after the processor starts**. It reads inserts, looks up approved pending context plans, and writes a candidate. The backend reloads the original event and plan and performs expiry, scope, dedupe and prompt policy checks.
6. Show the original event, processed candidate and resulting prompt as separate evidence of the integration. An outage here means no context prompts; scheduled reminders still run independently.

Change streams/stream ingestion do not replace the server clock scheduler. TTL deletion is not used to fire reminders.

## Tests and limits

Run `npm test`. Tests use Node's built-in runner, fictional data and an actual loopback HTTP server. No Atlas credentials, provider calls or real patient data are used. If your development sandbox blocks loopback connections, run the suite in your normal terminal.

Atlas text/vector search, native fusion and Automated Embedding subsequently passed a live fictional-record test on MongoDB 8.0.34; see [the live verification report](../docs/LIVE-ATLAS-VERIFICATION.md). Native reranking, external Voyage API reranking and Stream Processing still require live validation. The automated unit/integration suite uses local and mocked providers, separately from that live run. Atlas Automated Embedding is generally available; the self-managed preview warning must not be applied to Atlas. Native reranking has its own release status and enablement requirements. There is no continuous recording, face recognition, clinical memory assessment, medical advice, background geofencing, or emergency monitoring. No media upload/expiry pipeline is supplied: the ingestion teammate owns private original media and should extend source references accordingly. Access tokens, audit retention, key rotation, patient consent and production identity integration need a deployment review before handling personal data.

## Official references used

- [Atlas Search](https://www.mongodb.com/docs/search/)
- [Automated Embedding](https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/)
- [Vector queries](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/)
- [Hybrid search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/)
- [Voyage API and endpoints](https://www.mongodb.com/docs/voyageai/api-reference/overview/)
- [Stream Processing](https://www.mongodb.com/docs/atlas/atlas-stream-processing/)
- [Stream lookup](https://www.mongodb.com/docs/atlas/atlas-stream-processing/sp-agg-lookup/)
- [Stream merge](https://www.mongodb.com/docs/atlas/atlas-stream-processing/sp-agg-merge/)

## Sponsor-feedback clarification (24 October 2026)

MongoDB's [Atlas GA announcement](https://www.mongodb.com/products/updates/now-ga-automated-embedding-in-atlas-vector-search/) supersedes this README's earlier blanket preview warning. General overview text mixes deployment-specific notes; distinguish Atlas from self-managed deployments.

The implementation now includes native `$rankFusion` and optional `$rerank`, plus application-side fallback. Standalone text/vector queries use `$project`; native fusion branches omit it and apply projection after fusion/reranking. See NATIVE-ATLAS.md for feature reporting and live validation.

Verify the actual version, model and enablement. `$rankFusion` requires 8.0+. The earlier announcement describes reranking on 8.3 with `rerank-2.5`, but the current reranking reference lists 9.0+ and additional model restrictions. Native reranking therefore defaults OFF until a live diagnostic succeeds. Construct separate filtered text/vector branches under fusion, append reranking, then projection. See [native reranking](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/rerank/) and [hybrid search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/). Do not replace the tested fallback or claim this path works until tested against the team's cluster.

There are no direct Gemini SDK calls in this component: generation is supplied by the teammate's backend. The `top_k` argument in `src/search.js` is a Voyage reranking parameter, not a Gemini generation setting. UTC storage and timezone-aware day boundaries are already implemented; the tests include London's 25-hour day on 25 October 2026.
