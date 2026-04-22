import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES, matchCheapQueue } from "../queue/queues.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import {
  listEnabledCompanies,
  listEnabledCompaniesByTiers,
  markScanned,
} from "../db/companies.js";
import { ingestJobs } from "../db/ingest.js";
import { startScrapeRun, finishScrapeRun } from "../db/runs.js";
import { scraperFor } from "../scrapers/index.js";
import type { Company } from "../scrapers/types.js";

const log = logger.child({ mod: "scrape-worker" });

/** Jittered inter-company delay: 800-2200ms, ~1 req/s average per ATS. */
function politeDelay(): Promise<void> {
  const ms = 800 + Math.floor(Math.random() * 1400);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneCompany(companyId: number): Promise<void> {
  const runId = await startScrapeRun(companyId);
  let found = 0;
  let newCount = 0;
  let ok = false;
  let error: string | null = null;

  try {
    const [company] = (await listEnabledCompanies()).filter((c) => c.id === companyId);
    if (!company) throw new Error(`company ${companyId} not found or disabled`);

    const scrape = scraperFor(company.ats);
    const jobs = await scrape({ company, userAgent: config.USER_AGENT });
    found = jobs.length;

    const counts = await ingestJobs(jobs);
    newCount = counts.inserted;

    await markScanned(companyId);
    ok = true;

    log.info(
      { company: company.name, ats: company.ats, tier: company.tier, found, newCount, updated: counts.updated },
      "company scraped",
    );
  } catch (err) {
    error = (err as Error).message ?? String(err);
    log.error({ companyId, err: error }, "company scrape failed");
  } finally {
    await finishScrapeRun(runId, { ok, error, found, newCount });
  }
}

async function runCompanies(
  companies: Company[],
  label: string,
): Promise<{ companies: number; totalFound: number; totalNew: number }> {
  log.info({ count: companies.length, label }, "scrape-batch starting");

  let totalFound = 0;
  let totalNew = 0;

  for (const c of companies) {
    const runId = await startScrapeRun(c.id);
    let found = 0;
    let newCount = 0;
    let ok = false;
    let error: string | null = null;

    try {
      const scrape = scraperFor(c.ats);
      const jobs = await scrape({ company: c, userAgent: config.USER_AGENT });
      found = jobs.length;
      const counts = await ingestJobs(jobs);
      newCount = counts.inserted;
      totalFound += found;
      totalNew += newCount;
      await markScanned(c.id);
      ok = true;
      log.info(
        { company: c.name, ats: c.ats, tier: c.tier, found, newCount, updated: counts.updated },
        "company scraped",
      );
    } catch (err) {
      error = (err as Error).message ?? String(err);
      log.error({ company: c.name, ats: c.ats, tier: c.tier, err: error }, "company scrape failed");
    } finally {
      await finishScrapeRun(runId, { ok, error, found, newCount });
    }

    await politeDelay();
  }

  log.info({ companies: companies.length, totalFound, totalNew, label }, "scrape-batch done");
  return { companies: companies.length, totalFound, totalNew };
}

export function createScrapeWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.scrape,
    async (job) => {
      log.info({ id: job.id, name: job.name, data: job.data }, "scrape job");

      // Manual full-roster run (CLI or admin UI trigger).
      if (job.name === "scrape-all") {
        const companies = await listEnabledCompanies();
        const result = await runCompanies(companies, "all");
        await matchCheapQueue.add(
          "stage2-pass",
          { trigger: "post-scrape-all", totalNew: result.totalNew },
          { removeOnComplete: { age: 3600, count: 100 } },
        );
        return result;
      }

      // Tier-scoped scheduled run.
      if (job.name === "scrape-tiers") {
        const data = job.data as { tiers?: number[]; label?: string };
        const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
        if (tiers.length === 0) throw new Error("scrape-tiers missing tiers");

        const companies = await listEnabledCompaniesByTiers(tiers);
        const result = await runCompanies(companies, data.label ?? `tiers:${tiers.join(",")}`);

        // Kick a Stage-2 pass. Stage-1 ordering already prioritizes
        // title_boost + remote + low-tier, so the quota-limited scorer
        // naturally works through the best jobs first.
        await matchCheapQueue.add(
          "stage2-pass",
          { trigger: `post-scrape-tiers-${tiers.join(",")}`, totalNew: result.totalNew },
          { removeOnComplete: { age: 3600, count: 100 } },
        );
        return result;
      }

      if (job.name === "scrape-company") {
        const companyId = Number((job.data as { companyId?: number }).companyId);
        if (!Number.isFinite(companyId)) throw new Error("scrape-company missing companyId");
        await runOneCompany(companyId);
        return { ok: true, companyId };
      }

      log.warn({ name: job.name }, "unknown scrape job name");
      return { ok: false, reason: "unknown-job-name" };
    },
    // Serialize scrapes so a polite 1-req/s pacing holds across all ATSes.
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err: err.message }, "scrape job failed");
  });

  return worker;
}
