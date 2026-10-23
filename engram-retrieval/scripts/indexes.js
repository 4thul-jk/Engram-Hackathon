import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
const cfg = config();
if (cfg.mode !== "mongodb") throw new Error("Set STORE=mongodb and MONGODB_URI first");
const store = await createStore(cfg);
try {
  const db = store.db;
  for (const name of ["daily_logs", "personal_records"]) {
    if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  }
  await db.collection("daily_logs").createIndex({ householdId: 1, subjectId: 1, reviewStatus: 1, occurredAt: 1 });
  await db.collection("personal_records").createIndex({ householdId: 1, subjectId: 1, reviewStatus: 1, personId: 1 });
  for (const name of ["devices", "device_observations", "assistance_requests"]) {
    if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  }
  await db.collection("devices").createIndex({ householdId: 1, subjectId: 1, deviceId: 1 }, { unique: true });
  await db.collection("device_observations").createIndex({ householdId: 1, subjectId: 1, deviceId: 1, observedAt: -1, receivedAt: -1 });
  await db.collection("assistance_requests").createIndex({ householdId: 1, subjectId: 1, status: 1, createdAt: 1 });
  for (const name of ["episodes", "sources", "people", "plans", "prompt_jobs", "prompts", "context_events", "assistance_candidates", "audit_events", "memory_state", "recall_attempts", "rehearsal_sets", "practice_slots"]) {
    if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  }
  await db.collection("plans").createIndex({ householdId: 1, subjectId: 1, eventStatus: 1, eventStart: 1 });
  await db.collection("episodes").createIndex({ householdId: 1, subjectId: 1, reviewStatus: 1, eventStart: -1 });
  await db.collection("prompt_jobs").createIndex({ householdId: 1, status: 1, dueAt: 1 });
  await db.collection("prompt_jobs").createIndex({ householdId: 1, subjectId: 1, dedupeKey: 1 }, { unique: true });
  await db.collection("prompts").createIndex({ householdId: 1, subjectId: 1, dedupeKey: 1 }, { unique: true });
  await db.collection("prompts").createIndex({ householdId: 1, subjectId: 1, status: 1, availableAt: 1 });
  await db.collection("assistance_candidates").createIndex({ householdId: 1, subjectId: 1, status: 1 });
  await db.collection("memory_state").createIndex({ householdId: 1, subjectId: 1, nextDueAt: 1 });
  await db.collection("recall_attempts").createIndex({ householdId: 1, subjectId: 1, episodeId: 1, recordedAt: -1 });
  await db.collection("rehearsal_sets").createIndex({ householdId: 1, subjectId: 1, day: 1 }, { unique: true });
  await db.collection("practice_slots").createIndex({ householdId: 1, subjectId: 1, day: 1, episodeId: 1 }, { unique: true });
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
