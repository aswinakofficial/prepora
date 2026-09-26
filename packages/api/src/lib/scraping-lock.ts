import { ORPCError } from "@orpc/server";

// Scraping runs only in local development. The scraper service (apps/scraper) drives a real
// Playwright browser, needs an interactive Microsoft sign-in for MS Learn, and writes question
// images to the local disk — none of which exists in a deployed environment, and pipeline
// execution is local-only by decision (docs/adr/007-local-and-cloud-execution.md). Outside local
// development the whole scraping engine is locked: the admin scraping page shows it as locked,
// and fetchScraper() in routers/admin.router.ts refuses before any request leaves this server, so
// no procedure can reach the scraper. ALLOW_LOCAL_ONLY_SCRAPERS=true lifts the lock for a build
// that really does have the scraper running next to it.
const SCRAPING_LOCKED_REASON =
  "Scraping runs only in local development: the scraper service needs a real browser, an interactive Microsoft sign-in and local disk storage, none of which the deployed site has.";

// Fails closed: available only where NODE_ENV explicitly says development or test. A deployed
// Worker may not have NODE_ENV set at all, and "unset" must not mean "unlocked".
const UNLOCKED_ENVIRONMENTS = new Set(["development", "test"]);

/** Why scraping can't be used here, or null when it can. */
export function scrapingLockReason(): string | null {
  if (process.env.ALLOW_LOCAL_ONLY_SCRAPERS === "true") return null;
  return UNLOCKED_ENVIRONMENTS.has(process.env.NODE_ENV ?? "") ? null : SCRAPING_LOCKED_REASON;
}

/** Server-side guard: throws FORBIDDEN wherever scraping is locked. */
export function assertScrapingAvailable(): void {
  const reason = scrapingLockReason();
  if (reason) throw new ORPCError("FORBIDDEN", { message: reason });
}
