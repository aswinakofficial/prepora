import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "./shared.ts";

// ─── Raw Artifacts ────────────────────────────────────────────────────────────
// The immutable, content-addressed record of a single fetch — see
// docs/roadmap/engineering-roadmap.md item 12 and
// apps/pipeline/prepora_pipeline/core/artifact_store.py, which is the only writer of this table.
// A changed page is a new artifact (a new sha256), never an update to an existing row — this is
// what makes change detection in a later item nearly free, and what lets a parser fix replay
// stored artifacts instead of re-crawling.

export const rawArtifacts = pgTable(
  "raw_artifacts",
  {
    id: id(),
    sha256: text("sha256").notNull().unique(),
    sourceSlug: text("source_slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentType: text("content_type").notNull(),
    httpStatus: integer("http_status"),
    storageKey: text("storage_key").notNull(),
    // Conditional-request validators (item 17) — stored so the next fetch of this exact URL can
    // send If-None-Match/If-Modified-Since and skip re-downloading unchanged content entirely.
    etag: text("etag"),
    lastModified: text("last_modified"),
    ...timestamps,
  },
  (t) => [
    index("raw_artifacts_source_slug_idx").on(t.sourceSlug),
    index("raw_artifacts_fetched_at_idx").on(t.fetchedAt),
    index("raw_artifacts_source_url_idx").on(t.sourceUrl),
  ],
);
