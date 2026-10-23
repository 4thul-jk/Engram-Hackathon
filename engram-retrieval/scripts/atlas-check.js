import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
import { nativeHybridPipeline } from "../src/search.js";
const cfg = config();
if (cfg.mode !== "mongodb") throw new Error("Set STORE=mongodb and configure Atlas credentials first");
const store = await createStore(cfg);
try {
  const build = await store.db.admin().command({ buildInfo: 1 });
  console.log(JSON.stringify({ version: build.version, hybridBackend: cfg.hybridBackend,
    nativeRerankConfigured: cfg.nativeRerank, nativeRerankModel: cfg.nativeRerankModel }));
  const indexes = await store.db.collection("episodes").listSearchIndexes().toArray();
  console.log(JSON.stringify({ indexes: indexes.map(i => ({ name: i.name, status: i.status, queryable: i.queryable })) }));
  const scope = { householdId: cfg.householdId, subjectId: cfg.subjectIds[0] };
  const docs = await store.db.collection("episodes").aggregate(
    await nativeHybridPipeline(cfg, scope, "visit flowers", {}), { maxTimeMS: 30000 }
  ).toArray();
  console.log(JSON.stringify({ nativePipelineExecuted: true, candidates: docs.length,
    rerankStageIncluded: cfg.nativeRerank,
    note: docs.length ? "Inspect retrieved evidence and evaluate relevance." : "Empty result verifies execution only, not model quality or reranking over nonempty input." }));
} catch (error) {
  // Do not emit provider payloads, credentials or raw connection strings.
  console.error(JSON.stringify({ passed: false, code: error.code ?? null, codeName: error.codeName ?? null,
    action: "Check cluster/model support, Native Reranking project setting, index readiness and database permissions." }));
  process.exitCode = 1;
} finally { await store.close(); }
