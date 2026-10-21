import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectDatabase } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env") });

const appConfig = loadConfig();

const { client, db } = await connectDatabase(appConfig.mongodbUri).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database error";
  console.error(`MongoDB connection failed. Check MONGODB_URI. ${message}`);
  process.exit(1);
});

const app = createApp(db, appConfig);
const server = app.listen(appConfig.port, () => {
  console.log(`API listening on http://127.0.0.1:${appConfig.port}`);
  console.log(`LiveKit configuration: ${appConfig.livekit.state}`);
});

async function shutdown() {
  server.close();
  await client.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
