import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  attempts,
  examSessions,
  exams,
  examTypes,
  examVariants,
  organizations,
  questionSets,
  questions,
  scrapedQuestions,
  subjects,
} from "@prepora/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { signInAsAdmin } from "./helpers/admin";

// Core regression: the path every piece of content takes. An admin approves a review batch in the
// admin UI, the pipeline service publishes it, and the questions work for a student — a numeric
// answer is graded against its range, and the marks line shows. Uses a normalized-v1 batch, as a
// pipeline connector (GATE) writes it, with invented content.

function normalized(u: string, number: number, extra: Record<string, unknown>) {
  return {
    exam_slug: `e2e-exam-${u}`,
    exam_variant_slug: "x",
    subject_slug: `e2e-subject-${u}`,
    year: 2099,
    shift: "X-1",
    identity: "position",
    number,
    number_label: `Q.${number}`,
    section: "X",
    marks: number === 1 ? 1 : 2,
    negative_marks: number === 1 ? 1 / 3 : 0,
    answer_status: "scored",
    answer_provenance: "official_final",
    paper_kind: "past_paper",
    key_status: "final",
    source_type: "official",
    question_set_title: `E2E Paper ${u}`,
    explanation: null,
    parser_version: "e2e-1",
    ...extra,
  };
}

test.describe("review queue to published question", () => {
  test("approving a batch publishes its questions, which grade and show marks", async ({
    page,
  }) => {
    const db = getDb();
    const u = randomUUID().slice(0, 8);
    const [org] = await db
      .insert(organizations)
      .values({ name: `E2E Board ${u}`, slug: `e2e-board-${u}` })
      .returning();
    const [type] = await db
      .insert(examTypes)
      .values({ slug: `e2e-type-${u}`, label: `E2E Type ${u}` })
      .returning();
    const [exam] = await db
      .insert(exams)
      .values({
        name: `E2E Exam ${u}`,
        slug: `e2e-exam-${u}`,
        organizationId: org.id,
        examTypeId: type.id,
        status: "published",
      })
      .returning();
    const mcq = normalized(u, 1, {
      question_text: `Which invented colour is the e2e marker ${u}?`,
      question_type: "mcq",
      options: [
        { key: "A", text: "Teal" },
        { key: "B", text: "Ochre" },
      ],
      answer: { type: "mcq", correct_key: "B" },
    });
    const nat = normalized(u, 2, {
      question_text: `How many invented units fit in crate ${u}?`,
      question_type: "numerical",
      options: [],
      answer: { type: "numerical", answer: "4.24 to 4.26", ranges: [[4.24, 4.26]] },
    });
    const [batch] = await db
      .insert(scrapedQuestions)
      .values({
        sourceUrl: `https://e2e.invalid/${u}.pdf`,
        parsedData: {
          metadata: { exam: `E2E Exam ${u}`, examTitle: `E2E Exam ${u}`, format: "normalized-v1" },
          extractedElements: [mcq, nat].map((n) => ({
            questionText: n.question_text,
            options: (n.options as Array<{ text: string }>).map((o) => o.text),
            answer: n.number === 1 ? "B" : "4.24 to 4.26",
            explanation: null,
            images: [],
            normalized: n,
          })),
        },
      })
      .returning();

    try {
      await signInAsAdmin(page);
      await page.goto("/admin/review");
      const card = page.getByTestId(`review-batch-${batch.id}`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.getByRole("button", { name: /Approve & Publish/i }).click();
      await expect(page.getByText(/2 new questions added/i)).toBeVisible({ timeout: 30_000 });

      const published = await db
        .select({ slug: questions.slug, text: questions.questionText })
        .from(questions)
        .where(like(questions.stableContentId, `E2E-EXAM-${u.toUpperCase()}-%`));
      expect(published).toHaveLength(2);
      const slugOf = (fragment: string) =>
        published.find((q) => q.text.includes(fragment))?.slug as string;

      // The numeric question grades a typed answer against its range.
      await page.goto(`/questions/${slugOf("crate")}`);
      // Typing before the page hydrates is lost, so type until the check button is enabled.
      const check = page.getByRole("button", { name: /check answer/i });
      await expect(async () => {
        await page.getByLabel("Your answer").fill("4,25");
        await expect(check).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await check.click();
      await expect(page.getByText("Correct", { exact: true })).toBeVisible();
      await expect(page.getByText("Accepted: 4.24 to 4.26")).toBeVisible();

      // The multiple-choice question shows its marks and penalty.
      await page.goto(`/questions/${slugOf("colour")}`);
      await expect(page.getByText(/1 mark · −⅓ for a wrong answer/i)).toBeVisible();
    } finally {
      const ids = (
        await db
          .select({ id: questions.id })
          .from(questions)
          .where(like(questions.stableContentId, `E2E-EXAM-${u.toUpperCase()}-%`))
      ).map((q) => q.id);
      if (ids.length) await db.delete(attempts).where(inArray(attempts.questionId, ids));
      await db
        .delete(questions)
        .where(like(questions.stableContentId, `E2E-EXAM-${u.toUpperCase()}-%`));
      const variants = await db
        .select({ id: examVariants.id })
        .from(examVariants)
        .where(eq(examVariants.examId, exam.id));
      const variantIds = variants.map((v) => v.id);
      if (variantIds.length) {
        await db.delete(questionSets).where(inArray(questionSets.examVariantId, variantIds));
        await db.delete(examSessions).where(inArray(examSessions.examVariantId, variantIds));
        await db.delete(examVariants).where(inArray(examVariants.id, variantIds));
      }
      await db.delete(subjects).where(eq(subjects.slug, `e2e-subject-${u}`));
      await db.delete(scrapedQuestions).where(eq(scrapedQuestions.id, batch.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, type.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
