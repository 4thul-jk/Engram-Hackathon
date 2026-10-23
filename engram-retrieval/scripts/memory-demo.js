import { config } from "../src/config.js";
import { localDayKey } from "../src/memory-model.js";
const cfg = config();
const base = process.env.ENGRAM_URL || `http://${cfg.host}:${cfg.port}`;
const patient_id = cfg.subjectIds[0];
async function call(path, value, admin = true) {
  const response = await fetch(base + path, {
    method: value ? "POST" : "GET", signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${admin ? cfg.adminToken : cfg.companionToken}`, "Content-Type": "application/json" },
    ...(value ? { body: JSON.stringify(value) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path} failed (HTTP ${response.status})`);
  return result;
}
const now = Date.now();
for (let index = 0; index < 4; index++) await call("/episodes", {
  id: `practice_demo_${now}_${index}`, patient_id,
  start: new Date(now - (index + 1) * 86400000).toISOString(), people: [],
  gist: `Fictional demo: a photo album was reviewed on day ${index + 1}.`,
  confidence: 0.95, salience: 0.8, status: "carer_verified",
  evidence: { text: `FICTIONAL caregiver report: We looked at the photo album on day ${index + 1}.`, source_type: "caregiver_report" }
});
const day = localDayKey(new Date(), cfg.timezone);
const list = await call("/admin/rehearsals/generate", { patient_id, day });
if (!list.episodes.length) throw new Error("Today's immutable review is already empty; run this demo with a fresh local server or test patient");
const episode = list.episodes[0];
const attempt = { patient_id, episode_id: episode.id, attempt_id: `demo_attempt_${now}`, cue_level: 3, outcome: "recalled" };
const result = await call("/recall-attempts", attempt, false);
const replay = await call("/recall-attempts", attempt, false);
if (result.state.stabilityDays !== episode.state.stabilityDays) throw new Error("Answer shown must not increase stability");
if (replay.state.version !== result.state.version) throw new Error("Retry changed state twice");
console.log(JSON.stringify({ passed: true, review_day: day, selected: list.episodes.length, daily_cap: list.dailyLimit,
  answer_shown_no_gain: true, retry_no_double_update: true, experimental: true }, null, 2));
