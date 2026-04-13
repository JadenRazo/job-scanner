import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import { logger } from "../logger.js";

export function createMatchDeepWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.matchDeep,
    async (job) => {
      logger.info({ id: job.id }, "match-deep stub invoked");
      // Phase 2: run stage3Sonnet, persist letter body, enqueue render-letter.
      return { ok: true };
    },
    { connection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ id: job?.id, err: err.message }, "match-deep job failed");
  });

  return worker;
}
