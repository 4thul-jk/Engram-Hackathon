import { config } from "../src/config.js";
import { createStore } from "../src/store.js";
import { EngramService } from "../src/service.js";
import { seedDemo } from "../src/fixtures.js";
const cfg = config();
if (cfg.mode !== "mongodb") throw new Error("Use the demo page to seed in-memory mode");
if (process.env.CONFIRM_DEMO_SEED !== "yes") throw new Error("Set CONFIRM_DEMO_SEED=yes to add fictional records to your configured Atlas database");
const store = await createStore(cfg);
try { console.log(JSON.stringify(await seedDemo(new EngramService(store, cfg)), null, 2)); }
finally { await store.close(); }
