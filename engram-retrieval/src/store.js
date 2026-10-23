import { randomUUID } from "node:crypto";
import { embed, textPipeline, vectorPipeline, nativeHybridPipeline } from "./search.js";

const copy = value => structuredClone(value);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    const actual = doc[key];
    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === "$in") return expected.includes(actual);
        if (op === "$lte") return actual <= expected;
        if (op === "$lt") return actual < expected;
        if (op === "$gte") return actual >= expected;
        if (op === "$gt") return actual > expected;
        throw new Error(`Unsupported memory filter ${op}`);
      });
    }
    if (value instanceof Date) return actual instanceof Date && +actual === +value;
    return Array.isArray(actual) ? actual.includes(value) : actual === value;
  });
}
export class MemoryStore {
  constructor() { this.tables = new Map(); this.mode = "memory"; }
  table(name) { if (!this.tables.has(name)) this.tables.set(name, new Map()); return this.tables.get(name); }
  async insert(name, doc) {
    const table = this.table(name);
    if (table.has(doc._id)) return false;
    if (doc.dedupeKey && [...table.values()].some(d => d.dedupeKey === doc.dedupeKey && d.householdId === doc.householdId && d.subjectId === doc.subjectId)) return false;
    table.set(doc._id, copy(doc)); return true;
  }
  async list(name, filter = {}, sort = {}, limit = 100) {
    return [...this.table(name).values()].filter(d => matches(d, filter)).sort((a,b) => {
      for (const [key, order] of Object.entries(sort)) {
        if (a[key] < b[key]) return -order;
        if (a[key] > b[key]) return order;
      }
      return 0;
    }).slice(0, limit).map(copy);
  }
  async one(name, filter) { return (await this.list(name, filter, {}, 1))[0] || null; }
  async update(name, filter, changes) {
    const doc = [...this.table(name).values()].find(d => matches(d, filter));
    if (!doc) return null;
    Object.assign(doc, copy(changes)); return copy(doc);
  }
  async claimJob(now, filter = {}) {
    const job = [...this.table("prompt_jobs").values()].filter(d =>
      matches(d, filter) && d.dueAt <= now && (d.status === "pending" || (d.status === "processing" && d.leaseUntil <= now))
    ).sort((a,b) => a.dueAt - b.dueAt)[0];
    if (!job) return null;
    job.status = "processing"; job.leaseToken = randomUUID();
    job.leaseUntil = new Date(+now + 30000); job.attempts = (job.attempts || 0) + 1;
    return copy(job);
  }
  async search(scope, query, options, method) {
    if (method === "vector") throw new Error("Vector search requires Atlas; local demo does not simulate embeddings");
    const stop = new Set("a an the i me my did do does was were is are who what where when why how to at in on with of and or go went today yesterday someone anyone".split(" "));
    const terms = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(t => !stop.has(t));
    const { episodeFilter } = await import("./search.js");
    const docs = await this.list("episodes", episodeFilter(scope, options), {}, 1000);
    return docs.map(d => ({ ...d, localScore: terms.filter(t => new Set(d.searchText.toLowerCase().match(/[\p{L}\p{N}]+/gu)).has(t)).length }))
      .filter(d => d.localScore > 0).sort((a,b) => b.localScore - a.localScore).slice(0, 20);
  }
  async prepareEpisode(doc) { return doc; }
  async close() {}
}
export class MongoStore {
  constructor(client, db, cfg) { this.client = client; this.db = db; this.cfg = cfg; this.mode = "mongodb"; }
  async insert(name, doc) {
    try { await this.db.collection(name).insertOne(doc); return true; }
    catch (error) { if (error.code === 11000) return false; throw error; }
  }
  async list(name, filter = {}, sort = {}, limit = 100) {
    return this.db.collection(name).find(filter).sort(sort).limit(limit).toArray();
  }
  async one(name, filter) { return this.db.collection(name).findOne(filter); }
  async update(name, filter, changes) {
    return this.db.collection(name).findOneAndUpdate(filter, { $set: changes }, { returnDocument: "after", includeResultMetadata: false });
  }
  async claimJob(now, filter = {}) {
    return this.db.collection("prompt_jobs").findOneAndUpdate({
      ...filter, dueAt: { $lte: now }, $or: [
        { status: "pending" }, { status: "processing", leaseUntil: { $lte: now } }
      ]
    }, {
      $set: { status: "processing", leaseToken: randomUUID(), leaseUntil: new Date(+now + 30000) },
      $inc: { attempts: 1 }
    }, { sort: { dueAt: 1 }, returnDocument: "after", includeResultMetadata: false });
  }
  async search(scope, query, options, method) {
    const pipeline = method === "text" ? textPipeline(this.cfg, scope, query, options)
      : await vectorPipeline(this.cfg, scope, query, options);
    return this.db.collection("episodes").aggregate(pipeline, { maxTimeMS: 15000 }).toArray();
  }
  async nativeHybridSearch(scope, query, options) {
    const collection = this.db.collection("episodes");
    const pipeline = await nativeHybridPipeline(this.cfg, scope, query, options);
    try {
      return { docs: await collection.aggregate(pipeline, { maxTimeMS: 20000 }).toArray(), reranked: this.cfg.nativeRerank, warnings: [] };
    } catch (error) {
      if (!this.cfg.nativeRerank) throw error;
      // Distinguish a failed optional reranker from a failed search. Retry just fusion.
      const fallback = pipeline.filter(stage => !stage.$rerank);
      return { docs: await collection.aggregate(fallback, { maxTimeMS: 20000 }).toArray(), reranked: false,
        warnings: ["Native reranking failed; returned native fusion without reranking. Check Atlas enablement, model and deployment support."] };
    }
  }
  async prepareEpisode(doc) {
    if (this.cfg.embeddingMode === "manual") return {
      ...doc, embedding: await embed(this.cfg, doc.searchText, "document"),
      embeddingModel: this.cfg.embeddingModel
    };
    return doc;
  }
  async close() { await this.client.close(); }
}
export async function createStore(cfg) {
  if (cfg.mode === "memory") return new MemoryStore();
  if (!cfg.mongoUri) throw new Error("MONGODB_URI is required in mongodb mode");
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(cfg.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  return new MongoStore(client, client.db(cfg.database), cfg);
}

