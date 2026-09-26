import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, robotsReviewStatusEnum, timestamps } from "./shared.ts";

// ─── Sources ──────────────────────────────────────────────────────────────────
// The single source of truth for what the pipeline is allowed to scrape — see
// docs/roadmap/engineering-roadmap.md item 14. Static fields (name, baseUrl, sourceType,
// connectorName, requiresAuth, crawlPolicy, rateLimit, robotsReviewStatus) are defined once per
// connector in a source.yaml file and synced into this table by
// apps/pipeline/prepora_pipeline/core/registry.py; mutable operational state (enabled,
// lastCrawlAt, lastSuccessfulCrawlAt, consecutiveFailures) lives only here and is never
// overwritten by a sync. apps/scraper/security.py's fetch allowlist derives from this table's
// baseUrl column for every enabled row — the registry and the security boundary are one
// mechanism, not two that can silently disagree.

export const sources = pgTable(
  "sources",
  {
    id: id(),
    name: text("name").notNull().unique(), // slug, e.g. "ms-learn" — the sync key from source.yaml
    baseUrl: text("base_url").notNull(),
    sourceType: text("source_type"), // free text, e.g. "certification" | "government" — a site
    // category, not the content-provenance sourceTypeEnum questionSets already uses
    connectorName: text("connector_name").notNull(), // which apps/scraper handler / future
    // apps/pipeline connector implements this source
    requiresAuth: boolean("requires_auth").notNull().default(false),
    crawlPolicy: jsonb("crawl_policy"), // { maxDepth, maxPages }
    rateLimit: jsonb("rate_limit"), // { requestsPerMinute }
    robotsReviewStatus: robotsReviewStatusEnum("robots_review_status")
      .notNull()
      .default("not_reviewed"),
    enabled: boolean("enabled").notNull().default(true),
    lastCrawlAt: timestamp("last_crawl_at", { withTimezone: true }),
    lastSuccessfulCrawlAt: timestamp("last_successful_crawl_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("sources_enabled_idx").on(t.enabled)],
);
