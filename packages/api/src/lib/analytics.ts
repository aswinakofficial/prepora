import type { getDb } from "@prepora/db";
import { analyticsEvents, practiceSessions, searchQueries } from "@prepora/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 27: `analyticsEvents` was dead schema — nothing ever
// wrote to it, so there was no way to know which content gets used, which searches fail, or where
// students drop out. This is the real, database-backed logic behind analytics.router.ts, extracted
// the same way lib/attempts.ts and lib/sitemap.ts are for direct unit testability.
//
// Two event types the schema anticipates — "bookmark" and "report" — have no wired call site yet:
// neither a bookmarking feature nor a "report this question" UI exists anywhere in the app today
// (packages/db/src/schema/users.ts's `bookmarks` and `reports` tables are themselves still
// completely unused, same as `contributions` was before item 24). The literal event names are kept
// in the union below so a future feature can start emitting them without a schema/type change, but
// nothing in this item invents UI for either.

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "search",
  "result_click",
  "question_view",
  "answer_reveal",
  "practice_start",
  "practice_complete",
  "bookmark",
  "contribution",
  "report",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface AnalyticsEventInput {
  event: AnalyticsEventType;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Writes a batch of events for one session/user in one insert. Exactly one of userId/sessionId is
 * ever stored per row — a signed-in caller's events are never also tagged with the anonymous
 * session id that was active before they signed in, keeping anonymous and authenticated analytics
 * strictly separate, per the item's explicit requirement.
 */
export async function recordEvents(
  db: ReturnType<typeof getDb>,
  events: AnalyticsEventInput[],
  attribution: { userId?: string | null; sessionId?: string | null },
): Promise<{ inserted: number }> {
  if (events.length === 0) return { inserted: 0 };

  const userId = attribution.userId ?? null;
  const sessionId = userId ? null : (attribution.sessionId ?? null);

  await db.insert(analyticsEvents).values(
    events.map((e) => ({
      event: e.event,
      userId,
      sessionId,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      meta: e.meta ? JSON.stringify(e.meta) : null,
    })),
  );

  return { inserted: events.length };
}

export interface EventTypeCount {
  event: string;
  count: number;
}

/** Event counts by type over the last `sinceDays` days — the admin dashboard's headline numbers. */
export async function getEventCountsByType(
  db: ReturnType<typeof getDb>,
  sinceDays = 30,
): Promise<EventTypeCount[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const result = await db
    .select({ event: analyticsEvents.event, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.event)
    .orderBy(desc(sql`count(*)`));
  return result;
}

export interface SearchFailureStats {
  totalSearches: number;
  zeroResultSearches: number;
  zeroResultRate: number;
}

/** What fraction of real searches return nothing — the single most actionable "what to scrape
 * next" signal this item exists to produce. */
export async function getSearchFailureStats(
  db: ReturnType<typeof getDb>,
  sinceDays = 30,
): Promise<SearchFailureStats> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      zeroResult: sql<number>`count(*) filter (where ${searchQueries.resultCount} = 0)::int`,
    })
    .from(searchQueries)
    .where(gte(searchQueries.createdAt, since));

  const total = row?.total ?? 0;
  const zeroResultSearches = row?.zeroResult ?? 0;
  return {
    totalSearches: total,
    zeroResultSearches,
    zeroResultRate: total > 0 ? zeroResultSearches / total : 0,
  };
}

export interface PracticeFunnelStats {
  started: number;
  completed: number;
  completionRate: number;
}

/** Practice sessions started vs. finished — the drop-out signal the item's Goal names directly. */
export async function getPracticeFunnelStats(
  db: ReturnType<typeof getDb>,
  sinceDays = 30,
): Promise<PracticeFunnelStats> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      started: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${practiceSessions.completedAt} is not null)::int`,
    })
    .from(practiceSessions)
    .where(gte(practiceSessions.createdAt, since));

  const started = row?.started ?? 0;
  const completed = row?.completed ?? 0;
  return {
    started,
    completed,
    completionRate: started > 0 ? completed / started : 0,
  };
}

export interface TopEntity {
  entityId: string;
  count: number;
}

/** The most-viewed entities of a given type (e.g. "question") — what content actually gets used. */
export async function getTopViewedEntities(
  db: ReturnType<typeof getDb>,
  event: AnalyticsEventType,
  entityType: string,
  limit = 10,
): Promise<TopEntity[]> {
  const result = await db
    .select({ entityId: analyticsEvents.entityId, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.event, event), eq(analyticsEvents.entityType, entityType)))
    .groupBy(analyticsEvents.entityId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return result
    .filter((r): r is { entityId: string; count: number } => r.entityId !== null)
    .map((r) => ({ entityId: r.entityId, count: r.count }));
}
