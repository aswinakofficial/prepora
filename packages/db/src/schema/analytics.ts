import { pgTable, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { id, timestamps, redirectStatusEnum } from "./shared.ts";
import { users } from "./users.ts";
import { questions } from "./questions.ts";

// ─── Analytics Events ─────────────────────────────────────────────────────────

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id(),
    event: text("event").notNull(),
    sessionId: text("session_id"),
    userId: text("user_id"), // nullable, not FK to avoid cascade issues
    entityType: text("entity_type"), // 'question' | 'exam' | 'topic' | 'question_set'
    entityId: text("entity_id"),
    meta: text("meta"), // JSON string for extra data
    ...timestamps,
  },
  (t) => [
    index("analytics_events_event_idx").on(t.event),
    index("analytics_events_entity_idx").on(t.entityType, t.entityId),
    index("analytics_events_created_at_idx").on(t.createdAt),
  ],
);

// ─── Search Queries ───────────────────────────────────────────────────────────

export const searchQueries = pgTable(
  "search_queries",
  {
    id: id(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    clickedResultId: text("clicked_result_id"),
    sessionId: text("session_id"),
    ...timestamps,
  },
  (t) => [
    index("search_queries_query_idx").on(t.query),
    index("search_queries_result_count_idx").on(t.resultCount),
  ],
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: text("old_value"), // JSON
    newValue: text("new_value"), // JSON
    ...timestamps,
  },
  (t) => [
    index("audit_logs_actor_id_idx").on(t.actorId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

// ─── Redirects ────────────────────────────────────────────────────────────────

export const redirects = pgTable(
  "redirects",
  {
    id: id(),
    fromPath: text("from_path").notNull().unique(),
    toPath: text("to_path").notNull(),
    status: redirectStatusEnum("status").notNull().default("301"),
    reason: text("reason"),
    createdBy: text("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("redirects_from_path_idx").on(t.fromPath)],
);

// ─── Content Versions ─────────────────────────────────────────────────────────

export const contentVersions = pgTable(
  "content_versions",
  {
    id: id(),
    entityType: text("entity_type").notNull(), // 'question' | 'question_set'
    entityId: text("entity_id").notNull(),
    version: integer("version").notNull(),
    snapshot: text("snapshot").notNull(), // JSON snapshot
    createdBy: text("created_by").references(() => users.id),
    changeNote: text("change_note"),
    ...timestamps,
  },
  (t) => [
    index("content_versions_entity_idx").on(t.entityType, t.entityId),
  ],
);
