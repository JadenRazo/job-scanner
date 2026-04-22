import type { Scraper, AtsKind } from "./types.js";
// Standard ATS platforms
import { greenhouseScraper } from "./greenhouse.js";
import { leverScraper } from "./lever.js";
import { ashbyScraper } from "./ashby.js";
import { workdayScraper } from "./workday.js";
import { smartrecruitersScraper } from "./smartrecruiters.js";
import { jazzhrScraper } from "./jazzhr.js";
import { bamboohrScraper } from "./bamboohr.js";
import { icimsScraper } from "./icims.js";
// Big Tech custom careers APIs
import { googleScraper } from "./google.js";
import { metaScraper } from "./meta.js";
import { amazonScraper } from "./amazon.js";
import { appleScraper } from "./apple.js";
import { microsoftScraper } from "./microsoft.js";
// Aggregator sources
import { remoteokScraper } from "./remoteok.js";
import { remotiveScraper } from "./remotive.js";
import { ycWafsScraper } from "./yc_wafs.js";
import { hnHiringScraper } from "./hn_hiring.js";
import { simplifyjobsScraper } from "./simplifyjobs.js";

export const scrapers: Record<AtsKind, Scraper> = {
  greenhouse: greenhouseScraper,
  lever: leverScraper,
  ashby: ashbyScraper,
  workday: workdayScraper,
  smartrecruiters: smartrecruitersScraper,
  jazzhr: jazzhrScraper,
  bamboohr: bamboohrScraper,
  icims: icimsScraper,
  google: googleScraper,
  meta: metaScraper,
  amazon: amazonScraper,
  apple: appleScraper,
  microsoft: microsoftScraper,
  remoteok: remoteokScraper,
  remotive: remotiveScraper,
  yc_wafs: ycWafsScraper,
  hn_hiring: hnHiringScraper,
  simplifyjobs: simplifyjobsScraper,
};

export function scraperFor(ats: AtsKind): Scraper {
  return scrapers[ats];
}
