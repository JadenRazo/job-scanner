import { scrapeQueue } from "./queues.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "schedulers" });

const HOUR_MS = 60 * 60 * 1000;

/**
 * Tier-aware scrape cadence. Tier 1 (DevTools/Observability — user's
 * highest-signal lane) gets the fastest refresh; F500 non-tech Workday
 * roster gets daily. Aggregators (tier 7) are single-call-for-many-jobs
 * so we can afford to hit them every 4h.
 */
const TIER_SCHEDULES: Array<{ tier: number; everyMs: number; label: string }> = [
  { tier: 1, everyMs:  2 * HOUR_MS, label: "tier1-infra-devtools" },
  { tier: 2, everyMs:  4 * HOUR_MS, label: "tier2-ai-scaleups" },
  { tier: 3, everyMs:  6 * HOUR_MS, label: "tier3-fintech-saas" },
  { tier: 4, everyMs:  6 * HOUR_MS, label: "tier4-bigtech" },
  { tier: 5, everyMs: 12 * HOUR_MS, label: "tier5-media-enterprise" },
  { tier: 6, everyMs: 24 * HOUR_MS, label: "tier6-f500" },
  { tier: 7, everyMs:  4 * HOUR_MS, label: "tier7-aggregators" },
];

/**
 * Clean up any leftover old "scrape-all" repeatable from the pre-tier era.
 * BullMQ stores repeatables under a synthetic key; we look them up and
 * remove anything that isn't one of the tier-scoped jobIds we're about to
 * register.
 */
async function pruneLegacyRepeatables(): Promise<void> {
  try {
    const repeatables = await scrapeQueue.getRepeatableJobs();
    const wanted = new Set<string>([
      ...TIER_SCHEDULES.map((s) => `scrape-tier-${s.tier}`),
      // leave manual "scrape-all" / "scrape-company" jobs alone
    ]);
    for (const r of repeatables) {
      if (!wanted.has(r.id ?? r.name) && r.name !== "scrape-company") {
        await scrapeQueue.removeRepeatableByKey(r.key);
        log.info({ id: r.id, name: r.name, key: r.key }, "pruned legacy repeatable");
      }
    }
  } catch (err) {
    log.warn({ err: (err as Error).message }, "pruneLegacyRepeatables failed — continuing");
  }
}

/**
 * Register the per-tier repeatable scrape jobs. BullMQ dedupes by jobId
 * so calling this at every startup is idempotent.
 */
export async function registerRepeatables(): Promise<void> {
  await pruneLegacyRepeatables();

  for (const s of TIER_SCHEDULES) {
    const jobId = `scrape-tier-${s.tier}`;
    await scrapeQueue.add(
      "scrape-tiers",
      { tiers: [s.tier], label: s.label },
      {
        repeat: { every: s.everyMs },
        jobId,
      },
    );
    logger.info({ jobId, tier: s.tier, everyMs: s.everyMs, label: s.label }, "repeatable registered");
  }
}
