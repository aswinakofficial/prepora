import { expect, test } from "@playwright/test";
import { checkAccessibility } from "./helpers/a11y";

// Core regression: the main public pages have no critical or serious accessibility violations
// (axe-core; low colour contrast is reported but not yet enforced, see helpers/a11y.ts).
// docs/specs/16-engineering-team.md, decision 7.

for (const path of ["/", "/exams", "/search", "/contribute", "/auth/signin"]) {
  test(`accessibility: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await checkAccessibility(page);
  });
}
