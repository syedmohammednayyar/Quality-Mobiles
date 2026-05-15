import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./db/mongodb.js";
import { ensureFixedStores } from "./modules/stores/stores.service.js";

async function start() {
  await connectDB();
  await ensureFixedStores();

  app.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
