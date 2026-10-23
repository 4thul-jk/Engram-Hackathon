# Experimental memory scheduling and practice handoff

This module implements the next memory-backbone deliverable: stability update functions, recall-attempt history, a capped daily rehearsal list, and a script suitable for nightly invocation. These are **engineering heuristics**, not clinical measurements, predicted patient outcomes, or evidence that a person's cognition improved. Practice outcomes are supplied by the caller; this component does not grade speech or prove someone remembered.

## Test the whole loop

Start a fresh local service with `npm start`, then in a second terminal in the same directory:

```sh
npm run demo:memory
```

The demo inserts four fictional, caregiver-approved episodes with original text sources. It generates today's review (maximum three), records one "answer shown" attempt, retries that attempt, and verifies stability did not increase and the retry did not update state twice. It changes the running service's demo data. If today's daily snapshot already exists, the demo uses its selected items; if they were already practiced it refuses another attempt. For a clean repeat, restart the in-memory server. Do not reset real patients' daily caps for demonstration purposes.

Run `npm test` for pure-function, eligibility, cap, retry, race, recovery, timezone and HTTP checks.

## Model

Defaults, chosen for the prototype:

```text
Initial stability S = 1 day; minimum = 0.5 day
alpha = 1.5; beta = 0.5; target r = 0.7
R(t) = exp(-elapsedDays / S)

If recalled:     S' = max(0.5, S * (1 + alpha * (3-c)/3))
If not recalled:S' = max(0.5, beta * S)
Next due time = anchor - S' * ln(r) days
```

`c=0` is unaided recall, `1` is context cue, `2` is partial cue, `3` is answer shown. A recalled attempt with `c=3` gives **no stability gain**. A failed attempt can decrease stability, including at cue level 3. Skipping preserves stability, anchor, due time and rehearsal count; it consumes that memory's daily practice slot so the system doesn't ask again the same day.

Initial anchor is the recorded event's `eventStart`. Subsequent non-skipped attempts anchor at the server's attempt time. Passage of time changes a derived retention score; nightly runs do not repeatedly multiply or mutate stability. `estimatedRetention` is a model output with unvalidated parameters, not a calibrated probability of actual recall.

## Eligibility and daily selection

- Only current caregiver-approved episodes, with supplied confidence >= 0.8 and available original text sources.
- Low/unknown confidence, revoked approval, future events, missing sources and uninspected media are excluded. The 0.8 threshold is an engineering filter over uncalibrated upstream metadata.
- Select episodes due before the end of the requested day. Rank by `salience * (1 - estimatedRetentionAtDayStart)`; missing salience defaults to 0.5.
- Store one immutable snapshot per patient/local day with at most three episode IDs. Rerunning never creates another daily batch. Withdrawing approval removes the item from responses without filling its slot with a fourth memory.
- At most one accepted practice attempt per selected episode per local day (maximum three selected episodes/day). A skip counts toward this bound.
- Local dates use configured `TIMEZONE`, including daylight-saving changes. The nightly endpoint generates today or tomorrow only; tomorrow is default.
- Practice is opt-in: callers must offer consent and a skip action. This module does not send messages, auto-start sessions, or generate cues. The conversation teammate owns those interactions.

## API

All routes use existing service tokens and configured subject/household boundaries. Input naming follows the team contract (`patient_id`).

### POST /admin/rehearsals/generate (caregiver/backend token)

```json
{ "patient_id": "margaret", "day": "2026-10-24" }
```

Omit `day` for tomorrow in the configured timezone. Returns `{id, patient_id, day, timezone, episodes, dailyLimit: 3, experimental: true}`. Episodes contain IDs, gist, source IDs, confidence and memory state. A saved empty snapshot remains empty for that day; do not generate before the intended source data is ready.

### GET /rehearsals?patient_id=margaret&day=2026-10-24

Companion token is accepted. `day` defaults to today. If there is no saved list, returns empty episodes and `status: "not_generated"`. It never silently generates a list. Canonical approval and source availability are checked each time. It does not mark a prompt delivered.

### GET /memory-state?patient_id=margaret&episode_id=episode_visit_001

Returns eligible episode state, current derived retention and `experimental: true`. State is initialized on first access if absent. Ineligible episodes return 404. The console can graph this value with an experimental label; it must not label it a measured cognitive ability.

### POST /recall-attempts

```json
{
  "patient_id": "margaret",
  "episode_id": "episode_visit_001",
  "attempt_id": "attempt_unique_001",
  "cue_level": 1,
  "outcome": "recalled"
}
```

Outcomes: `recalled`, `not_recalled`, `skipped`. Use the same immutable `attempt_id` for transport retries; changed content under that ID returns 409. The episode must be in today's saved set and still eligible. A different attempt ID for the same episode/day returns 409. Repeating a user question during normal recall must not be logged as an unsolicited practice attempt.

Returned state contains stability, anchor, next due, last rehearsal and version. This endpoint does not infer truth from confidence, produce a diagnosis, or increment scores just because an answer was displayed.

## Nightly script

```sh
npm run memory:nightly
# Optional explicit local day (today or tomorrow):
npm run memory:nightly -- 2026-10-24
```

The script calls the running service for every configured `SUBJECT_IDS` entry, using `ENGRAM_URL` if set. It works with the local process and with Atlas-backed service deployments. It is **not automatically scheduled**: configure your hosting scheduler to invoke it once in the evening before the target day. Keep that scheduler in the patient's configured timezone; don't assume a day is always 24 hours. Failed HTTP requests make the script fail visibly. It never sends patient notifications or changes appointment reminders.

## Storage and recovery

New collections: `memory_state`, `recall_attempts`, `rehearsal_sets`, `practice_slots`. Rerun `npm run atlas:indexes` for their indexes when using Atlas.

`recall_attempts` is an ordinary collection rather than a MongoDB time-series collection: unique IDs, immutable input and recoverable applied-state updates support idempotency. Daily slots and snapshots use deterministic IDs. State uses an optimistic version check. If an attempt is saved but the process dies before the state update, retrying the same ID resumes it. If a different state transition has intervened, a conflict is surfaced rather than applying twice. No cross-collection transaction is claimed; interrupted/losing attempts may remain in history with `applied: false` and need inspection.

Review generation scans at most the 1,000 most recent eligible-looking episodes before source checks. This bounds prototype work but needs pagination at scale. No live Atlas validation has been performed without credentials. Clinical evaluation, production consent/preferences, deletion cascades and retention are separate outstanding work.
