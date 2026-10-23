import { config } from "../src/config.js";
const cfg = config();
const base = process.env.ENGRAM_URL || `http://${cfg.host}:${cfg.port}`;
const patient_id = cfg.subjectIds[0];
async function call(path, value, admin = true) {
  const response = await fetch(base + path, { method: "POST", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${admin ? cfg.adminToken : cfg.companionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${result.error || response.status}`);
  return result;
}
const now = Date.now();
const episode = { id: `contract_demo_${now}`, patient_id,
  start: new Date(now - 600000).toISOString(), end: new Date(now - 590000).toISOString(),
  place: "desk", people: [], what: "Object placement", gist: "A brass compass was placed on the desk.",
  salience: 0.6, confidence: 0.9, status: "auto", media_ptr: null,
  evidence: { text: "FICTIONAL DEMO note: I put the brass compass on the desk.", source_type: "user_report" } };
await call("/episodes", episode);
const query = { patient_id, query: "brass compass", time_range: {
  start: new Date(now - 601000).toISOString(), end: new Date(now - 589000).toISOString() } };
const before = await call("/retrieve", query, false);
if (before.episodes.some(e => e.id === episode.id)) throw new Error("Draft leaked into recall");
await call("/episodes/review", { patient_id, id: episode.id, status: "carer_verified" });
const replay = await call("/episodes", episode);
let after;
// Atlas indexing is asynchronous; poll boundedly. Local mode should work immediately.
for (let attempt = 0; attempt < 10; attempt++) {
  after = await call("/retrieve", query, false);
  if (after.episodes.some(e => e.id === episode.id)) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!after.episodes.some(e => e.id === episode.id)) throw new Error("Approved episode not searchable yet; check index readiness and retry with new fixture");
console.log(JSON.stringify({ passed: true, patient_id, episode_id: episode.id,
  draft_excluded: true, approved_retrieved: true, retry_created_duplicate: replay.created,
  features_used: after.features_used, warnings: after.warnings }, null, 2));
