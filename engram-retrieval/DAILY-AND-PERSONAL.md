# Daily logs and long-term personal records

Two new scoped collections complement episodic memories and future plans:

| Collection | Stores | Reads |
| --- | --- | --- |
| daily_logs | Past medication/exercise/meal/hydration/sleep/other reports | Explicit local calendar day and optional activity |
| personal_records | Familiar-person details, facts and preferences | Approved cards by kind or person ID |
| people (existing) | Person name and relationship | Linked by person_id |
| episodes (existing) | Source-backed past events | Hybrid text/vector retrieval |
| plans (existing) | Intended future visit/photo-album activity | Trigger worker |

## Daily log

Patient/backend sends POST `/daily-logs` with companion token:

```json
{
  "patient_id":"margaret",
  "id":"morning_report_001",
  "activity":"medication",
  "label":"Morning medicine",
  "outcome":"reported_done",
  "occurred_at":"2026-10-24T08:00:00Z",
  "original_text":"I think I took my morning medicine."
}
```

Other outcomes: reported_not_done, uncertain. Timestamps must be past and include an offset. Patient submissions always have user_report provenance, even if an admin token calls the non-admin endpoint. No dose, prescription, medication advice or automatic medicine reminder is introduced.

Caregiver/encoding backend can POST `/admin/daily-logs` with admin token and source_type caregiver_report, user_report or recording_transcript. Preserve the true original source. All new records start as drafts, including admin submissions.

Caregiver reviews via POST `/admin/life-records/review`:

```json
{"patient_id":"margaret","collection":"daily_logs","id":"morning_report_001","status":"approved"}
```

GET `/daily-logs?patient_id=margaret&day=2026-10-24&activity=medication` returns approved records only. GET `/admin/daily-logs?...` includes drafts. Day defaults to today in TIMEZONE and handles London daylight-saving transitions. Approval does not change a self-report into witnessed ingestion. Missing entries do not mean a task was missed. Conflicting reports are returned separately; never infer that a dose should be repeated.

## Long-term information

First create the familiar person through existing POST `/admin/people`:

```json
{"subjectId":"margaret","id":"priya","name":"Priya","relationship":"daughter"}
```

Then POST `/admin/personal-records`:

```json
{
  "patient_id":"margaret",
  "id":"priya_card_001",
  "kind":"person",
  "person_id":"priya",
  "title":"My daughter Priya",
  "original_text":"Priya is my daughter. She usually visits on Sundays.",
  "source_type":"caregiver_report",
  "photo_ref":"private/family/priya.jpg",
  "contact":{"phone":"<caregiver-provided number>","email":"<caregiver-provided email>"}
}
```

Review with collection personal_records, record id and status approved. GET `/personal-records?patient_id=margaret&kind=person&person_id=priya` returns approved records, linked name/relationship and the private photo reference. Contacts appear only in the admin GET `/admin/personal-records` response. This is not face recognition. The website must authorize and serve private images; no image is uploaded, fetched or converted to a public URL here. Contact fields are bounded strings, not verified communication destinations.

For biography/preferences, use kind fact or preference with title and original_text, without person/contact/photo fields. Example: "I prefer tea without sugar." A patient can POST `/personal-records`; it is tagged user_report and waits for caregiver review. Contact submission requires admin. Other personally identifying details should be included only when relevant and authorized.

Records are immutable under an ID: identical retries return created:false and preserve review; changed content returns 409. For a correction, withdraw the old record using status draft, create a replacement under a new ID and approve it. No automatic fact conflict resolution or expiration is implemented.

## Agent routing

- "What did I report doing today?" -> daily-logs with a local day.
- "Who is Priya?" -> personal-records with the resolved person ID.
- "What happened during my visit last week?" -> existing /retrieve.
- "What is scheduled next?" -> existing plans API.

New collections are NOT automatically added to /retrieve or /api/answer. The team's agent/router must call these structured endpoints and preserve their provenance when wording an answer. They do not become future reminder tasks. Patient-client methods: addDailyLog, dailyLogs, addPersonalRecord and personalRecords. Website user authentication must determine the authorized patient ID; shared service credentials stay on the backend.

Reads are capped at 500 and report truncated:true if more records exist; pagination remains future work. Review actions are audited. Review approval/withdrawal is a caregiver API action, not Gemini's decision. No clinical inference is performed. Run `npm run atlas:indexes` to provision indexes; new indexes/live daily-personal workflows have not been tested against Atlas in this checkpoint. Tests use local stores/HTTP and cover provenance, review, contacts, DST and client mapping. Run npm test.
