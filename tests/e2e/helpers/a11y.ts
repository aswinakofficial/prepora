import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Accessibility checks with axe-core (docs/specs/16-engineering-team.md, decision 7). Critical and
// serious violations fail the test, except low colour contrast: the dark palette fails it on every
// page today, and fixing that is a design change tracked in its own issue. Until then it's
// reported, not enforced. Every violation is attached to the test's report either way.
const KNOWN_BASELINE = new Set(["color-contrast"]);

export async function checkAccessibility(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).analyze();
  await test.info().attach(`axe: ${new URL(page.url()).pathname}`, {
    body: JSON.stringify(
      violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
      null,
      2,
    ),
    contentType: "application/json",
  });
  const blocking = violations.filter(
    (v) => (v.impact === "critical" || v.impact === "serious") && !KNOWN_BASELINE.has(v.id),
  );
  expect(
    blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) — ${v.help}`),
    `Accessibility violations on ${page.url()}`,
  ).toEqual([]);
}
