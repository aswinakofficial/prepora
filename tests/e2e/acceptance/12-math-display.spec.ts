import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  attempts,
  examSessions,
  exams,
  examTypes,
  examVariants,
  organizations,
  questionAnswers,
  questionOccurrences,
  questionOptions,
  questionSets,
  questions,
  scrapedQuestions,
  subjects,
} from "@prepora/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { checkAccessibility } from "../helpers/a11y";
import { signInAsAdmin } from "../helpers/admin";
import { acceptanceStep } from "../helpers/evidence";

// Spec 12's UI acceptance (docs/specs/12-math-display.md → Deliverable and UI acceptance, steps
// 1–10): Markdown + LaTeX questions read like the printed paper on every surface; plain (MS Learn)
// questions are unchanged; HTML in a Markdown question is shown as text. Invented questions,
// seeded with text_format = markdown.
//
// Step 10 (re-import a GATE paper with gate-import and open its C-program question) needs the real
// importer and a real PDF, so it's covered by the pipeline test and a manual re-import noted in the
// PR. Its student-visible half (a fenced C program renders as a code block) is checked here in
// step 3, with the same fence layout the GATE connector emits.

const MATH_TEXT = [
  "Let $L_1 \\cup L_2$ be two invented languages.",
  "",
  "$$\\frac{n(n-1)}{2}$$",
  "",
  "What does this invented program print?",
  "",
  "```c",
  "int main() {",
  "    int zed = 3;",
  "    return zed;",
  "}",
  "```",
].join("\n");
const MATH_EXPLANATION = "The cost grows as $\\sqrt{k} + x_i^2$ for the invented routine.";
const PLAIN_TEXT = "Invented plain *star* and a_b_c cost $4 or $5 in total";
const XSS_TEXT = "Invented markdown with <img src=x onerror=alert(1)> inside";

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

function main(page: Page): Locator {
  return page.locator("main").first();
}

/** No LaTeX or Markdown source is on show. */
async function expectNoRawSource(scope: Locator) {
  const text = await readableText(scope);
  expect(text).not.toContain("$");
  expect(text).not.toContain("\\");
  expect(text).not.toContain("```");
}

test.describe("Spec 12 · math display", () => {
  test.setTimeout(180_000);

  test("Markdown and LaTeX render on every question surface; plain text is unchanged", async ({
    page,
  }) => {
    const db = getDb();
    const u = randomUUID().slice(0, 8);
    const [org] = await db
      .insert(organizations)
      .values({ name: `E2E Math Board ${u}`, slug: `e2e-math-board-${u}` })
      .returning();
    const [type] = await db
      .insert(examTypes)
      .values({ slug: `e2e-math-type-${u}`, label: `E2E Math ${u}` })
      .returning();
    const [exam] = await db
      .insert(exams)
      .values({
        name: `E2E Math Exam ${u}`,
        slug: `e2e-math-${u}`,
        organizationId: org.id,
        examTypeId: type.id,
        status: "published",
      })
      .returning();
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning();
    const [session] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2099", year: 2099 })
      .returning();
    const [subject] = await db
      .insert(subjects)
      .values({ name: `E2E Math Subject ${u}`, slug: `e2e-math-subject-${u}` })
      .returning();
    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: variant.id,
        examSessionId: session.id,
        subjectId: subject.id,
        title: `E2E Math Set ${u}`,
        slug: `e2e-math-set-${u}`,
        publicationStatus: "published",
        paperKind: "official_practice",
        keyStatus: "final",
      })
      .returning();

    const questionIds: string[] = [];
    async function seed(
      number: number,
      slug: string,
      text: string,
      options: [string, string],
      explanation: string | null,
      format: "plain" | "markdown",
    ) {
      const [q] = await db
        .insert(questions)
        .values({ slug, questionText: text, explanation, status: "published" })
        .returning();
      questionIds.push(q.id);
      // Written through SQL so this file doesn't depend on the schema's column typing.
      await db.execute(sql`update questions set text_format = ${format} where id = ${q.id}`);
      const [a] = await db
        .insert(questionOptions)
        .values({ questionId: q.id, optionKey: "A", optionText: options[0], sequence: 1 })
        .returning();
      await db
        .insert(questionOptions)
        .values({ questionId: q.id, optionKey: "B", optionText: options[1], sequence: 2 });
      await db
        .insert(questionAnswers)
        .values({ questionId: q.id, correctOptionId: a.id, provenance: "official_sample_key" });
      await db
        .insert(questionOccurrences)
        .values({ questionId: q.id, questionSetId: set.id, originalQuestionNumber: number });
      return q;
    }

    const mathSlug = `e2e-math-q-${u}`;
    const plainSlug = `e2e-math-plain-${u}`;
    const xssSlug = `e2e-math-xss-${u}`;
    await seed(1, mathSlug, MATH_TEXT, ["$\\Theta(n^2)$", "$O(n)$"], MATH_EXPLANATION, "markdown");
    await seed(
      2,
      plainSlug,
      PLAIN_TEXT,
      ["Plain *A* one", "Plain B_two $3"],
      "Plain $x_1 *note*",
      "plain",
    );
    await seed(3, xssSlug, XSS_TEXT, ["Option alpha", "Option beta"], null, "markdown");

    // A review batch of Markdown questions, shaped the way gate-import writes it.
    const candidate = {
      exam_slug: `e2e-math-${u}`,
      exam_variant_slug: "x",
      subject_slug: `e2e-math-subject-${u}`,
      year: 2099,
      shift: "A-1",
      identity: "position",
      number: 1,
      number_label: "Q.1",
      section: "X",
      marks: 1,
      negative_marks: 1 / 3,
      answer_status: "scored",
      answer_provenance: "official_final",
      paper_kind: "past_paper",
      key_status: "final",
      source_type: "official",
      question_set_title: `E2E Math Review ${u}`,
      question_text:
        "Invented review: the set $A \\cap B$ is empty.\n\n```c\nint review(void) {\n    return 7;\n}\n```",
      text_format: "markdown",
      question_type: "mcq",
      options: [
        { key: "A", text: "$\\Theta(n^2)$" },
        { key: "B", text: "Quill" },
      ],
      answer: { type: "mcq", correct_key: "A" },
      explanation: null,
      parser_version: "e2e-1",
    };
    const [batch] = await db
      .insert(scrapedQuestions)
      .values({
        sourceUrl: `https://e2e.invalid/${u}/math.pdf`,
        parsedData: {
          metadata: {
            exam: `E2E Math Exam ${u}`,
            examTitle: `E2E Math Review ${u}`,
            format: "normalized-v1",
          },
          extractedElements: [
            {
              questionText: candidate.question_text,
              options: candidate.options.map((o) => o.text),
              answer: "A",
              explanation: null,
              images: [],
              normalized: candidate,
            },
          ],
        },
      })
      .returning();

    try {
      const dialogs: string[] = [];
      page.on("dialog", (d) => {
        dialogs.push(d.message());
        void d.dismiss();
      });

      await page.goto(`/questions/${mathSlug}`);
      const body = main(page);
      await expect(async () => {
        await expect(body.locator(".katex").first()).toBeVisible();
      }).toPass({ timeout: 30_000 });

      await acceptanceStep(
        page,
        "1. Open the question page of a Markdown question with $L_1 \\cup L_2$",
        async () => {
          // A real subscript, and the union symbol, not the dollar-sign source.
          await expect(body.locator(".katex-html .msupsub").first()).toBeVisible();
          const text = await readableText(body);
          expect(text).toContain("∪");
          expect(text).not.toContain("$L_1");
          expect(text).not.toContain("\\cup");
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "2. The display formula $$\\frac{n(n-1)}{2}$$ shows as a centred fraction on its own line",
        async () => {
          const display = body.locator(".katex-display").first();
          await expect(display).toBeVisible();
          await expect(display.locator(".mfrac").first()).toBeVisible();
          expect(await display.evaluate((el) => getComputedStyle(el).textAlign)).toBe("center");
          expect(await display.evaluate((el) => getComputedStyle(el).display)).toBe("block");
          const text = await readableText(display);
          expect(text).not.toContain("$$");
          expect(text).not.toContain("\\frac");
        },
      );

      await acceptanceStep(
        page,
        "3. The fenced C code block shows as a monospace block with its indentation",
        async () => {
          const code = body.locator("pre code").first();
          await expect(code).toBeVisible();
          const text = await code.evaluate((el) => (el as HTMLElement).innerText);
          expect(text).toContain("int main() {");
          expect(text).toContain("    int zed = 3;");
          expect(
            await code.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase()),
          ).toMatch(/mono|courier|consolas|menlo/);
          expect(await body.innerText()).not.toContain("```");
        },
      );

      await acceptanceStep(
        page,
        "4. Its options contain math ($\\Theta(n^2)$) and render Θ(n²)",
        async () => {
          const optionA = body.getByRole("button", { name: /^A/ }).first();
          await expect(optionA.locator(".katex")).toBeVisible();
          expect(await readableText(optionA)).toContain("Θ");
          await expect(optionA.locator(".msupsub").first()).toBeVisible();
          await expectNoRawSource(optionA);
        },
      );

      await acceptanceStep(
        page,
        "5. Choose an answer and reveal it; the explanation renders its math too",
        async () => {
          const before = await body.locator(".katex").count();
          await body.getByRole("button", { name: /^A/ }).first().click();
          await body.getByRole("button", { name: /reveal answer/i }).click();
          await expect
            .poll(async () => body.locator(".katex").count(), { timeout: 20_000 })
            .toBeGreaterThan(before);
          const text = await readableText(body);
          expect(text).toContain("for the invented routine");
          expect(text).not.toContain("\\sqrt");
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "6. Open the exam in Practice, in both Learn and Simulation modes",
        async () => {
          await page.goto(`/practice?examSlug=${exam.slug}`);
          const practice = main(page);
          // Simulation: question, options, then (after a check) the explanation.
          await expect(async () => {
            await expect(practice.locator(".katex-display").first()).toBeVisible();
          }).toPass({ timeout: 30_000 });
          await expect(practice.locator("pre code").first()).toBeVisible();
          await expect(practice.locator("button[aria-pressed] .katex").first()).toBeVisible();
          await expectNoRawSource(practice.locator("button[aria-pressed]").first());
          const beforeSim = await practice.locator(".katex").count();
          await practice.locator("button[aria-pressed]").first().click();
          await practice.getByRole("button", { name: "EXECUTE QUERY" }).click();
          await expect
            .poll(async () => practice.locator(".katex").count(), { timeout: 20_000 })
            .toBeGreaterThan(beforeSim);
          expect(await readableText(practice)).not.toContain("\\sqrt");
          await checkAccessibility(page);

          // Learn mode: the same question, options and explanation.
          await page.getByRole("button", { name: /learn mode/i }).click();
          await expect(async () => {
            await expect(practice.locator(".katex-display").first()).toBeVisible();
          }).toPass({ timeout: 20_000 });
          await expect(practice.locator("pre code").first()).toBeVisible();
          await expect(practice.locator("button[aria-pressed] .katex").first()).toBeVisible();
          const beforeLearn = await practice.locator(".katex").count();
          await practice
            .getByRole("button", { name: /see resolution/i })
            .first()
            .click();
          await expect
            .poll(async () => practice.locator(".katex").count(), { timeout: 20_000 })
            .toBeGreaterThan(beforeLearn);
          expect(await readableText(practice.locator("pre").first())).not.toContain("```");
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "7. An MS Learn (plain) question with *, _ and $ looks exactly as before",
        async () => {
          await page.goto(`/questions/${plainSlug}`);
          const plain = main(page);
          await expect(
            plain.getByText("Invented plain *star* and a_b_c cost $4 or $5 in total"),
          ).toBeVisible({ timeout: 30_000 });
          await expect(plain.getByText("Plain *A* one")).toBeVisible();
          await expect(plain.getByText("Plain B_two $3")).toBeVisible();
          await expect(plain.locator(".katex")).toHaveCount(0);
          await expect(plain.locator("em, strong, pre")).toHaveCount(0);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "8. HTML in a Markdown question is shown as text; no image or script is created",
        async () => {
          await page.goto(`/questions/${xssSlug}`);
          const hostile = main(page);
          await expect(hostile.getByText("Invented markdown with")).toBeVisible({
            timeout: 30_000,
          });
          expect(await readableText(hostile)).toContain("<img src=x onerror=alert(1)>");
          await expect(page.locator("img[onerror], img[src='x']")).toHaveCount(0);
          await page.waitForTimeout(500);
          expect(dialogs).toEqual([]);
          await checkAccessibility(page);
        },
      );

      await acceptanceStep(
        page,
        "9. Admin → Review on a batch with Markdown questions renders math and code",
        async () => {
          await signInAsAdmin(page);
          await page.goto("/admin/review");
          const card = page.getByTestId(`review-batch-${batch.id}`);
          await expect(card).toBeVisible({ timeout: 30_000 });
          await expect(card.locator(".katex").first()).toBeVisible();
          await expect(card.locator("pre code").first()).toBeVisible();
          const code = await card
            .locator("pre code")
            .first()
            .evaluate((el) => (el as HTMLElement).innerText);
          expect(code).toContain("    return 7;");
          const text = await readableText(card);
          expect(text).not.toContain("```");
          expect(text).not.toContain("$A");
          expect(text).not.toContain("\\cap");
          await checkAccessibility(page);
        },
      );

      // Step 10 (gate-import re-import) is covered by the pipeline tests and a manual re-import
      // noted in the PR; the fenced-C-program rendering it depends on is asserted in step 3.
    } finally {
      await db.delete(scrapedQuestions).where(eq(scrapedQuestions.id, batch.id));
      if (questionIds.length) {
        await db.delete(attempts).where(inArray(attempts.questionId, questionIds));
        await db
          .delete(questionOccurrences)
          .where(inArray(questionOccurrences.questionId, questionIds));
        await db.delete(questionAnswers).where(inArray(questionAnswers.questionId, questionIds));
        await db.delete(questionOptions).where(inArray(questionOptions.questionId, questionIds));
        await db.delete(questions).where(inArray(questions.id, questionIds));
      }
      await db.delete(questionSets).where(eq(questionSets.id, set.id));
      await db.delete(subjects).where(eq(subjects.id, subject.id));
      await db.delete(examSessions).where(eq(examSessions.id, session.id));
      await db.delete(examVariants).where(eq(examVariants.id, variant.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, type.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
