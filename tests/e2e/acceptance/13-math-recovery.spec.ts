import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  examSessions,
  intakeItems,
  questionOccurrences,
  questionSets,
  questions,
} from "@prepora/db/schema";
import { and, eq, like } from "drizzle-orm";
import { checkAccessibility } from "../helpers/a11y";
import { signInAsAdmin } from "../helpers/admin";
import { acceptanceStep } from "../helpers/evidence";

// Spec 13's UI acceptance (docs/specs/13-math-recovery.md → Deliverable and UI acceptance, steps
// 1–10). Steps 11 and 12 (the real pilot papers) are done by hand. The fixture module generates an
// invented 7-question GATE-style paper with reportlab and runs the real import_paper on it:
//
//   python -m prepora_pipeline.connectors.gate.e2e_math_paper            (import; prints JSON)
//   python -m prepora_pipeline.connectors.gate.e2e_math_paper --cleanup  (removes the 2099 paper)
//
// Q.1 subscript row · Q.2 inline superscripts in options · Q.3 NAT multi-token subscript · Q.4
// subscript + stacked fraction (held) · Q.5 plain `*` and `_` · Q.6 Symbol-font α ∪ β · Q.7 Symbol
// font with an unmapped glyph (kept as is).

const FIXTURE = "prepora_pipeline.connectors.gate.e2e_math_paper";

type FixtureOutput = {
  paperKey: string;
  sitting: string;
  batchId: string | null;
  lines: string[];
  raw: Record<string, unknown>;
};

function python(): string {
  return existsSync("apps/pipeline/venv/bin/python") ? "venv/bin/python" : "python";
}

/** Runs the fixture the way global-setup runs sync-sources: the pipeline's Python, the e2e DB. */
function runFixture(args: string[] = []): string {
  return execFileSync(python(), ["-m", FIXTURE, ...args], {
    cwd: "apps/pipeline",
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** The fixture prints its JSON as the last JSON object on stdout. */
function parseOutput(stdout: string): FixtureOutput {
  const start = stdout.indexOf("{");
  const text = stdout.slice(start);
  const lastLine = stdout
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = JSON.parse(lastLine ?? "{}");
  }
  const str = (...keys: string[]) => {
    for (const k of keys) if (typeof raw[k] === "string") return raw[k] as string;
    return "";
  };
  const paperKey = str("paper_key", "paperKey");
  const sitting = str("sitting", "paper") || paperKey.split("/").pop() || "";
  const lines = (raw.report_lines ?? raw.reportLines ?? raw.lines ?? raw.report ?? []) as unknown;
  return {
    paperKey,
    sitting,
    batchId: str("batch_id", "batchId") || null,
    lines: Array.isArray(lines) ? lines.map(String) : String(lines).split("\n"),
    raw,
  };
}

/** The text a student reads: KaTeX's hidden MathML copy of the source, scripts and styles removed. */
async function readableText(scope: Locator): Promise<string> {
  return scope.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    for (const hidden of clone.querySelectorAll(".katex-mathml, script, style, noscript")) {
      hidden.remove();
    }
    return clone.textContent ?? "";
  });
}

/** The TeX source of every formula in scope, from KaTeX's annotation elements. */
async function texSources(scope: Locator): Promise<string[]> {
  return scope.evaluate((el) =>
    Array.from(el.querySelectorAll('.katex annotation[encoding="application/x-tex"]')).map(
      (a) => a.textContent ?? "",
    ),
  );
}

async function expectNoRawSource(scope: Locator) {
  const text = await readableText(scope);
  expect(text).not.toContain("$");
  expect(text).not.toContain("\\");
  expect(text).not.toContain("_");
}

async function expectNoKatexError(scope: Locator) {
  await expect(scope.locator(".katex-error")).toHaveCount(0);
}

function main(page: Page): Locator {
  return page.locator("main").first();
}

test.describe("Spec 13 · math recovery from the PDF", () => {
  // Two imports (reportlab PDFs, parsing, intake) plus an admin flow on a dev-compiled app.
  test.setTimeout(480_000);

  test("an invented GATE paper is rebuilt, reviewed, published and re-imported without change", async ({
    page,
  }) => {
    const db = getDb();
    let paper: FixtureOutput | undefined;

    try {
      // Clear anything an earlier crashed run left behind, then import the invented paper.
      try {
        runFixture(["--cleanup"]);
      } catch {
        // nothing to clean
      }
      paper = parseOutput(runFixture());
      expect(paper.paperKey, "the fixture prints the paper key").toBeTruthy();
      const { paperKey, sitting } = paper;

      const paperRow = () => page.getByRole("row").filter({ hasText: paperKey });
      // Columns after Paper and Source: Ready, In review, Published, Held, Rejected.
      const counts = async () =>
        (await paperRow().getByRole("cell").allInnerTexts()).slice(2, 7).map(Number);

      const reviewBatchIds = async () => {
        const rows = await db
          .select({ id: intakeItems.reviewBatchId })
          .from(intakeItems)
          .where(eq(intakeItems.paperKey, paperKey));
        return [...new Set(rows.map((r) => r.id).filter((id): id is string => !!id))];
      };

      /** Question page paths by original question number, from the database. */
      const questionSlugs = async () => {
        const sets = await db
          .select({ id: questionSets.id, slug: questionSets.slug })
          .from(questionSets)
          .innerJoin(examSessions, eq(examSessions.id, questionSets.examSessionId))
          .where(and(eq(examSessions.year, 2099), like(questionSets.title, `%${sitting}%`)));
        const bySet = sets[0];
        if (!bySet) return { setSlug: "", slugs: new Map<number, string>() };
        const rows = await db
          .select({ n: questionOccurrences.originalQuestionNumber, slug: questions.slug })
          .from(questionOccurrences)
          .innerJoin(questions, eq(questions.id, questionOccurrences.questionId))
          .where(eq(questionOccurrences.questionSetId, bySet.id));
        return { setSlug: bySet.slug, slugs: new Map(rows.map((r) => [Number(r.n), r.slug])) };
      };

      await signInAsAdmin(page);

      await acceptanceStep(
        page,
        "1. Import the invented paper, then open Admin → Held questions",
        async () => {
          await page.goto("/admin/intake");
          await expect(paperRow()).toBeVisible({ timeout: 30_000 });
          expect(await counts()).toEqual([0, 6, 0, 1, 0]);
          await expect(paperRow().getByText("1 · Math that didn't extract cleanly")).toBeVisible();
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        '2. Click "Show held questions" on that paper: only Q.4, with its reason',
        async () => {
          await paperRow()
            .getByRole("button", { name: /show held questions/i })
            .click();
          await expect(
            page.getByText(
              "Math that didn't extract cleanly: the rebuild found a fraction, which it doesn't rebuild",
            ),
          ).toBeVisible();
          await expect(page.getByText(/^Q\.4\b/)).toBeVisible();
          for (const other of [1, 2, 3, 5, 6, 7]) {
            await expect(page.getByText(new RegExp(`^Q\\.${other}\\b`))).toHaveCount(0);
          }
          // The held question's preview shows no LaTeX source.
          const held = page
            .getByText(/^Q\.4\b/)
            .locator("xpath=ancestor::*[self::li or self::tr][1]");
          const preview = (await held.count()) ? held.first() : paperRow();
          const text = await preview.innerText();
          expect(text).not.toContain("$");
          expect(text).not.toContain("\\");
          await checkAccessibility(page);
        },
      );

      let batchId = paper.batchId ?? "";
      await acceptanceStep(
        page,
        "3. Open Admin → Review and find the paper's batch: six questions, no badge, no KaTeX error",
        async () => {
          if (!batchId) {
            const ids = await reviewBatchIds();
            expect(ids, "one review batch for the paper").toHaveLength(1);
            batchId = ids[0];
          }
          await page.goto("/admin/review");
          const card = page.getByTestId(`review-batch-${batchId}`);
          await expect(card).toBeVisible({ timeout: 30_000 });
          await expect(card.getByText(/6 Questions Extracted/)).toBeVisible();
          await expect(card.locator(".katex").first()).toBeVisible();
          // Q.1's preview: Z with real subscripts, no source characters.
          const sources = await texSources(card);
          expect(sources).toContain("Z_{1}");
          expect(sources).toContain("Z_{2}");
          await expect(card.locator(".katex .msupsub").first()).toBeVisible();
          await expectNoKatexError(card);
          const text = await readableText(card);
          expect(text).not.toContain("$");
          expect(text).not.toMatch(/Z_\{?[12]/);
          // No badge: the batch card says nothing about rebuilt or re-typeset math.
          expect(text.toLowerCase()).not.toMatch(/re-?typeset|recovered|rebuilt|rebuild/);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "4. Approve the batch, then open Q.1's question page: Z₁ and Z₂ as rendered math",
        async () => {
          const card = page.getByTestId(`review-batch-${batchId}`);
          await card.getByRole("button", { name: /Approve & Publish/i }).click();
          await expect(page.getByText(/6 new questions added/i)).toBeVisible({ timeout: 60_000 });
          const { slugs } = await questionSlugs();
          const q1 = slugs.get(1);
          expect(q1, "Q.1 is published").toBeTruthy();
          await page.goto(`/questions/${q1}`);
          const body = main(page);
          await expect(async () => {
            await expect(body.locator(".katex").first()).toBeVisible();
          }).toPass({ timeout: 30_000 });
          expect(await texSources(body)).toEqual(expect.arrayContaining(["Z_{1}", "Z_{2}"]));
          await expect(body.locator(".katex .msupsub").first()).toBeVisible();
          const text = await readableText(body);
          expect(text).toContain("Let");
          expect(text).toContain("Z");
          expect(text).not.toContain("$");
          expect(text).not.toContain("\\");
          expect(text).not.toContain("_");
          await expectNoKatexError(body);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "5. Open Q.2's question page; choose option A and reveal the answer",
        async () => {
          const { slugs } = await questionSlugs();
          await page.goto(`/questions/${slugs.get(2)}`);
          const body = main(page);
          const optionA = body.getByRole("button", { name: /^A/ }).first();
          await expect(async () => {
            await expect(optionA.locator(".katex")).toBeVisible();
          }).toPass({ timeout: 30_000 });
          // Every option renders a superscript.
          const options = body.locator("button[aria-pressed]");
          const n = await options.count();
          expect(n).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < n; i++) {
            await expect(options.nth(i).locator(".msupsub").first()).toBeVisible();
            await expectNoRawSource(options.nth(i));
          }
          // Option A is one formula: 2^{17}, no stray "(A)" or space inside it.
          expect(await texSources(optionA)).toEqual(["2^{17}"]);
          await expect(optionA.locator(".katex")).toHaveCount(1);
          expect(await readableText(optionA)).not.toContain("(A)");
          const tex = await optionA.locator('annotation[encoding="application/x-tex"]').count();
          expect(tex).toBe(1);
          // Choosing and revealing works as for any question.
          await optionA.click();
          await body.getByRole("button", { name: /reveal answer/i }).click();
          await expect(body.getByText(/correct|answer/i).first()).toBeVisible();
          await expectNoKatexError(body);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(page, "6. Open Q.3's question page", async () => {
        const { slugs } = await questionSlugs();
        await page.goto(`/questions/${slugs.get(3)}`);
        const body = main(page);
        await expect(async () => {
          await expect(body.locator(".katex").first()).toBeVisible();
        }).toPass({ timeout: 30_000 });
        expect(await texSources(body)).toContain("d_{k+1}");
        await expect(body.locator(".katex .msupsub").first()).toBeVisible();
        await expectNoKatexError(body);
        await checkAccessibility(page);
      });

      await acceptanceStep(page, "7. Open Q.5's question page", async () => {
        const { slugs } = await questionSlugs();
        await page.goto(`/questions/${slugs.get(5)}`);
        const body = main(page);
        await expect(body.locator("h1, h2, p").first()).toBeVisible({ timeout: 30_000 });
        await expect(async () => {
          const text = await body.innerText();
          expect(text).toContain("*");
          expect(text).toContain("_");
        }).toPass({ timeout: 30_000 });
        await expect(body.locator(".katex")).toHaveCount(0);
        await expect(body.locator("em, strong")).toHaveCount(0);
        await checkAccessibility(page);
      });

      await acceptanceStep(
        page,
        "8. Open Q.6 and Q.7's question pages, and read the fixture's JSON output",
        async () => {
          const { slugs } = await questionSlugs();
          await page.goto(`/questions/${slugs.get(6)}`);
          let body = main(page);
          await expect(async () => {
            await expect(body.locator(".katex").first()).toBeVisible();
          }).toPass({ timeout: 30_000 });
          expect(await texSources(body)).toContain("\\alpha \\cup \\beta");
          await expectNoKatexError(body);
          await checkAccessibility(page);

          await page.goto(`/questions/${slugs.get(7)}`);
          body = main(page);
          await expect(body.locator("h1, h2, p").first()).toBeVisible({ timeout: 30_000 });
          await page.waitForLoadState("networkidle");
          await expect(body.locator(".katex")).toHaveCount(0);
          expect(await body.innerText()).not.toContain("$");
          await checkAccessibility(page);

          expect(paper?.lines.join("\n")).toContain("Q.7 kept as is: unknown_symbol");
        },
      );

      await acceptanceStep(
        page,
        "9. Open the paper's question set page: Q.4 isn't on the site",
        async () => {
          const { setSlug, slugs } = await questionSlugs();
          expect(setSlug).toBeTruthy();
          expect([...slugs.keys()].sort()).toEqual([1, 2, 3, 5, 6, 7]);
          await page.goto(`/question-sets/${setSlug}`);
          const body = main(page);
          await expect(body.getByText("6 QUESTIONS")).toBeVisible({ timeout: 30_000 });
          const links = body.locator('a[href^="/questions/"]');
          await expect(links).toHaveCount(6);
          for (const n of [1, 2, 3, 5, 6, 7]) {
            await expect(
              links.filter({ has: page.locator(`xpath=.//span[text()="0${n}"]`) }),
            ).toHaveCount(1);
          }
          await expect(
            links.filter({ has: page.locator('xpath=.//span[text()="04"]') }),
          ).toHaveCount(0);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "10. Import the same paper again: counts 0 / 0 / 6 / 1 / 0, and no new batch",
        async () => {
          const before = await reviewBatchIds();
          const again = parseOutput(runFixture(["--sitting", sitting]));
          expect(again.paperKey).toBe(paperKey);
          expect(await reviewBatchIds()).toEqual(before);

          await page.goto("/admin/intake");
          await expect(paperRow()).toBeVisible({ timeout: 30_000 });
          expect(await counts()).toEqual([0, 0, 6, 1, 0]);
          await checkAccessibility(page);

          await page.goto("/admin/review");
          await expect(
            page.getByText(/Verification queue is completely clear|BATCH #/).first(),
          ).toBeVisible({
            timeout: 30_000,
          });
          // The approved batch is gone and no new one exists for this paper.
          await expect(page.getByTestId(`review-batch-${batchId}`)).toHaveCount(0);
          expect(await reviewBatchIds()).toEqual(before);
          await checkAccessibility(page);
        },
      );
    } finally {
      try {
        runFixture(["--cleanup"]);
      } catch (error) {
        console.error("e2e_math_paper --cleanup failed", error);
      }
    }
  });
});
