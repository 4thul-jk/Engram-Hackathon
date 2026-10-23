# Native Atlas hybrid retrieval

Atlas hybrid mode now tries one aggregation: `$rankFusion` over separately filtered `$search` and `$vectorSearch` branches, followed by a canonical-field match, optional `$rerank`, and projection. No `$project` or `$rerank` appears inside fusion branches. The application still reloads canonical records and sources after search. Local keyword mode and exact plan/person lookups are unchanged.

## Configure and verify

Configure your private Atlas connection, strong service tokens and subject scope as described in README. Then set:

```dotenv
STORE=mongodb
HYBRID_BACKEND=native
EMBEDDING_MODE=auto
SEARCH_INDEX=episodes_text
VECTOR_INDEX=episodes_auto
NATIVE_RERANK=false
NATIVE_RERANK_MODEL=rerank-2.5
```

```sh
npm install
npm run atlas:indexes
# Wait until search indexes are queryable in Atlas.
npm run atlas:check
```

`atlas:check` prints the actual server version and index statuses and directly executes the native pipeline. It does **not** use fallback: a nonzero exit is an actionable failure. An empty result proves execution only, not retrieval quality. Test against approved source-backed records for meaningful verification. Never paste real credentials into chat or commit `.env`.

To evaluate native reranking, first confirm deployment/model support and enable Native Reranking in Atlas Project Settings yourself. Then set `NATIVE_RERANK=true` and rerun `npm run atlas:check`. This can incur Voyage inference charges. It uses the Atlas project integration, not an external Voyage API key. The script does not enable settings or upgrade a cluster.

## Version/model caution

- `$rankFusion` is documented for MongoDB 8.0+.
- MongoDB's July 2026 announcement describes native reranking on Atlas 8.3 with `rerank-2.5`.
- **The current live `$rerank` reference now lists 9.0+**, with additional dedicated-cluster requirements for `rerank-3`/`rerank-3-lite`. "8.3 or later" alone is not proof the project's deployment and model combination works.
- Native reranking defaults OFF. The configured default model is the earlier `rerank-2.5`, not external API model `rerank-3`. Confirm current support with MongoDB mentors and the live diagnostic before relying on it.

References: [rank fusion](https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankfusion/), [current reranking reference](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/rerank/), [8.3 announcement](https://www.mongodb.com/company/blog/product-release-announcements/improving-agent-retrieval-native-reranking-hybrid-search).

## Fallback and honest feature reporting

1. Native success reports `atlas_rank_fusion` and, if applied, `atlas_native_rerank_voyage`.
2. Optional reranking failure retries native fusion without reranking and emits a warning.
3. Fusion failure retries standalone text/vector queries and application rank fusion. It reports `application_reciprocal_rank_fusion`, not native fusion.
4. A partial fallback marks retrieval incomplete; total failure returns HTTP 503. A complete successful fallback can legitimately return no record.
5. `VOYAGE_RERANK=true` enables the separate external reranker only if native reranking wasn't applied. Leave it OFF to keep reranking native-only.

`/api/recall` returns `featuresUsed`, `warnings`, and `retrievalComplete`. `/retrieve` exposes `features_used`, `warnings`, and `retrieval_complete`. Claim only features actually reported for successful live execution. Index configuration alone is not proof of execution.

Set `HYBRID_BACKEND=application` to explicitly use the old path. Native is the configuration default but is attempted only for Atlas `hybrid` requests; standalone `text`/`vector` modes are unchanged.

## Limits

The pipeline reranks at most 20 candidates and returns up to five source-backed episodes after canonical checks. Inference and fallback retries add latency; benchmark against your actual cluster before a timed demo. Citation IDs and relevance scores do not prove a claim is true.

The automated tests inspect pipelines and exercise controlled provider failures. A subsequent live test verified native fusion and Automated Embedding on MongoDB 8.0.34 with fictional source-backed records; see [the live report](../docs/LIVE-ATLAS-VERIFICATION.md). Native reranking remains disabled and unverified.
