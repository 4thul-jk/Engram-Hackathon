import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { createStore } from "./store.js";
import { EngramService } from "./service.js";
import { ApiError } from "./validation.js";
import { seedDemo } from "./fixtures.js";
import { TeamContract } from "./team-contract.js";
import { RehearsalService } from "./rehearsal.js";
import { AnswerService } from "./answer.js";
import { TriggerContract } from "./trigger-contract.js";
import { AssistanceService } from "./assistance.js";
import { LifeRecords } from "./life-records.js";
import { MemoryContext } from "./memory-context.js";

function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function body(req) {
  let bytes = 0, chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 128 * 1024) throw new ApiError(413, "Request too large");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, "Expected a JSON object"); }
}
export function makeServer(service, cfg) {
  const team = new TeamContract(service);
  const rehearsal = new RehearsalService(service);
  const answers = new AnswerService(service, cfg);
  const triggers = new TriggerContract(service);
  const assistance = new AssistanceService(service);
  const life = new LifeRecords(service);
  const memoryContext = new MemoryContext(service);
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    const own = `http://${req.headers.host}`;
    if (origin && origin !== own && !cfg.origins.includes(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" }); res.end('{"error":"Origin not allowed"}'); return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(new URL("../public/index.html", import.meta.url));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'" });
        res.end(html); return;
      }
      if (url.pathname === "/health" && req.method === "GET") {
        send(200, { ok: true, mode: service.store.mode, contextProcessing: cfg.contextProcessing, worker: cfg.runWorker,
          localDemo: service.store.mode === "memory", timezone: cfg.timezone }); return;
      }
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      const admin = equal(token, cfg.adminToken);
      if (!admin && !equal(token, cfg.companionToken)) throw new ApiError(401, "Valid bearer token required");
      if ((url.pathname.startsWith("/admin/") || ["/episodes", "/episodes/review", "/plans", "/plans/cancel"].includes(url.pathname)) && !admin) throw new ApiError(403, "Caregiver/backend token required");
      const input = req.method === "POST" ? await body(req) : Object.fromEntries(url.searchParams);
      let result, status = 200;
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case "POST /memory-context": result = await memoryContext.retrieve(input); break;
        case "POST /daily-logs": result = await life.addLog(input); status = result.created ? 201 : 200; break;
        case "POST /admin/daily-logs": result = await life.addLog(input, true); status = result.created ? 201 : 200; break;
        case "GET /daily-logs": result = await life.daily(input); break;
        case "GET /admin/daily-logs": result = await life.daily(input, true); break;
        case "POST /personal-records": result = await life.addPersonal(input); status = result.created ? 201 : 200; break;
        case "POST /admin/personal-records": result = await life.addPersonal(input, true); status = result.created ? 201 : 200; break;
        case "GET /personal-records": result = await life.personal(input); break;
        case "GET /admin/personal-records": result = await life.personal(input, true); break;
        case "POST /admin/life-records/review": result = await life.review(input); break;
        case "POST /admin/devices": result = await assistance.register(input); status = 201; break;
        case "POST /device-events": result = await assistance.telemetry(input); status = 202; break;
        case "GET /device-status": result = await assistance.status(input); break;
        case "POST /assistance/request": result = await assistance.request(input); status = result.created ? 201 : 200; break;
        case "GET /admin/assistance": result = await assistance.queue(input); break;
        case "POST /admin/assistance/acknowledge": result = await assistance.acknowledge(input); break;
        case "POST /plans": result = await triggers.create(input); status = 201; break;
        case "POST /plans/cancel": result = await triggers.cancel(input); break;
        case "POST /context-events": result = await triggers.context(input); status = 202; break;
        case "GET /prompts": result = await triggers.poll(input); break;
        case "POST /prompts/respond": result = await triggers.respond(input); break;
        case "POST /api/answer": result = await answers.answer(input); break;
        case "POST /admin/rehearsals/generate": result = await rehearsal.generate(input); break;
        case "GET /rehearsals": result = await rehearsal.getSet(input); break;
        case "GET /memory-state": result = await rehearsal.readState(input); break;
        case "POST /recall-attempts": result = await rehearsal.attempt(input); break;
        case "POST /episodes": result = await team.ingest(input); status = result.created ? 201 : 200; break;
        case "POST /episodes/review": result = await team.review(input); break;
        case "POST /retrieve": result = await team.retrieve(input); break;
        case "POST /api/recall": result = await service.recall(input); break;
        case "GET /api/plans": result = await service.upcoming(input); break;
        case "GET /api/person": result = await service.person(input); break;
        case "GET /api/prompts": result = await service.prompts(input.subjectId); break;
        case "POST /api/prompts/respond": result = await service.respond(input); break;
        case "POST /api/context-events": result = await service.context(input); status = 202; break;
        case "POST /admin/sources": result = await service.addSource(input); status = 201; break;
        case "POST /admin/people": result = await service.addPerson(input); status = 201; break;
        case "POST /admin/episodes": result = await service.addEpisode(input); status = 201; break;
        case "POST /admin/plans": result = await service.createPlan(input); status = 201; break;
        case "POST /admin/plans/cancel": result = await service.cancelPlan(input); break;
        case "GET /admin/activity": result = await service.activity(input.subjectId); break;
        case "POST /admin/demo/seed":
          if (cfg.mode !== "memory") throw new ApiError(403, "Use the explicit seed script for Atlas");
          result = await seedDemo(service); status = 201; break;
        default: throw new ApiError(404, "Route not found");
      }
      send(status, result);
    } catch (error) {
      // Never print connection strings, request bodies or provider error payloads.
      if (!error.status) console.error("Request failed:", error.name);
      send(error.status || 503, { error: error.status ? error.message : "Service unavailable; check backend configuration and provider access" });
    }
  });
}
export function startWorker(service, intervalMs) {
  const run = () => service.tick().catch(error => console.error("Worker failed:", error.name));
  const timer = setInterval(run, intervalMs);
  run();
  return () => clearInterval(timer);
}
export async function main() {
  const cfg = config();
  const store = await createStore(cfg);
  const service = new EngramService(store, cfg);
  const server = makeServer(service, cfg);
  const stopWorker = cfg.runWorker ? startWorker(service, cfg.intervalMs) : () => {};
  server.listen(cfg.port, cfg.host, () => console.log(`Engram retrieval: http://${cfg.host}:${cfg.port} (${cfg.mode}); timezone ${cfg.timezone}`));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return; stopping = true; stopWorker();
    await new Promise(resolve => server.close(resolve));
    while (service.busy) await new Promise(resolve => setTimeout(resolve, 50));
    await store.close();
  };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  return { server, service, shutdown };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("Startup failed:", error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[redacted]")); process.exitCode = 1; });
}
