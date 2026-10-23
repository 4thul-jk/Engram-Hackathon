// Import/copy into your team's BACKEND. Do not ship these bearer tokens to browsers.
import { buildGeminiEvidenceInput, validateCitations } from "../src/grounding.js";

export async function retrieveForGemini({ query, subjectId, from, to }) {
  const response = await fetch(`${process.env.ENGRAM_URL || "http://127.0.0.1:4317"}/api/recall`, {
    method: "POST", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${process.env.ENGRAM_COMPANION_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, subjectId, from, to, mode: "hybrid" })
  });
  if (!response.ok) throw new Error("Memory retrieval unavailable");
  const retrieval = await response.json();
  if (retrieval.status !== "candidates_found") return { fallback: retrieval.fallback, retrieval };
  return { input: buildGeminiEvidenceInput(query, retrieval), retrieval };
}

// generateJson is the function your teammate already uses to call Gemini.
export async function answerWithMemory(args, generateJson) {
  const context = await retrieveForGemini(args);
  if (context.fallback) return { text: context.fallback, status: context.retrieval.status };
  const proposed = await generateJson(context.input);
  const checked = validateCitations(context.retrieval, proposed);
  if (!checked.allowed) return { text: "I couldn't confirm that answer from the saved sources.", status: "unsupported" };
  // Render checked claims only; don't append an unchecked free-form answer field.
  return { claims: checked.claims, status: "citation_checked" };
}
