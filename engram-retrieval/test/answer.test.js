import test from "node:test";
import assert from "node:assert/strict";
import { AnswerService, geminiGenerator } from "../src/answer.js";

const evidence = { episodeId: "e1", sources: [{ id: "s1", content: "Reported glasses on shelf", sourceType: "caregiver_report" }] };
const retrieval = () => ({ status: "candidates_found", retrievalComplete: true, featuresUsed: ["test"], evidence: [structuredClone(evidence)], generationPolicy: { instruction: "Only use evidence" } });
const output = () => ({ status: "supported", claims: [{ text: "A saved report says your glasses were on the shelf.", citations: [{ episodeId: "e1", sourceId: "s1" }] }] });
test("answer returns source-linked claims after canonical recheck", async () => {
  let calls = 0;
  const answer = new AnswerService({ recall: async () => { calls++; return retrieval(); } }, {}, async input => {
    assert.equal(JSON.parse(input).question, "Where were my glasses?"); return output();
  });
  const result = await answer.answer({ query: "Where were my glasses?" });
  assert.equal(result.status, "answered"); assert.equal(calls, 2);
  assert.equal(result.verification, "citation_integrity_only");
});
for (const state of ["no_record", "retrieval_incomplete"]) test(`does not generate for ${state}`, async () => {
  const answer = new AnswerService({ recall: async () => ({ ...retrieval(), status: state }) }, {}, async () => { throw Error("must not call"); });
  assert.equal((await answer.answer({})).status, "no_support");
});
test("uninspected media never reaches Gemini", async () => {
  const r = retrieval(); r.evidence[0].sources[0].inspectionRequired = true;
  const answer = new AnswerService({ recall: async () => r }, {}, async () => { throw Error("must not call"); });
  assert.equal((await answer.answer({})).reason, "no_inspected_text_evidence");
});
test("rejects invented citation", async () => {
  const bad = output(); bad.claims[0].citations[0].sourceId = "invented";
  const answer = new AnswerService({ recall: async () => retrieval() }, {}, async () => bad);
  assert.equal((await answer.answer({})).reason, "invalid_citations");
});
test("allows model abstention despite retrieval candidates", async () => {
  const answer = new AnswerService({ recall: async () => retrieval() }, {}, async () => ({ status: "no_support", claims: [] }));
  assert.equal((await answer.answer({})).reason, "model_abstained");
});
test("withdrawn approval during generation blocks output", async () => {
  let calls = 0;
  const answer = new AnswerService({ recall: async () => ++calls === 1 ? retrieval() : { ...retrieval(), status: "no_record", evidence: [] } }, {}, async () => output());
  assert.equal((await answer.answer({})).reason, "evidence_changed");
});
test("missing Gemini credentials returns explicit configuration failure", async () => {
  await assert.rejects(geminiGenerator({})("test"), e => e.status === 503 && /GEMINI_API_KEY/.test(e.message));
});
