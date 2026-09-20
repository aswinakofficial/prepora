import type { getDb } from "@prepora/db";
import { pipelineJobs } from "@prepora/db/schema";
import { sql } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 21: source health needs "last successful crawl,
// consecutive failures, average runtime, error rate". The first two already live directly on the
// sources table (item 14's lastSuccessfulCrawlAt/consecutiveFailures) — this module computes the
// two that don't, by aggregating pipeline_jobs, and decides what counts as "degraded".

export const DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD = 2;
const RECENT_JOBS_WINDOW_DAYS = 30;

export interface SourceHealthStats {
  recentJobCount: number;
  recentFailedCount: number;
  // null (not 0) when there's no recent job history at all — a source that has never run isn't
  // "0% error rate", it's "unknown", and the UI should be able to tell the difference.
  errorRate: number | null;
  averageRuntimeMs: number | null;
}

export function isSourceDegraded(consecutiveFailures: number): boolean {
  return consecutiveFailures >= DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD;
}

export const EMPTY_SOURCE_HEALTH_STATS: SourceHealthStats = {
  recentJobCount: 0,
  recentFailedCount: 0,
  errorRate: null,
  averageRuntimeMs: null,
};

/**
 * One grouped query across all sources rather than one query per source — this runs on every
 * listSources call, which drives the admin scraping UI's site cards.
 */
export async function computeSourceHealthStats(
  db: ReturnType<typeof getDb>,
): Promise<Map<string, SourceHealthStats>> {
  const rows = await db
    .select({
      sourceId: pipelineJobs.sourceId,
      recentTotal: sql<number>`count(*) filter (where ${pipelineJobs.createdAt} > now() - (${RECENT_JOBS_WINDOW_DAYS} || ' days')::interval)`,
      recentFailed: sql<number>`count(*) filter (where ${pipelineJobs.status} = 'failed' and ${pipelineJobs.createdAt} > now() - (${RECENT_JOBS_WINDOW_DAYS} || ' days')::interval)`,
      avgRuntimeMs: sql<
        string | null
      >`avg(extract(epoch from (${pipelineJobs.completedAt} - ${pipelineJobs.startedAt})) * 1000)`,
    })
    .from(pipelineJobs)
    .groupBy(pipelineJobs.sourceId);

  const bySourceId = new Map<string, SourceHealthStats>();
  for (const row of rows) {
    const recentTotal = Number(row.recentTotal);
    const recentFailed = Number(row.recentFailed);
    bySourceId.set(row.sourceId, {
      recentJobCount: recentTotal,
      recentFailedCount: recentFailed,
      errorRate: recentTotal > 0 ? recentFailed / recentTotal : null,
      averageRuntimeMs: row.avgRuntimeMs != null ? Number(row.avgRuntimeMs) : null,
    });
  }
  return bySourceId;
}
