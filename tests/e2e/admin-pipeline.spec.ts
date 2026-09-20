import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import { pipelineJobStages, pipelineJobs, sources, users } from "@prepora/db/schema";
import { eq } from "drizzle-orm";

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
// Admin auth note: @prepora/auth's isAdminUser() checks user.role === "admin" first, but Better
// Auth doesn't know about the users.role column (no additionalFields config exposes it on the
// session), so that check is currently unreachable in practice — the only mechanism that actually
// grants admin today is the ADMIN_USERS email allowlist. This test therefore requires
// ADMIN_USERS to include E2E_ADMIN_EMAIL below when the dev server starts (export it alongside
// your other env vars before running `pnpm test:e2e`) rather than relying on role='admin'.
const E2E_ADMIN_EMAIL = "e2e-admin@example.com";

test.describe("admin pipeline / job inspection and source health", () => {
  test("a completed job renders with correct per-stage counts, and a source with recent failures shows as degraded", async ({
    page,
    context,
  }) => {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);

    // A leftover user from a previous crashed run would make sign-up fail with "already exists" —
    // pre-clean defensively, matching the fixture convention used throughout this repo's own
    // test suites (create, use, always clean up; never assume a clean slate).
    await db.delete(users).where(eq(users.email, E2E_ADMIN_EMAIL));

    // Real signup through Better Auth's own email/password endpoint (enabled server-side; the UI
    // only exposes Google sign-in, but the endpoint is real) — this sets a real, correctly signed
    // session cookie in this browser context, rather than hand-rolling one. Admin access comes
    // from ADMIN_USERS (see the module comment above), not from a role column this test would
    // otherwise need to set.
    const signUpRes = await context.request.post("/api/auth/sign-up/email", {
      data: { name: "E2E Admin", email: E2E_ADMIN_EMAIL, password: "e2e-test-password-123!" },
    });
    expect(signUpRes.ok()).toBe(true);
    const { user } = await signUpRes.json();

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

      // Job inspection: per-stage counts and durations, drawn from pipeline_job_stages. The raw
      // getScraperLogs text panel formats the same underlying data too, so these are matched
      // loosely on purpose (.first()) — either panel proving the real counts reached the DOM is
      // what this test cares about, not which one.
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
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
