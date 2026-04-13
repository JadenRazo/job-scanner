// Domain → ATS auto-discovery helper. Not a job scraper — kept out of the
// `scrapers` registry. Phase 2+ will use this to bootstrap new companies.
import type { AtsKind } from "./types.js";

export async function discoverAts(_domain: string): Promise<{ ats: AtsKind; slug: string } | null> {
  return null;
}
