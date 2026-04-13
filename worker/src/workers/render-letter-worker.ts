import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import { logger } from "../logger.js";

export function createRenderLetterWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.renderLetter,
    async (job) => {
      logger.info({ id: job.id }, "render-letter stub invoked");
      // Phase 2: call renderLetterPdf({company, role, bodyText}) and store path.
      return { ok: true };
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ id: job?.id, err: err.message }, "render-letter job failed");
  });

  return worker;
}
