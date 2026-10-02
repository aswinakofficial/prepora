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
  practiceSessions,
  questionAnswers,
  questionOccurrences,
  questionOptions,
  questionSets,
  questions,
  subjects,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 25's E2E requirement: "complete a practice session,
// refresh, results persist." Drives the real practice.tsx UI end to end (answer, check, next
// question, submit), then asserts directly against the database that a real practiceSessions row
// and real attempts rows exist with server-computed scoring — not the client's local React state,
// which a hard refresh legitimately clears (practice.tsx has no "resume session" UI; the guarantee
// this item adds is that the server's record of what happened doesn't disappear when that state
// does).

test.describe("practice — attempts and sessions persist to the real database", () => {
  test("answering questions and finishing a session writes real attempts and a finalized practiceSession, which survive a page refresh", async ({
    page,
  }) => {
    const db = getDb();
    const marker = randomUUID().slice(0, 8);

    const [org] = await db
      .insert(organizations)
      .values({ name: `E2E Org ${marker}`, slug: `e2e-org-${marker}` })
      .returning();
    const [examType] = await db
      .insert(examTypes)
      .values({ slug: `e2e-type-${marker}`, label: `E2E Type ${marker}` })
      .returning();
    const [exam] = await db
      .insert(exams)
      .values({
        name: `E2E Practice Exam ${marker}`,
        slug: `e2e-practice-exam-${marker}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning();
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning();
    const [session] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2025", year: 2025 })
      .returning();
    const [subject] = await db
      .insert(subjects)
      .values({ name: `E2E Subject ${marker}`, slug: `e2e-subject-${marker}` })
      .returning();
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
      .returning();

    const [q1] = await db
      .insert(questions)
      .values({
        slug: `e2e-q1-${marker}`,
        questionText: `First e2e question ${marker}`,
        status: "published",
      })
      .returning();
    const [q1optA] = await db
      .insert(questionOptions)
      .values({
        questionId: q1.id,
        optionKey: "A",
        optionText: `Q1 correct ${marker}`,
        sequence: 1,
      })
      .returning();
    await db
      .insert(questionOptions)
      .values({ questionId: q1.id, optionKey: "B", optionText: `Q1 wrong ${marker}`, sequence: 2 });
    await db
      .insert(questionAnswers)
      .values({ questionId: q1.id, correctOptionId: q1optA.id, provenance: "official_sample_key" });
    await db
      .insert(questionOccurrences)
      .values({ questionId: q1.id, questionSetId: set.id, originalQuestionNumber: 1 });

    const [q2] = await db
      .insert(questions)
      .values({
        slug: `e2e-q2-${marker}`,
        questionText: `Second e2e question ${marker}`,
        status: "published",
      })
      .returning();
    const [q2optA] = await db
      .insert(questionOptions)
      .values({
        questionId: q2.id,
        optionKey: "A",
        optionText: `Q2 correct ${marker}`,
        sequence: 1,
      })
      .returning();
    await db
      .insert(questionOptions)
      .values({ questionId: q2.id, optionKey: "B", optionText: `Q2 wrong ${marker}`, sequence: 2 });
    await db
      .insert(questionAnswers)
      .values({ questionId: q2.id, correctOptionId: q2optA.id, provenance: "official_sample_key" });
    await db
      .insert(questionOccurrences)
      .values({ questionId: q2.id, questionSetId: set.id, originalQuestionNumber: 2 });

    let practiceSessionRowId = "";
    try {
      await page.goto(`/practice?examSlug=${exam.slug}`);

      // Question 1: select the correct option, check it (fires submitAnswer + creates the
      // practiceSession).
      await expect(page.getByText(`First e2e question ${marker}`)).toBeVisible({ timeout: 10_000 });
      await page.getByText(`Q1 correct ${marker}`).click();
      await page.getByRole("button", { name: "EXECUTE QUERY" }).click();
      await expect(page.getByText("CORRECT").first()).toBeVisible();

      // The practiceSession is created asynchronously on mount, not blocking the UI — poll until
      // it exists rather than assuming it landed before the first attempt was recorded.
      await expect(async () => {
        const rows = await db
          .select()
          .from(practiceSessions)
          .where(
            eq(
              practiceSessions.sessionId,
              await page.evaluate(() => localStorage.getItem("prepora_anon_session_id")),
            ),
          );
        expect(rows.length).toBeGreaterThan(0);
        practiceSessionRowId = rows[0].id;
      }).toPass({ timeout: 10_000 });

      await expect(async () => {
        const rows = await db.select().from(attempts).where(eq(attempts.questionId, q1.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].isCorrect).toBe(true);
        expect(rows[0].practiceSessionId).toBe(practiceSessionRowId);
      }).toPass({ timeout: 10_000 });

      // Question 2: select the wrong option, check it, then finish the session.
      await page.getByRole("button", { name: "Next Node →" }).click();
      await expect(page.getByText(`Second e2e question ${marker}`)).toBeVisible();
      await page.getByText(`Q2 wrong ${marker}`).click();
      await page.getByRole("button", { name: "EXECUTE QUERY" }).click();
      await expect(page.getByText("INVALID").first()).toBeVisible();
      await page.getByRole("button", { name: "SUBMIT SIMULATION →" }).click();

      await expect(page.getByText("SESSION COMPLETE")).toBeVisible();

      await expect(async () => {
        const [finalized] = await db
          .select()
          .from(practiceSessions)
          .where(eq(practiceSessions.id, practiceSessionRowId));
        expect(finalized.completedAt).not.toBeNull();
        expect(finalized.correct).toBe(1);
        expect(finalized.incorrect).toBe(1);
        expect(finalized.totalQuestions).toBe(2);
      }).toPass({ timeout: 10_000 });

      const attemptRows = await db
        .select()
        .from(attempts)
        .where(eq(attempts.practiceSessionId, practiceSessionRowId));
      expect(attemptRows).toHaveLength(2);

      // Refresh: the client's local answers reset (practice.tsx has no resume-session UI), but the
      // server's record of what already happened must not disappear.
      await page.reload();
      const [stillFinalized] = await db
        .select()
        .from(practiceSessions)
        .where(eq(practiceSessions.id, practiceSessionRowId));
      expect(stillFinalized.completedAt).not.toBeNull();
      expect(stillFinalized.correct).toBe(1);
      const attemptRowsAfterRefresh = await db
        .select()
        .from(attempts)
        .where(eq(attempts.practiceSessionId, practiceSessionRowId));
      expect(attemptRowsAfterRefresh).toHaveLength(2);
    } finally {
      await db.delete(attempts).where(eq(attempts.questionId, q1.id));
      await db.delete(attempts).where(eq(attempts.questionId, q2.id));
      if (practiceSessionRowId) {
        await db.delete(practiceSessions).where(eq(practiceSessions.id, practiceSessionRowId));
      }
      await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, q1.id));
      await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, q2.id));
      await db.delete(questionAnswers).where(eq(questionAnswers.questionId, q1.id));
      await db.delete(questionAnswers).where(eq(questionAnswers.questionId, q2.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, q1.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, q2.id));
      await db.delete(questions).where(eq(questions.id, q1.id));
      await db.delete(questions).where(eq(questions.id, q2.id));
      await db.delete(questionSets).where(eq(questionSets.id, set.id));
      await db.delete(subjects).where(eq(subjects.id, subject.id));
      await db.delete(examSessions).where(eq(examSessions.id, session.id));
      await db.delete(examVariants).where(eq(examVariants.id, variant.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
