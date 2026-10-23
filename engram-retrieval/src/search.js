// Rank fusion, not addition of incomparable BM25 and vector scores.
export function fuse(lists, limit = 8) {
  const ranks = new Map();
  for (const [method, docs] of Object.entries(lists)) {
    const seen = new Set();
    docs.forEach((doc, index) => {
      if (seen.has(doc._id)) return;
      seen.add(doc._id);
      const entry = ranks.get(doc._id) || { ...doc, fusionScore: 0, methods: [] };
      entry.fusionScore += 1 / (60 + index + 1);
      entry.methods.push(method);
      ranks.set(doc._id, entry);
    });
  }
  return [...ranks.values()].sort((a, b) => b.fusionScore - a.fusionScore).slice(0, limit);
}
export async function voyage(cfg, path, body) {
  if (!cfg.voyageKey) throw new Error("VOYAGE_API_KEY is required for this feature");
  const response = await fetch(`${cfg.voyageBaseUrl}/${path}`, {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${cfg.voyageKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Voyage ${path} unavailable (HTTP ${response.status})`);
  return response.json();
}
export async function embed(cfg, input, inputType) {
  const data = await voyage(cfg, "embeddings", {
    model: cfg.embeddingModel, input: [input], input_type: inputType,
    output_dimension: cfg.dimensions
  });
  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== cfg.dimensions || !vector.every(Number.isFinite)) throw new Error("Invalid embedding response");
  return vector;
}
export async function rerank(cfg, query, docs) {
  if (!docs.length) return docs;
  const data = await voyage(cfg, "rerank", {
    model: cfg.rerankModel, query,
    documents: docs.map(d => d.searchText), top_k: Math.min(5, docs.length)
  });
  if (!Array.isArray(data.data)) throw new Error("Invalid reranking response");
  const seen = new Set();
  return data.data.map(item => {
    if (!Number.isInteger(item.index) || !docs[item.index] || seen.has(item.index)) throw new Error("Invalid reranking index");
    seen.add(item.index);
    return { ...docs[item.index], rerankScore: item.relevance_score };
  });
}
export function episodeFilter(scope, options = {}) {
  const filter = { ...scope, reviewStatus: "approved", isCurrent: true };
  if (options.from || options.to) filter.eventStart = {
    ...(options.from ? { $gte: options.from } : {}), ...(options.to ? { $lt: options.to } : {})
  };
  if (options.personId) filter.personIds = options.personId;
  return filter;
}
export function textPipeline(cfg, scope, query, options) {
  const filter = [
    ...Object.entries(scope).map(([path, value]) => ({ equals: { path, value } })),
    { equals: { path: "reviewStatus", value: "approved" } },
    { equals: { path: "isCurrent", value: true } }
  ];
  if (options.from || options.to) filter.push({ range: {
    path: "eventStart", ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lt: options.to } : {})
  } });
  if (options.personId) filter.push({ equals: { path: "personIds", value: options.personId } });
  return [
    { $search: { index: cfg.searchIndex, compound: {
      must: [{ text: { query, path: "searchText" } }], filter
    } } },
    { $limit: 20 },
    { $project: { embedding: 0 } }
  ];
}
export async function vectorPipeline(cfg, scope, query, options) {
  const input = cfg.embeddingMode === "auto"
    ? { query: { text: query } }
    : { queryVector: await embed(cfg, query, "query") };
  return [
    { $vectorSearch: {
      index: cfg.vectorIndex,
      path: cfg.embeddingMode === "auto" ? "searchText" : "embedding",
      ...input, numCandidates: 100, limit: 20,
      filter: episodeFilter(scope, options)
    } },
    { $project: { embedding: 0 } }
  ];
}

export async function nativeHybridPipeline(cfg, scope, query, options = {}, withRerank = cfg.nativeRerank) {
  // Fusion branches must preserve documents. Projection belongs AFTER fusion/rerank.
  const text = textPipeline(cfg, scope, query, options).filter(stage => !stage.$project);
  const vector = (await vectorPipeline(cfg, scope, query, options)).filter(stage => !stage.$project);
  const pipeline = [
    { $rankFusion: {
      input: { pipelines: { text, semantic: vector } },
      combination: { weights: { text: 1, semantic: 1 } }, scoreDetails: true
    } },
    { $limit: 20 },
    { $match: { ...episodeFilter(scope, options), searchText: { $type: "string" } } }
  ];
  if (withRerank) pipeline.push({ $rerank: {
    query: { text: query }, path: "searchText", numDocsToRerank: 20,
    model: cfg.nativeRerankModel || "rerank-2.5"
  } });
  pipeline.push({ $project: { embedding: 0 } });
  return pipeline;
}
