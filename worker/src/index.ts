import type { Worker } from "bullmq";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { allQueues } from "./queue/queues.js";
import { connection } from "./queue/connection.js";
import { registerRepeatables } from "./queue/schedulers.js";
import { createScrapeWorker } from "./workers/scrape-worker.js";
import { createMatchCheapWorker } from "./workers/match-cheap-worker.js";
import { createMatchDeepWorker } from "./workers/match-deep-worker.js";
import { createRenderLetterWorker } from "./workers/render-letter-worker.js";
import { createNotifyWorker } from "./workers/notify-worker.js";
import { createArtifactManagersWorker } from "./workers/artifact-managers-worker.js";
import { createArtifactTailorWorker } from "./workers/artifact-tailor-worker.js";
import { closePool } from "./db/client.js";

async function main(): Promise<void> {
  logger.info(
    { nodeEnv: config.NODE_ENV, tz: config.TZ },
    "scanner-worker starting",
  );

  const workers: Worker[] = [
    createScrapeWorker(),
    createMatchCheapWorker(),
    createMatchDeepWorker(),
    createRenderLetterWorker(),
    createNotifyWorker(),
    createArtifactManagersWorker(),
    createArtifactTailorWorker(),
  ];

  await registerRepeatables();
  logger.info({ workers: workers.length }, "workers ready");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    try {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(allQueues.map((q) => q.close()));
      await connection.quit();
      await closePool();
    } catch (err) {
      logger.error({ err }, "error during shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
