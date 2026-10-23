import "./env.js";
function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
export function config() {
  const mode = process.env.STORE || "memory";
  if (!["memory", "mongodb"].includes(mode)) throw new Error("STORE must be memory or mongodb");
  const timezone = process.env.TIMEZONE || "Europe/London";
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const adminToken = process.env.ADMIN_TOKEN || (mode === "memory" ? "local-admin-change-me" : "");
  const companionToken = process.env.COMPANION_TOKEN || (mode === "memory" ? "local-companion-change-me" : "");
  if (!adminToken || !companionToken || adminToken === companionToken) throw new Error("Configure distinct ADMIN_TOKEN and COMPANION_TOKEN");
  const embeddingMode = process.env.EMBEDDING_MODE || "auto";
  const contextProcessing = process.env.CONTEXT_PROCESSING || "local";
  if (!["auto", "manual"].includes(embeddingMode)) throw new Error("Invalid EMBEDDING_MODE");
  if (!["local", "atlas"].includes(contextProcessing)) throw new Error("Invalid CONTEXT_PROCESSING");
  const hybridBackend = process.env.HYBRID_BACKEND || "native";
  if (!["native", "application"].includes(hybridBackend)) throw new Error("Invalid HYBRID_BACKEND");
  const quietStart = process.env.QUIET_START || "22:00";
  const quietEnd = process.env.QUIET_END || "07:00";
  for (const time of [quietStart, quietEnd]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Invalid quiet hours");
  return {
    mode, timezone, adminToken, companionToken, embeddingMode, contextProcessing, hybridBackend,
    geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-4-argon",
    nativeRerank: process.env.NATIVE_RERANK === "true",
    nativeRerankModel: process.env.NATIVE_RERANK_MODEL || "rerank-2.5",
    host: process.env.HOST || "127.0.0.1",
    port: integer("PORT", 4317, 1, 65535),
    householdId: process.env.HOUSEHOLD_ID || "demo-household",
    subjectIds: (process.env.SUBJECT_IDS || "margaret").split(",").map(x => x.trim()).filter(Boolean),
    origins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(","),
    intervalMs: integer("WORKER_INTERVAL_MS", 2000, 100, 60000),
    cooldownSeconds: integer("PROMPT_COOLDOWN_SECONDS", 30, 0, 3600),
    quietStart, quietEnd,
    runWorker: process.env.RUN_WORKER !== "false",
    mongoUri: process.env.MONGODB_URI,
    database: process.env.MONGODB_DATABASE || "engram",
    searchIndex: process.env.SEARCH_INDEX || "episodes_text",
    vectorIndex: process.env.VECTOR_INDEX || "episodes_auto",
    voyageKey: process.env.VOYAGE_API_KEY,
    voyageBaseUrl: process.env.VOYAGE_BASE_URL || "https://ai.mongodb.com/v1",
    embeddingModel: process.env.VOYAGE_EMBED_MODEL || "voyage-4",
    dimensions: integer("VOYAGE_DIMENSIONS", 1024, 128, 4096),
    rerank: process.env.VOYAGE_RERANK === "true",
    rerankModel: process.env.VOYAGE_RERANK_MODEL || "rerank-3"
  };
}
