import { ORPCError } from "@orpc/server";

// Scraping and publishing run only in local development (docs/adr/007-local-and-cloud-execution.md).
// Both go through Python services that run next to the app on a developer's machine — the scraper
// (apps/scraper: a real browser, an interactive Microsoft sign-in, local image storage) and the
// pipeline (apps/pipeline: validation, deduplication, publishing). The deployed site has neither.
// Outside local development both are locked: the admin pages show them as locked, and the
// gateways in routers/admin.router.ts (fetchScraper, fetchPipeline) refuse before any request
// leaves the server. Publishing locally still writes to the same database the live site reads.
//
// ALLOW_LOCAL_ONLY_SCRAPERS=true lifts both locks, for a build that really does have these services
// running next to it (the name predates publishing being covered too).
const SCRAPING_LOCKED_REASON =
  "Scraping runs only in local development: the scraper service needs a real browser, an interactive Microsoft sign-in and local disk storage, none of which the deployed site has.";

const PUBLISHING_LOCKED_REASON =
  "Approving publishes through the pipeline service, which runs only in local development. Approve from your local setup (pnpm dev) — it publishes into the same database, so the questions appear here. Rejecting works anywhere.";

// Fails closed: available only where NODE_ENV explicitly says development or test. A deployed
// Worker may not have NODE_ENV set at all, and "unset" must not mean "unlocked".
const UNLOCKED_ENVIRONMENTS = new Set(["development", "test"]);

function isLocked(): boolean {
  if (process.env.ALLOW_LOCAL_ONLY_SCRAPERS === "true") return false;
  return !UNLOCKED_ENVIRONMENTS.has(process.env.NODE_ENV ?? "");
}

/** Why scraping can't be used here, or null when it can. */
export function scrapingLockReason(): string | null {
  return isLocked() ? SCRAPING_LOCKED_REASON : null;
}

/** Why approving (publishing) can't be used here, or null when it can. */
export function publishingLockReason(): string | null {
  return isLocked() ? PUBLISHING_LOCKED_REASON : null;
}

/** Server-side guard: throws FORBIDDEN wherever scraping is locked. */
export function assertScrapingAvailable(): void {
  const reason = scrapingLockReason();
  if (reason) throw new ORPCError("FORBIDDEN", { message: reason });
}

/** Server-side guard: throws FORBIDDEN wherever publishing is locked. */
export function assertPublishingAvailable(): void {
  const reason = publishingLockReason();
  if (reason) throw new ORPCError("FORBIDDEN", { message: reason });
}
