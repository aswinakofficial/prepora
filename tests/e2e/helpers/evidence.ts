import { type Page, test } from "@playwright/test";

// Evidence for a spec's UI acceptance (docs/specs/16-engineering-team.md, decision 4). Each
// acceptance step runs as a named test step, and a screenshot of the page right after it is saved
// in the test's output folder and attached, so the PR's evidence summary
// (tests/e2e/reporters/evidence-reporter.ts) shows what the owner would have seen at that step. The
// test's video is recorded by the "acceptance" project.
//
//   await acceptanceStep(page, "1. Open Admin → Held questions", async () => { … });

export async function acceptanceStep(
  page: Page,
  name: string,
  body: () => Promise<void>,
): Promise<void> {
  await test.step(name, async () => {
    await body();
    const file = test
      .info()
      .outputPath(`step-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await test.info().attach(`evidence: ${name}`, { path: file, contentType: "image/png" });
  });
}
