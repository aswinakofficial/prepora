import { expect, test } from "@playwright/test";

// The live site serves its main pages (docs/specs/16-engineering-team.md). Read-only by design: it
// never signs in, submits an answer or writes anything. SMOKE_EXPECT_COMMIT, when set (by the
// Release workflow), must match the commit /api/health reports.

test("health is ok, on the expected commit", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe("connected");
  if (process.env.SMOKE_EXPECT_COMMIT) expect(body.commit).toBe(process.env.SMOKE_EXPECT_COMMIT);
});

test("the home page renders", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBe(true);
  await expect(page.getByRole("link", { name: /exams/i }).first()).toBeVisible();
});

test("the exams directory lists exams, and an exam page opens", async ({ page }) => {
  await page.goto("/exams");
  const examLink = page.locator('a[href^="/exams/"]').first();
  await expect(examLink).toBeVisible({ timeout: 30_000 });
  await examLink.click();
  await expect(page).toHaveURL(/\/exams\/[^/]+/);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
});

test("a question page from the sitemap renders its question", async ({ page, request }) => {
  // The sitemap is an index; question pages are in sitemap-questions.xml.
  const sitemap = await (await request.get("/sitemap-questions.xml")).text();
  const url = sitemap.match(/<loc>(https?:\/\/[^<]+\/questions\/[^<]+)<\/loc>/)?.[1];
  test.skip(!url, "No question pages in the sitemap yet.");
  await page.goto(new URL(url as string).pathname);
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByText(/question not found/i)).toHaveCount(0);
});

test("search renders", async ({ page }) => {
  const res = await page.goto("/search");
  expect(res?.ok()).toBe(true);
  await expect(page.locator("main").first()).toBeVisible();
});
