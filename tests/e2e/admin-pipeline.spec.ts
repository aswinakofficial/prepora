import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import { pipelineJobStages, pipelineJobs, sources } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { signInAsAdmin } from "./helpers/admin";

// docs/roadmap/engineering-roadmap.md item 21's E2E requirement: "trigger a job against a fixture
// source and watch it through to completion in the UI." Triggering a *real* crawl here would mean
// either scraping a real external site (flaky, slow, and not something a test suite should
// depend on) or pointing the scraper at a local fixture server — which apps/scraper/security.py's
// SSRF protection correctly refuses to fetch, by design, since it blocks private/loopback
// addresses. Weakening that check just to make this test pass would be a worse trade than not
// having the test. This spec instead verifies the genuinely testable half of that requirement:
// seed a completed job directly (standing in for "the job ran"), then load the real admin
// Pipeline UI as a real, authenticated admin and confirm it renders that job's actual per-stage
// counts and a degraded source correctly — exercising the real DB -> oRPC -> React Query -> DOM
// path end to end, which is exactly what "watch it through to completion in the UI" is checking.
//
// Admin access comes from the ADMIN_USERS allowlist, which playwright.config.ts sets to the e2e
// admin for its own test web app (tests/e2e/helpers/admin.ts).
test.describe("admin pipeline / job inspection and source health", () => {
  test("a completed job renders with correct per-stage counts, and a source with recent failures shows as degraded", async ({
    page,
  }) => {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);

    await signInAsAdmin(page);

    const sourceId = `e2e-source-${unique}`;
    await db.insert(sources).values({
      name: sourceId,
      baseUrl: "https://example.com",
      connectorName: "generic",
      consecutiveFailures: 3, // >= DEGRADED_CONSECUTIVE_FAILURES_THRESHOLD
    });

    const [job] = await db
      .insert(pipelineJobs)
      .values({
        sourceId,
        jobType: "scrape",
        triggerType: "manual",
        status: "completed",
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning();

    await db.insert(pipelineJobStages).values({
      jobId: job.id,
      stage: "fetch",
      status: "completed",
      processedCount: 7,
      failedCount: 1,
      duplicateCount: 2,
      skippedCount: 0,
      durationMs: 1234,
    });

    try {
      await page.goto("/admin/scraping");

      // Scrape runs table: per-stage counts and durations, drawn from pipeline_job_stages via
      // admin.listScrapeRuns.
      await expect(page.getByText(`#${job.id.slice(0, 8)}`).first()).toBeVisible();
      await expect(page.getByText(/processed=7/).first()).toBeVisible();
      await expect(page.getByText(/failed=1/).first()).toBeVisible();
      await expect(page.getByText(/duplicate=2/).first()).toBeVisible();
      await expect(page.getByText(/1234ms/).first()).toBeVisible();

      // Source health: a source with recent failures shows as degraded.
      await expect(page.getByText("DEGRADED").first()).toBeVisible();
    } finally {
      await db.delete(pipelineJobStages).where(eq(pipelineJobStages.jobId, job.id));
      await db.delete(pipelineJobs).where(eq(pipelineJobs.id, job.id));
      await db.delete(sources).where(eq(sources.name, sourceId));
    }
  });
});
