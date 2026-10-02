import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  examSessions,
  exams,
  examTypes,
  examVariants,
  organizations,
  questionOccurrences,
  questionSets,
  questions,
  searchQueries,
  subjects,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 23's E2E requirement: "search from the palette through
// to a question page." Seeds one real published question with a distinctive phrase directly in
// the database (mirroring tests/e2e/admin-pipeline.spec.ts's approach from item 21), then drives
// the real ⌘K palette end to end: open it, type, wait for real debounced results from the real
// search API, click through, and land on the expected question page.

test.describe("search palette to question page", () => {
  test("a distinctive phrase in the palette navigates to the matching question", async ({
    page,
  }) => {
    const db = getDb();
    const marker = randomUUID().slice(0, 8);
    const distinctivePhrase = `xenolith-metamorphic-boundary-${marker}`;

    const [org] = await db
      .insert(organizations)
      .values({ name: `E2E Org ${marker}`, slug: `e2e-org-${marker}` })
      .returning({ id: organizations.id });
    const [examType] = await db
      .insert(examTypes)
      .values({ slug: `e2e-type-${marker}`, label: `E2E Type ${marker}` })
      .returning({ id: examTypes.id });
    const [exam] = await db
      .insert(exams)
      .values({
        name: `E2E Exam ${marker}`,
        slug: `e2e-exam-${marker}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning({ id: exams.id, slug: exams.slug });
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning({ id: examVariants.id, slug: examVariants.slug });
    const [session] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2025", year: 2025 })
      .returning({ id: examSessions.id });
    const [subject] = await db
      .insert(subjects)
      .values({ name: `E2E Subject ${marker}`, slug: `e2e-subject-${marker}` })
      .returning({ id: subjects.id, slug: subjects.slug });
    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: variant.id,
        examSessionId: session.id,
        subjectId: subject.id,
        title: `E2E Set ${marker}`,
        slug: `e2e-set-${marker}`,
        publicationStatus: "published",
        paperKind: "official_practice",
        keyStatus: "final",
      })
      .returning({ id: questionSets.id });
    const [question] = await db
      .insert(questions)
      .values({
        slug: `e2e-question-${marker}`,
        questionText: `What defines the ${distinctivePhrase} in this rock sample?`,
        status: "published",
      })
      .returning({ id: questions.id, slug: questions.slug });
    await db.insert(questionOccurrences).values({ questionId: question.id, questionSetId: set.id });

    try {
      await page.goto("/");
      const scanButton = page.getByRole("button", { name: /scan/i });
      const queryInput = page.getByPlaceholder("Query indices...");

      // The dev server compiles this route's client bundle on first visit, which can take
      // longer than a single click-then-assert allows for — a click that lands before hydration
      // attaches the handler is silently lost. Retry the click until the modal actually opens
      // rather than waiting on a single, possibly-premature click.
      await expect(async () => {
        await scanButton.click();
        await expect(queryInput).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20_000 });

      await queryInput.fill(distinctivePhrase);

      const expectedUrl = `/questions/${question.slug}`;
      await page.getByText(distinctivePhrase, { exact: false }).click();
      await page.waitForURL(`**${expectedUrl}`);
      expect(page.url()).toContain(expectedUrl);
    } finally {
      await db.delete(searchQueries).where(eq(searchQueries.query, distinctivePhrase));
      await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, question.id));
      await db.delete(questions).where(eq(questions.id, question.id));
      await db.delete(questionSets).where(eq(questionSets.id, set.id));
      await db.delete(subjects).where(eq(subjects.id, subject.id));
      await db.delete(examVariants).where(eq(examVariants.examId, exam.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
