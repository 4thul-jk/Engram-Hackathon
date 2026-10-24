import { writeFile } from "node:fs/promises";
import { config } from "../src/config.js";
import { contextStreamPipeline } from "../src/stream-pipeline.js";
const cfg = config();
const pipeline = contextStreamPipeline({ connectionName: process.env.STREAM_CONNECTION_NAME || "engramAtlas", database: cfg.database });
await writeFile(new URL("../atlas/context-pipeline.json", import.meta.url), JSON.stringify(pipeline, null, 2) + "\n");
console.log("Prepared atlas/context-pipeline.json. No deployment or service setting was changed.");
