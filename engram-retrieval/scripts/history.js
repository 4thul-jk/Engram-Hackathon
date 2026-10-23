import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const raw = execFileSync("git", ["-C", root, "log", "--reverse", "--format=%H%x1f%aI%x1f%cI%x1f%s"], {
  encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true
});
function local(iso, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset"
  }).format(new Date(iso));
}
const commits = raw.trim().split(/\r?\n/).filter(Boolean).map(line => {
  const [sha, authorTime, committerTime, subject] = line.split("\x1f");
  return { sha, authorTime, committerTime, authorIST: local(authorTime, "Asia/Kolkata"),
    authorLondon: local(authorTime, "Europe/London"), subject };
});
if (process.argv.includes("--json")) console.log(JSON.stringify({
  source: "Git metadata; not independent proof of source creation or push times", commits
}, null, 2));
else {
  console.log("Git checkpoints (timestamps are recorded metadata, not source-creation proof).\n");
  console.log("| Commit | Author time IST | Author time London | Change |\n|---|---|---|---|");
  for (const commit of commits) console.log(`| ${commit.sha.slice(0, 7)} | ${commit.authorIST} | ${commit.authorLondon} | ${commit.subject.replace(/\|/g, "\\|")} |`);
  console.log("\nFor author AND committer timestamps, run: npm run project:history -- --json");
}
