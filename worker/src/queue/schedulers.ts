import { scrapeQueue } from "./queues.js";
import { logger } from "../logger.js";

const SCRAPE_ALL_JOB = "scrape-all";
const EVERY_2H_MS = 2 * 60 * 60 * 1000;

/**
 * Register the repeatable "scrape-all" job. BullMQ dedupes by jobId so calling
 * this at every startup is idempotent.
 */
export async function registerRepeatables(): Promise<void> {
  await scrapeQueue.add(
    SCRAPE_ALL_JOB,
    {},
    {
      repeat: { every: EVERY_2H_MS },
      jobId: SCRAPE_ALL_JOB,
    },
  );
  logger.info({ job: SCRAPE_ALL_JOB, everyMs: EVERY_2H_MS }, "repeatable registered");
}
