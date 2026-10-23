# Team handoff: ingestion -> memory -> recall

This adapter implements the team's `/episodes` and `/retrieve` naming while retaining all existing `/api` and `/admin` endpoints. The team can keep its current Gemini implementation. An optional backend Gemini bridge is documented in [GEMINI-BRIDGE.md](GEMINI-BRIDGE.md).

## Proactive trigger integration

The trigger adapter also accepts `patient_id`. It delegates to the existing worker and policy checks; Gemini access is not required. Plan creation/cancellation require the admin token. The other routes accept the companion token through your authenticated website backend.

| Method and route | Purpose |
| --- | --- |
| `POST /plans` | Create an explicitly caregiver-approved visit or photo-album plan |
| `POST /plans/cancel` | Cancel using `patient_id` and `plan_id` |
| `POST /context-events` | Submit a fresh place check-in |
| `GET /prompts?patient_id=margaret` | Poll currently deliverable prompts |
| `POST /prompts/respond` | Respond using `patient_id`, `prompt_id`, `action` |

Example context plan (replace timestamps with an appropriate current window):

```json
{
  "id": "album_desk_001",
  "patient_id": "margaret",
  "status": "carer_verified",
  "kind": "photo_album",
  "trigger_type": "context",
  "place_id": "desk",
  "event_start": "2026-10-24T12:00:00Z",
  "expires_at": "2026-10-24T13:00:00Z"
}
```

For a time-based plan, use `trigger_type: "time"` and `due_at`. Visit plans require an existing scoped `person_id`. For a context plan, send a place event after `event_start`:

```json
{"patient_id":"margaret","event_id":"checkin_001","place_id":"desk","observed_at":"2026-10-24T12:01:00Z"}
```

Context observations must be within the last two minutes, with at most ten seconds of future clock skew. Repeated event IDs are deduplicated. With the worker running, poll every 2–5 seconds. Render `prompts[].message`; use `prompts[]._id` as `prompt_id`. Responses are wrapped as `{plan: ...}` or `{prompt: ...}`; plan/prompt objects retain existing internal field names. Context responses return `accepted`, `duplicate` and `processing`.

Response actions: `acknowledged`, `snoozed`, `dismissed`, `self_reported_done`. Acknowledgement does not confirm activity completion. Snooze lasts one minute. Self-reported completion remains a self-report. Cancellation, expiry, quiet hours and cooldown can prevent delivery. A place check-in does not establish that the person ate, took medicine or completed another activity. These routes support only the existing visit/photo-album templates.

## Run and check

```powershell
npm start
# In another terminal in this directory:
npm run demo:contract
npm test
```

`demo:contract` creates fictional data on the running service, verifies automatic data is excluded, approves it, retrieves it, and retries the original ingestion without duplicating it. It uses `.env` credentials and the first `SUBJECT_IDS` entry. Atlas search may take longer than its bounded 10-second retry window to index; the script then fails explicitly. It does not prove a live integration unless run against Atlas mode.

Default demo patient is `margaret`. To use the team's `arthur`, set `SUBJECT_IDS=arthur` in `.env`, restart, and use `patient_id: "arthur"` consistently. Change the developer page's Subject ID too. No arbitrary client patient ID grants access. Tokens are server-to-server credentials: the website should authenticate the user and call this service through its backend. `/episodes` and `/episodes/review` require the caregiver/backend `ADMIN_TOKEN`; `/retrieve` accepts the companion token.

## 1. Encoding teammate sends POST /episodes

```json
{
  "id": "episode_visit_001",
  "patient_id": "margaret",
  "start": "2026-10-23T09:40:00Z",
  "end": "2026-10-23T09:45:00Z",
  "place": "living_room",
  "people": [],
  "what": "Visit",
  "gist": "Priya visited with yellow flowers.",
  "salience": 0.8,
  "confidence": 0.9,
  "status": "auto",
  "media_ptr": "private/recordings/visit_001.mp4",
  "evidence": {
    "text": "Original caregiver note: Priya visited with yellow flowers.",
    "source_type": "caregiver_report"
  }
}
```

Response: `{ "created": true, "episode": { ...team fields, "source_ids": [...] } }`, HTTP 201. Identical retries return HTTP 200 with `created: false`. A reused ID with changed content returns 409. Retrying an original `auto` payload after caregiver approval never downgrades that approval.

- `people` contains existing scoped person IDs, not display names. Create cards using `/admin/people` first, or send an empty array if identities are unresolved. `place` is currently a label/ID stored verbatim; graph expansion is not implemented.
- Dates must include timezone offsets; end must not precede start or lie in the future. Future appointments go through the plan API.
- `confidence` and `salience` are optional numbers from 0 to 1, persisted without inventing defaults. Confidence is upstream metadata, not a verified probability of truth.
- `evidence` is an extension to the original team contract. It must contain original text, **not a copied generated gist**. Types: `caregiver_report`, `user_report`, `recording_transcript`.
- Alternatively provide `source_ids` referencing previously saved `/admin/sources` records. Cross-patient references are rejected.
- `media_ptr` alone is accepted as a reference to uninspected media. It isn't fetched by this service. Recall flags it `inspection_required: true`; the text citation helper refuses to use it as support until original content is available. Do not claim the model viewed media merely because the pointer exists.
- Gist alone is rejected as evidence. No summaries are silently promoted into original transcripts.
- Do not send `embedding`. The configured Atlas/Voyage adapter owns embedding model compatibility. Client embeddings are rejected explicitly, rather than silently ignored.
- `status: "auto"` maps to `reviewStatus: "draft"` and is excluded from patient recall. `carer_verified` maps to approved and is a trusted caregiver action, never an automatic Gemini decision. This episode label is not medication ingestion verification.
- The request can save evidence then fail before embedding/insertion. Deterministic source IDs let an identical retry recover without duplicating the source. It isn't a cross-collection transaction; orphan-source cleanup is still a production task.

## 2. Caregiver approves POST /episodes/review

```json
{
  "patient_id": "margaret",
  "id": "episode_visit_001",
  "status": "carer_verified"
}
```

To withdraw approval, send `status: "auto"`. Canonical reload checks stop stale search-index entries returning withdrawn episodes. Source existence is checked, but this service cannot establish whether the event actually happened. This endpoint records an audit event.

## 3. Agent teammate calls POST /retrieve

```json
{
  "patient_id": "margaret",
  "query": "Who brought yellow flowers?",
  "time_range": {
    "start": "2026-10-23T00:00:00Z",
    "end": "2026-10-24T00:00:00Z"
  },
  "mode": "hybrid",
  "min_confidence": 0.8
}
```

`time_range` is optional and uses inclusive start/exclusive end. Your Gemini/router resolves relative language such as "yesterday" in the patient's timezone before calling. `min_confidence` is optional; if supplied, unknown-confidence records are excluded. It filters upstream metadata, not semantic relevance or clinical certainty.

```json
{
  "patient_id": "margaret",
  "status": "candidates_found",
  "episodes": [
    {
      "id": "episode_visit_001",
      "patient_id": "margaret",
      "start": "2026-10-23T09:40:00.000Z",
      "end": "2026-10-23T09:45:00.000Z",
      "place": "living_room",
      "people": [],
      "what": "Visit",
      "gist": "Priya visited with yellow flowers.",
      "salience": 0.8,
      "confidence": 0.9,
      "status": "carer_verified",
      "media_ptr": "private/recordings/visit_001.mp4",
      "source_ids": ["<saved source ID>"],
      "evidence": [
        {
          "id": "<saved source ID>",
          "text": "Original caregiver note: Priya visited with yellow flowers.",
          "source_type": "caregiver_report",
          "media_ptr": "private/recordings/visit_001.mp4",
          "inspection_required": false
        }
      ]
    }
  ],
  "warnings": [],
  "features_used": ["atlas_search", "atlas_vector_search"],
  "note": "Candidates are not verified answers..."
}
```

This is an illustrative response, not a record of a live Atlas run. Features/warnings reflect actual execution. No match returns `episodes: []` and `status: "no_record"`. A partially unavailable search with no usable result returns `retrieval_incomplete`; total search failure returns HTTP 503. **Never translate retrieval failure into a claim that nothing happened.** Low-relevance candidates can still be returned: the agent must check support and the team's validator must check generated claims, not just the presence of an ID.

## Boundaries still owned by teammates

Perception/encoding, face identity, media access/retention, Gemini wording and entailment checks, WhatsApp, medication logging, escalation, clinical brief and patient UI are outside this adapter. Entity graph expansion, hot-caption buffer and deletion cascade are still pending memory-backbone work. The experimental memory-strength/rehearsal module is now implemented: see [MEMORY-MODEL.md](MEMORY-MODEL.md) for the daily-set and recall-attempt API. Trigger APIs continue using `subjectId`; episode, retrieval and practice contracts use `patient_id`. See README for the existing trigger handoff.
