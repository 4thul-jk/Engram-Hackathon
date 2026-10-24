# Unified memory-context API

POST `/memory-context` with the backend companion/admin bearer token. This supplies the team's Gemini agent with typed approved records; it does not itself call Gemini or return a generated answer.

```json
{
  "patient_id":"margaret",
  "query":"Who is visiting and what did I report doing today?",
  "include":["episodes","daily_logs","personal_records","plans"],
  "day":"2026-10-24",
  "time_range":{"start":"2026-10-23T23:00:00Z","end":"2026-10-24T23:00:00Z"},
  "plan_range":{"start":"2026-10-24T12:00:00Z","end":"2026-10-25T12:00:00Z"},
  "limit":20
}
```

Only patient_id and query are required. include defaults to all four sections; request fewer sections to reduce work/data. Limit is per section, default 20, max 50. Section selectors are explicit: the service does not ask Gemini to infer them.

| Section | Selection | Meaning |
| --- | --- | --- |
| episodes | Hybrid query ranking, optional time_range | Candidate past events with original sources; not exhaustive |
| daily_logs | Local day, optional activity | Approved attributed reports, not proof of completion |
| personal_records | Approved cards, optional person_id | Facts/preferences/familiar people, no caregiver contact fields |
| plans | Future plan window by default | Scheduled intentions, never completed events |

Day defaults to today in TIMEZONE. time_range applies only to episodes, day only to daily logs, person_id only to personal cards. plan_range is separate and defaults to now through the next 24 elapsed hours. Explicit windows use inclusive start/exclusive end. Daily bounds respect daylight saving. Dates in examples must be replaced for actual use.

## Response

```text
patient_id, query, retrievedAt, timezone
status: context_ready | context_partial
complete: boolean
sections:
  episodes: records, status, complete, selection, featuresUsed, warnings
  daily_logs: records, status, complete, day, timezone, selection
  personal_records: records, status, complete, selection
  plans: records, status, complete, from, to, selection
warnings
generationPolicy
```

Section statuses: available, empty, partial, unavailable. Records retain their existing endpoint shapes. A cap or degraded retrieval sets partial/complete:false; an operational failure marks only that section unavailable. If all requested sections fail, HTTP 503. Invalid requests remain 400, unauthorized patient IDs 403, missing token 401. Error payloads do not expose database/provider details. Empty is only meaningful within the selection/window; it does not prove nothing happened.

Personal and daily sections are selected by structured filters, not semantic ranking. The agent must check relevance, attribution and contradictions. include and filters are recommended for narrower questions. Do not send all records to an LLM when fewer are sufficient.

## Teammate integration

```js
import { buildContextEvidenceInput, validateContextCitations }
  from './path/to/src/memory-context.js';

const context = await patientClient.memoryContext({
  query: 'What exercise did I report today?',
  include: ['daily_logs'], activity: 'exercise'
});
const proposed = await yourExistingGeminiJsonFunction(buildContextEvidenceInput(context));
const checked = validateContextCitations(context, proposed);
if (!checked.allowed) {
  // Return an uncertainty/fallback message. Never display unchecked free text.
} else {
  // Present checked.claims with their attribution and dates.
}
```

Typed citation format: `{section, recordId, sourceId}`. For episodes, recordId is the episode's `id` and sourceId is an inspected original evidence entry's `id`. For daily/personal/plan records, both IDs are that returned record's `_id`; these cite the structured report or intention itself. The helper checks membership only, not semantic support, medical safety or whether an activity occurred. A plan citation never establishes completion.

Contexts are snapshots, not transactions across sections. Before displaying a slow-generated answer, refresh the relevant context and validate citations again if approval/cancellation may have changed; citation checks still cannot prove truth. Do not invent unavailable sections or silently treat partial context as complete. Preserve existing fallback behaviour. The old `/api/answer` is still episode-only; this addition does not change its schema or generation behaviour.

## Verification checkpoint

- 95 automated tests passed, including authenticated localhost HTTP, scope, drafts/withdrawal, contact omission, section outages, caps, selectors, client mapping and typed citations.
- Expanded `npm run verify:core -- --atlas` passed all 10 checks at **2026-10-24T00:03:35.156Z**. Fictional household `verify_2f7d6737fab649919c6ba784946f1029` retained. It checks the unified context and existing retrieval/reminder behaviour through services against live MongoDB.
- Live execution reported Search, Vector Search, native rank fusion and automated Voyage embedding. The verifier uses a controlled clock and disables quiet hours only for isolated fixtures. No live Gemini generation is claimed.
- Atlas collection-specific indexes for new daily/personal records are prepared in atlas:indexes but were not provisioned during this run; correctness on the small fixture does not establish performance at scale.

No scheduler or game changes in this step. Durable scheduling, combined caregiver review queue and server-pushed reminder delivery remain separate planned steps.
