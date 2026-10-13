import { expect, test } from "@playwright/test";
import { checkAccessibility } from "../helpers/a11y";
import { acceptanceStep } from "../helpers/evidence";

// Spec 16's browser-checkable part (docs/specs/16-engineering-team.md → Tests): an acceptance test
// produces evidence, a screenshot per acceptance step plus the video, that the PR's "Acceptance
// evidence" summary lists. CI checks the summary contains these steps. It walks the public path a
// student takes, so the evidence also shows the site's main pages.

test("an acceptance run records evidence for every step", async ({ page }) => {
  await acceptanceStep(page, "1. Open the home page", async () => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await checkAccessibility(page);
  });
  await acceptanceStep(page, "2. Open the exams directory", async () => {
    await page.goto("/exams");
    await expect(page.locator("main").first()).toBeVisible();
    await checkAccessibility(page);
  });
  await acceptanceStep(page, "3. Open search", async () => {
    await page.goto("/search");
    await expect(page.locator("main").first()).toBeVisible();
  });
});
