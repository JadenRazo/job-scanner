import type { Scraper, AtsKind } from "./types.js";
import { greenhouseScraper } from "./greenhouse.js";
import { leverScraper } from "./lever.js";
import { ashbyScraper } from "./ashby.js";
import { workdayScraper } from "./workday.js";
import { smartrecruitersScraper } from "./smartrecruiters.js";
import { jazzhrScraper } from "./jazzhr.js";
import { bamboohrScraper } from "./bamboohr.js";
import { icimsScraper } from "./icims.js";

export const scrapers: Record<AtsKind, Scraper> = {
  greenhouse: greenhouseScraper,
  lever: leverScraper,
  ashby: ashbyScraper,
  workday: workdayScraper,
  smartrecruiters: smartrecruitersScraper,
  jazzhr: jazzhrScraper,
  bamboohr: bamboohrScraper,
  icims: icimsScraper,
};

export function scraperFor(ats: AtsKind): Scraper {
  return scrapers[ats];
}
