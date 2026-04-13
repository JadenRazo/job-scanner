import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { loadProfile } from "../db/profile.js";
import { postMatchEmbed, type MatchEmbedInput } from "../notify/discord.js";

const log = logger.child({ mod: "notify" });

export function createNotifyWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.notify,
    async (job) => {
      const data = job.data as MatchEmbedInput;

      // Profile setting wins over env fallback.
      const profile = await loadProfile();
      const webhook = profile.discordWebhook || config.DISCORD_WEBHOOK_URL;
      if (!webhook) {
        log.warn({ jobId: data.jobId }, "no Discord webhook configured — dropping notify");
        return { ok: false, reason: "no-webhook" };
      }

      await postMatchEmbed(webhook, data);
      return { ok: true, jobId: data.jobId };
    },
    // Serialize so Discord's per-webhook rate limit never bites.
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err: err.message }, "notify job failed");
  });

  return worker;
}
