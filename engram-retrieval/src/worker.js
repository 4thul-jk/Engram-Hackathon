import { config } from "./config.js";
import { createStore } from "./store.js";
import { EngramService } from "./service.js";
import { startWorker } from "./server.js";
const cfg = config();
if (cfg.mode !== "mongodb") throw new Error("Separate worker requires STORE=mongodb; memory mode runs its worker inside npm start");
const store = await createStore(cfg);
const service = new EngramService(store, cfg);
const stop = startWorker(service, cfg.intervalMs);
console.log("Engram reminder worker started");
async function shutdown() {
  stop();
  while (service.busy) await new Promise(resolve => setTimeout(resolve, 50));
  await store.close();
}
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
