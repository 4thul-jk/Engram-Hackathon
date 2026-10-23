// Citation integrity only. This does NOT prove semantic entailment or clinical safety.
// Call in your Gemini backend with the SAME retrieval result used for generation.
export function validateCitations(retrieval, output) {
  if (retrieval.status !== "candidates_found") return { allowed: false, reason: "No usable retrieval result", fallback: retrieval.fallback };
  if (!output || !Array.isArray(output.claims) || !output.claims.length || output.claims.length > 10) return { allowed: false, reason: "Answer requires source-linked claims" };
  const evidence = new Map(retrieval.evidence.map(e => [e.episodeId,
    new Set(e.sources.filter(s => !s.inspectionRequired && s.sourceType !== "media_reference").map(s => s.id))]));
  for (const claim of output.claims) {
    if (!claim || typeof claim.text !== "string" || !claim.text.trim() || claim.text.length > 2000 || !Array.isArray(claim.citations) || !claim.citations.length) return { allowed: false, reason: "Uncited or malformed claim" };
    for (const citation of claim.citations) {
      if (!citation || !evidence.get(citation.episodeId)?.has(citation.sourceId)) return { allowed: false, reason: "Citation was not retrieved for this request" };
    }
  }
  return { allowed: true, claims: output.claims };
}
export function buildGeminiEvidenceInput(question, retrieval) {
  return JSON.stringify({
    question,
    rules: retrieval.generationPolicy.instruction,
    responseShape: { claims: [{ text: "one supported statement", citations: [{ episodeId: "retrieved ID", sourceId: "retrieved ID" }] }] },
    evidence: retrieval.evidence
  });
}
