import { ORPCError } from "@orpc/server";

// Connectors that can only run on a developer machine. Microsoft Learn's scraper drives a real
// Playwright browser on the machine running apps/scraper and needs an interactive Microsoft
// sign-in in that browser window — neither exists in a deployed environment, and pipeline
// execution is local-only by decision (docs/adr/007-local-and-cloud-execution.md). Outside local
// development these connectors are locked: the admin UI shows them as unavailable, and every
// procedure that would reach them refuses. ALLOW_LOCAL_ONLY_SCRAPERS=true lifts the lock for a
// build that really does have the scraper running next to it.
const LOCAL_ONLY_CONNECTORS: Record<string, string> = {
  mslearn:
    "Microsoft Learn scraping runs only locally: it needs a real browser and an interactive Microsoft sign-in on the machine running the scraper.",
};

// Fails closed: available only where NODE_ENV explicitly says development or test. A deployed
// Worker may not have NODE_ENV set at all, and "unset" must not mean "unlocked".
const UNLOCKED_ENVIRONMENTS = new Set(["development", "test"]);

function isLockedEnvironment(): boolean {
  if (process.env.ALLOW_LOCAL_ONLY_SCRAPERS === "true") return false;
  return !UNLOCKED_ENVIRONMENTS.has(process.env.NODE_ENV ?? "");
}

/** Why this connector can't be used here, or null when it can. */
export function localOnlyLockReason(connectorName: string): string | null {
  return isLockedEnvironment() ? (LOCAL_ONLY_CONNECTORS[connectorName] ?? null) : null;
}

/** Server-side guard for any procedure that drives a local-only connector. */
export function assertConnectorAvailable(connectorName: string): void {
  const reason = localOnlyLockReason(connectorName);
  if (reason) throw new ORPCError("FORBIDDEN", { message: reason });
}

/** MS Learn is identified by URL where a procedure only has the target URL to go on. */
export function connectorForUrl(url: string | undefined): string | null {
  return url?.includes("learn.microsoft.com") ? "mslearn" : null;
}
