import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  examSessions,
  exams,
  examTypes,
  examVariants,
  intakeItems,
  organizations,
  questionSets,
  questions,
  scrapedQuestions,
  sources,
  subjects,
} from "@prepora/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { signInAsAdmin } from "./helpers/admin";

// Spec 7's UI acceptance (docs/specs/07-intake.md → Deliverable and UI acceptance, steps 1–4):
// imported questions, ready and held, are visible in Admin → Held questions with their reasons, and
// approving or rejecting a paper's batch moves its questions to Published or Rejected. Two invented
// papers, seeded the way gate-import writes them (intake items plus a normalized-v1 batch).

// Distinct wording per question, so dedupe never treats two fixtures as possible duplicates.
const STEMS = [
  "Which invented river feeds the northern lake",
  "How many zeppelins dock at the invented harbour",
  "What colour is the invented comet's tail",
  "Who composed the invented anthem of Zed",
  "Which invented metal never rusts",
  "When does the invented festival of lanterns begin",
];

function candidate(u: string, paper: string, number: number) {
  return {
    exam_slug: `e2e-intake-${u}`,
    exam_variant_slug: "x",
    subject_slug: `e2e-intake-subject-${u}`,
    year: 2099,
    shift: paper,
    identity: "position",
    number,
    number_label: `Q.${number}`,
    section: "X",
    marks: 1,
    negative_marks: 1 / 3,
    answer_status: "scored",
    answer_provenance: "official_final",
    paper_kind: "past_paper",
    key_status: "final",
    source_type: "official",
    question_set_title: `E2E Intake ${paper} ${u}`,
    question_text: `${STEMS[paper === "A-1" ? number - 1 : number + 2]} (${paper} ${u})`,
    question_type: "mcq",
    options: [
      { key: "A", text: `Zed ${number}` },
      { key: "B", text: `Quill ${number}` },
    ],
    answer: { type: "mcq", correct_key: "A" },
    explanation: null,
    parser_version: "e2e-1",
  };
}

test.describe("Spec 7 · intake: held questions in the admin", () => {
  // A full admin flow — sign in, several page loads, publishing through the pipeline service — on
  // a dev server that compiles each page on first visit: more than the default 30s.
  test.setTimeout(120_000);

  test("ready and held questions show by paper, and approving or rejecting a batch moves them", async ({
    page,
  }) => {
    const db = getDb();
    const u = randomUUID().slice(0, 8);
    const [org] = await db
      .insert(organizations)
      .values({ name: `E2E Intake Board ${u}`, slug: `e2e-intake-board-${u}` })
      .returning();
    const [type] = await db
      .insert(examTypes)
      .values({ slug: `e2e-intake-type-${u}`, label: `E2E Intake ${u}` })
      .returning();
    const [exam] = await db
      .insert(exams)
      .values({
        name: `E2E Intake Exam ${u}`,
        slug: `e2e-intake-${u}`,
        organizationId: org.id,
        examTypeId: type.id,
        status: "published",
      })
      .returning();
    const [source] = await db
      .insert(sources)
      .values({ name: `e2e-intake-${u}`, baseUrl: "https://e2e.invalid", connectorName: "e2e" })
      .returning();

    // Two papers: questions 1–2 ready (in a review batch), question 3 held for a figure.
    const papers = { approve: `e2e/${u}/x/A-1`, reject: `e2e/${u}/x/R-1` };
    const batches: Record<string, string> = {};
    for (const [role, paperKey] of Object.entries(papers)) {
      const sitting = paperKey.split("/").pop() as string;
      const [batch] = await db
        .insert(scrapedQuestions)
        .values({
          sourceUrl: `https://e2e.invalid/${u}/${sitting}.pdf`,
          parsedData: {
            metadata: {
              exam: `E2E Intake Exam ${u}`,
              examTitle: `E2E Intake ${sitting} ${u}`,
              format: "normalized-v1",
            },
            extractedElements: [1, 2].map((n) => {
              const c = candidate(u, sitting, n);
              return {
                questionText: c.question_text,
                options: c.options.map((o) => o.text),
                answer: "A",
                explanation: null,
                images: [],
                normalized: c,
              };
            }),
          },
        })
        .returning();
      batches[role] = batch.id;
      await db.insert(intakeItems).values([
        ...[1, 2].map((n) => ({
          sourceId: source.id,
          paperKey,
          edition: "e2e",
          number: n,
          numberLabel: `Q.${n}`,
          candidate: candidate(u, sitting, n),
          contentHash: `${u}-${sitting}-${n}`,
          issues: [],
          parserVersion: "e2e-1",
          status: "in_review" as const,
          reviewBatchId: batch.id,
        })),
        {
          sourceId: source.id,
          paperKey,
          edition: "e2e",
          number: 3,
          numberLabel: "Q.3",
          candidate: candidate(u, sitting, 3),
          contentHash: `${u}-${sitting}-3`,
          issues: [{ code: "figure", detail: "something is drawn in the question" }],
          parserVersion: "e2e-1",
          status: "held" as const,
        },
      ]);
    }

    const paperRow = (paperKey: string) => page.getByRole("row").filter({ hasText: paperKey });
    // Columns after Paper and Source: Ready, In review, Published, Held, Rejected.
    const counts = async (paperKey: string) =>
      (await paperRow(paperKey).getByRole("cell").allInnerTexts()).slice(2, 7).map(Number);

    try {
      await signInAsAdmin(page);

      // 1. Every paper is listed with its counts, and why its held questions are held.
      await page.goto("/admin/intake");
      await expect(paperRow(papers.approve)).toBeVisible({ timeout: 20_000 });
      expect(await counts(papers.approve)).toEqual([0, 2, 0, 1, 0]);
      await expect(paperRow(papers.approve).getByText("1 · Figure or image")).toBeVisible();

      // 2. A paper's held questions show their number, text and reason.
      await paperRow(papers.approve)
        .getByRole("button", { name: /show held questions/i })
        .click();
      await expect(
        page.getByText(`What colour is the invented comet's tail (A-1 ${u})`),
      ).toBeVisible();
      await expect(
        page.getByText("Figure or image: something is drawn in the question"),
      ).toBeVisible();

      // 3. Approving a paper's batch moves its questions to Published; the held one stays held.
      await page.goto("/admin/review");
      await page
        .getByTestId(`review-batch-${batches.approve}`)
        .getByRole("button", { name: /Approve & Publish/i })
        .click();
      await expect(page.getByText(/2 new questions added/i)).toBeVisible({ timeout: 30_000 });
      await page.goto("/admin/intake");
      await expect(paperRow(papers.approve)).toBeVisible({ timeout: 20_000 });
      expect(await counts(papers.approve)).toEqual([0, 0, 2, 1, 0]);

      // 4. Rejecting a batch moves its questions to Rejected; the held one stays held.
      await page.goto("/admin/review");
      await page
        .getByTestId(`review-batch-${batches.reject}`)
        .getByRole("button", { name: /discard/i })
        .click();
      await expect(page.getByTestId(`review-batch-${batches.reject}`)).toBeHidden({
        timeout: 20_000,
      });
      await page.goto("/admin/intake");
      await expect(paperRow(papers.reject)).toBeVisible({ timeout: 20_000 });
      expect(await counts(papers.reject)).toEqual([0, 0, 0, 1, 2]);
    } finally {
      await db.delete(intakeItems).where(eq(intakeItems.sourceId, source.id));
      await db
        .delete(questions)
        .where(like(questions.stableContentId, `E2E-INTAKE-${u.toUpperCase()}-%`));
      const variantIds = (
        await db
          .select({ id: examVariants.id })
          .from(examVariants)
          .where(eq(examVariants.examId, exam.id))
      ).map((v) => v.id);
      if (variantIds.length) {
        await db.delete(questionSets).where(inArray(questionSets.examVariantId, variantIds));
        await db.delete(examSessions).where(inArray(examSessions.examVariantId, variantIds));
        await db.delete(examVariants).where(inArray(examVariants.id, variantIds));
      }
      await db.delete(subjects).where(eq(subjects.slug, `e2e-intake-subject-${u}`));
      await db.delete(scrapedQuestions).where(inArray(scrapedQuestions.id, Object.values(batches)));
      await db.delete(sources).where(eq(sources.id, source.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, type.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
