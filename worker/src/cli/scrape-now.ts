import { scrapeQueue } from "../queue/queues.js";
import { connection } from "../queue/connection.js";
import { pool } from "../db/client.js";

/**
 * Enqueue a one-off scrape-all and exit. Used from the host via:
 *   docker exec scanner-worker node dist/cli/scrape-now.js
 */
async function main(): Promise<void> {
  const job = await scrapeQueue.add(
    "scrape-all",
    { trigger: "manual", at: new Date().toISOString() },
    { removeOnComplete: { age: 3600, count: 100 } },
  );
  // eslint-disable-next-line no-console
  console.log(`enqueued scrape-all job id=${job.id}`);
  await scrapeQueue.close();
  await connection.quit();
  await pool.end();
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error("scrape-now failed:", err);
    process.exit(1);
  },
);
