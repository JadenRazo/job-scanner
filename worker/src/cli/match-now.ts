import { matchCheapQueue } from "../queue/queues.js";
import { connection } from "../queue/connection.js";
import { pool } from "../db/client.js";

/**
 * Enqueue a one-off match-cheap pass and exit. Used for manual testing:
 *
 *   docker exec scanner-worker node dist/cli/match-now.js
 */
async function main(): Promise<void> {
  const job = await matchCheapQueue.add(
    "stage2-pass",
    { trigger: "manual", at: new Date().toISOString() },
    { removeOnComplete: { age: 3600, count: 100 } },
  );
  // eslint-disable-next-line no-console
  console.log(`enqueued match-cheap job id=${job.id}`);
  await matchCheapQueue.close();
  await connection.quit();
  await pool.end();
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error("match-now failed:", err);
    process.exit(1);
  },
);
