import { config } from "../src/config.js";
const cfg = config();
const base = process.env.ENGRAM_URL || `http://${cfg.host}:${cfg.port}`;
const day = process.argv[2];
for (const patient_id of cfg.subjectIds) {
  const response = await fetch(base + "/admin/rehearsals/generate", {
    method: "POST", signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${cfg.adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ patient_id, ...(day ? { day } : {}) })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Review generation failed (HTTP ${response.status})`);
  console.log(JSON.stringify({ patient_id, day: result.day, episode_ids: result.episodes.map(e => e.id), experimental: true }));
}
