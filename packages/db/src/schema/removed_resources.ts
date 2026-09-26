import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { id, removedResourceStatusEnum, timestamps } from "./shared.ts";

// ─── Removed Resources ────────────────────────────────────────────────────────
// A URL that was previously discoverable for a source but is absent from its most recent
// discovery pass — see docs/roadmap/engineering-roadmap.md item 17. A source going dark (or a
// page moving/being deleted) must never silently unpublish content, so this flags for human
// review instead of deleting anything. The only writer is
// apps/pipeline/prepora_pipeline/stages/change_detection.py.

export const removedResources = pgTable(
  "removed_resources",
  {
    id: id(),
    sourceSlug: text("source_slug").notNull(),
    url: text("url").notNull(),
    lastSeenSha256: text("last_seen_sha256"), // the raw_artifacts.sha256 last seen at this URL
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    status: removedResourceStatusEnum("status").notNull().default("flagged"),
    ...timestamps,
  },
  (t) => [
    unique("removed_resources_source_slug_url_unique").on(t.sourceSlug, t.url),
    index("removed_resources_status_idx").on(t.status),
  ],
);
