import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
const cfg = config();
if (cfg.mode !== "mongodb") throw new Error("Set STORE=mongodb and MONGODB_URI first");
const store = await createStore(cfg);
try {
  const db = store.db;
  for (const name of ["episodes", "sources", "people", "plans", "prompt_jobs", "prompts", "context_events", "assistance_candidates", "audit_events"]) {
    if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  }
  await db.collection("plans").createIndex({ householdId: 1, subjectId: 1, eventStatus: 1, eventStart: 1 });
  await db.collection("episodes").createIndex({ householdId: 1, subjectId: 1, reviewStatus: 1, eventStart: -1 });
  await db.collection("prompt_jobs").createIndex({ householdId: 1, status: 1, dueAt: 1 });
  await db.collection("prompt_jobs").createIndex({ householdId: 1, subjectId: 1, dedupeKey: 1 }, { unique: true });
  await db.collection("prompts").createIndex({ householdId: 1, subjectId: 1, dedupeKey: 1 }, { unique: true });
  await db.collection("prompts").createIndex({ householdId: 1, subjectId: 1, status: 1, availableAt: 1 });
  await db.collection("assistance_candidates").createIndex({ householdId: 1, subjectId: 1, status: 1 });
  const episodes = db.collection("episodes");
  const existing = await episodes.listSearchIndexes().toArray();
  const filters = ["householdId", "subjectId", "reviewStatus", "isCurrent", "eventStart", "personIds"];
  if (!existing.some(index => index.name === cfg.searchIndex)) await episodes.createSearchIndex({
    name: cfg.searchIndex, type: "search",
    definition: { mappings: { dynamic: false, fields: {
      searchText: { type: "string", analyzer: "lucene.standard" },
      householdId: { type: "token" }, subjectId: { type: "token" }, reviewStatus: { type: "token" },
      personIds: { type: "token" }, isCurrent: { type: "boolean" }, eventStart: { type: "date" }
    } } }
  });
  if (!existing.some(index => index.name === cfg.vectorIndex)) await episodes.createSearchIndex({
    name: cfg.vectorIndex, type: "vectorSearch",
    definition: { fields: [
      cfg.embeddingMode === "auto"
        ? { type: "autoEmbed", modality: "text", path: "searchText", model: cfg.embeddingModel }
        : { type: "vector", path: "embedding", numDimensions: cfg.dimensions, similarity: "cosine" },
      ...filters.map(path => ({ type: "filter", path }))
    ] }
  });
  console.log("Database indexes ready; requested search indexes. Search builds are asynchronous.");
  console.log("Check Atlas index status is READY/queryable before testing retrieval.");
  console.log("Existing search index definitions are not changed. Use a new VECTOR_INDEX when changing modes/models.");
} finally { await store.close(); }
