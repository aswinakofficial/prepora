import { getDb } from "@prepora/db";
import { pipelineJobs } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeSourceHealthStats,
  DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD,
  isSourceDegraded,
} from "./pipeline-health.ts";

// docs/roadmap/engineering-roadmap.md item 21: "Integration: a source with recent failures shows
// as degraded." Requires DATABASE_URL — matches the live-database testing convention already
// established across apps/pipeline's own test suite. Every test uses a unique source_id and
// cleans up its own pipeline_jobs rows afterward.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("pipeline-health", () => {
  const createdSourceIds: string[] = [];

  afterEach(async () => {
    if (createdSourceIds.length === 0) return;
    const db = getDb();
    for (const sourceId of createdSourceIds.splice(0)) {
      await db.delete(pipelineJobs).where(eq(pipelineJobs.sourceId, sourceId));
    }
  });

  function uniqueSourceId(label: string) {
    const id = `test-health-${label}-${crypto.randomUUID()}`;
    createdSourceIds.push(id);
    return id;
  }

  describe("isSourceDegraded", () => {
    it("is false below the threshold", () => {
      expect(isSourceDegraded(DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD - 1)).toBe(false);
    });

    it("is true at and above the threshold", () => {
      expect(isSourceDegraded(DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD)).toBe(true);
      expect(isSourceDegraded(DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD + 5)).toBe(true);
    });
  });

  describe("computeSourceHealthStats", () => {
    it("has no entry for a source with no pipeline_jobs history", async () => {
      const db = getDb();
      const stats = await computeSourceHealthStats(db);
      expect(stats.has(uniqueSourceId("nonexistent"))).toBe(false);
    });

    it("reports a nonzero error rate when some recent jobs failed", async () => {
      const db = getDb();
      const sourceId = uniqueSourceId("mixed");

      await db.insert(pipelineJobs).values([
        { sourceId, jobType: "scrape", triggerType: "manual", status: "completed" },
        { sourceId, jobType: "scrape", triggerType: "manual", status: "completed" },
        { sourceId, jobType: "scrape", triggerType: "manual", status: "failed" },
      ]);

      const stats = await computeSourceHealthStats(db);
      const entry = stats.get(sourceId);

      expect(entry).toBeDefined();
      expect(entry?.recentJobCount).toBe(3);
      expect(entry?.recentFailedCount).toBe(1);
      expect(entry?.errorRate).toBeCloseTo(1 / 3, 5);
    });

    it("reports a 0 error rate — not null — when every recent job succeeded", async () => {
      const db = getDb();
      const sourceId = uniqueSourceId("all-success");

      await db
        .insert(pipelineJobs)
        .values([{ sourceId, jobType: "scrape", triggerType: "manual", status: "completed" }]);

      const stats = await computeSourceHealthStats(db);
      expect(stats.get(sourceId)?.errorRate).toBe(0);
    });

    it("computes average runtime from started_at/completed_at", async () => {
      const db = getDb();
      const sourceId = uniqueSourceId("runtime");
      const startedAt = new Date("2025-01-01T00:00:00Z");
      const completedAt = new Date("2025-01-01T00:00:05Z"); // 5000ms later

      await db.insert(pipelineJobs).values({
        sourceId,
        jobType: "scrape",
        triggerType: "manual",
        status: "completed",
        startedAt,
        completedAt,
      });

      const stats = await computeSourceHealthStats(db);
      expect(stats.get(sourceId)?.averageRuntimeMs).toBeCloseTo(5000, -1);
    });

    it("leaves averageRuntimeMs null when no job has both timestamps set", async () => {
      const db = getDb();
      const sourceId = uniqueSourceId("no-timestamps");

      await db
        .insert(pipelineJobs)
        .values([{ sourceId, jobType: "scrape", triggerType: "manual", status: "queued" }]);

      const stats = await computeSourceHealthStats(db);
      expect(stats.get(sourceId)?.averageRuntimeMs).toBeNull();
    });
  });
});
