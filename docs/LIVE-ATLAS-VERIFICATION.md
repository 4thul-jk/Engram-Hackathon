# Live Atlas verification - 24 October 2026 (IST)

This is a runtime integration record, separate from Git author/committer timestamps. Tests used fictional records only. Credentials, URI, cluster host, IP address and passwords are intentionally omitted.

## Time and deployment

- Final verification timestamp: **2026-10-23T22:11:20.542Z**.
- Same instant in IST: **24 October 2026, 03:41:20.542** (Asia/Kolkata).
- Same instant in London: **23 October 2026, 23:11:20.542 BST** (Europe/London).
- Actual server version read from `buildInfo`: **8.0.34**. This supersedes the earlier unverified assumption of 8.3 or later for this connection.
- Service was restarted at `http://127.0.0.1:4317` with `STORE=mongodb` and the private `.env`.
- Private `.env` remains ignored by Git. Its service tokens differ from the public local-demo defaults.

## Steps completed, in order

| Step | Action | Observed result |
|---|---|---|
| LIVE-01 | Inspect configuration without printing secrets | Found and removed wrapper brackets around entered password; authentication failures occurred during setup, but the latest connection succeeded |
| LIVE-02 | Ping database and read actual version | Connected; MongoDB 8.0.34 |
| LIVE-03 | Run index setup | Ordinary indexes created; text and automated-vector indexes requested |
| LIVE-04 | Read search-index status | `episodes_text` and `episodes_auto` both READY and queryable |
| LIVE-05 | Execute native hybrid diagnostic | Native pipeline executed with reranking disabled; initial empty dataset returned no candidates |
| LIVE-06 | Run `npm run demo:contract` against the Atlas-backed HTTP service | Fictional episode inserted; draft excluded; caregiver approval made it retrievable; identical retry created no duplicate |
| LIVE-07 | Query a historical date range outside the fixture | Empty evidence and `no_record`; date filters held |
| LIVE-08 | Create then cancel a fictional visit before due time; wait for worker | No prompt created for that plan |

LIVE-01 through LIVE-08 are ordered session steps. Only the final runtime verification has the exact timestamp above; individual step start/end times were not independently retained.

## Successful nonempty retrieval

The contract fixture ID was `contract_demo_1792793421816`. Its synthetic source was a report about a brass compass on a desk. The response reported:

```json
{
  "passed": true,
  "draft_excluded": true,
  "approved_retrieved": true,
  "retry_created_duplicate": false,
  "features_used": [
    "atlas_search",
    "atlas_vector_search",
    "atlas_rank_fusion",
    "atlas_automated_embedding_voyage"
  ],
  "warnings": []
}
```

This verifies live text/vector retrieval, native rank fusion and Atlas-managed Voyage embedding for a source-backed fixture. It does not establish clinical usefulness or general retrieval accuracy.

## Limits still in effect

- Native `$rerank` was not included or verified. It remains disabled. Do not claim native reranking ran on this cluster.
- External Voyage API reranking and Atlas Stream Processing are not verified by this run.
- The missing-record test used an explicitly empty date range. It does not prove the system can reject every unsupported natural-language question: semantic search can return irrelevant candidates, and the agent must still check claim support.
- Cancelled-plan suppression was tested. Positive reminder delivery on Atlas was not demonstrated in this run; configured London quiet hours were in effect at the verification time. Earlier positive delivery was observed in local mode.
- The Gemini conversational layer was not exercised. This component returned evidence; the teammate still needs to connect generation and semantic validation.
- Fictional fixtures remain in Atlas; no automatic cleanup or real-data deletion was performed.

## Repeat

From `engram-retrieval` with private Atlas settings configured:

```powershell
npm run atlas:check
# Start service in a separate terminal if not already running:
npm start
# Then from another terminal:
npm run demo:contract
```

The last command writes fictional fixtures. Preserve the output with a timestamp and sanitized fixture IDs for future verification records. Indexing is asynchronous; a failed bounded retry requires investigation rather than claiming success. Never log the URI or service tokens.
