import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@prepora/db";
import {
  contributions,
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
  subjects,
  topics,
  users,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";

// docs/roadmap/engineering-roadmap.md item 24's E2E requirement: "empty-state and seeded-state
// coverage per page." Each test seeds real rows directly (mirroring tests/e2e/admin-pipeline.spec.ts
// and tests/e2e/search.spec.ts), drives the real page, and cleans up in a finally block.

test.describe("topics/$topicSlug — real data, honest empty state", () => {
  test("a topic slug with no rows shows an honest empty state, not a fixture", async ({ page }) => {
    await page.goto("/topics/does-not-exist-e2e");
    await expect(page.getByText(/no published questions for this topic yet/i)).toBeVisible();
  });

  test("a real published question under a real topic renders", async ({ page }) => {
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
        name: `E2E Exam ${marker}`,
        slug: `e2e-exam-${marker}`,
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
    const [topic] = await db
      .insert(topics)
      .values({ subjectId: subject.id, name: `E2E Topic ${marker}`, slug: `e2e-topic-${marker}` })
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
      })
      .returning();
    const questionText = `What is the e2e-marker-${marker} constant?`;
    const [question] = await db
      .insert(questions)
      .values({
        slug: `e2e-question-${marker}`,
        questionText,
        status: "published",
        topicId: topic.id,
      })
      .returning();
    await db.insert(questionOccurrences).values({ questionId: question.id, questionSetId: set.id });

    try {
      await page.goto(`/topics/${topic.slug}`);
      await expect(page.getByText(questionText)).toBeVisible();
      await expect(page.getByText(subject.name, { exact: false }).first()).toBeVisible();
    } finally {
      await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, question.id));
      await db.delete(questions).where(eq(questions.id, question.id));
      await db.delete(questionSets).where(eq(questionSets.id, set.id));
      await db.delete(topics).where(eq(topics.id, topic.id));
      await db.delete(subjects).where(eq(subjects.id, subject.id));
      await db.delete(examSessions).where(eq(examSessions.id, session.id));
      await db.delete(examVariants).where(eq(examVariants.id, variant.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});

test.describe("subjects/$subjectSlug — real data, honest empty state", () => {
  test("a subject slug with no rows shows an honest empty state", async ({ page }) => {
    await page.goto("/subjects/does-not-exist-e2e");
    await expect(page.getByText(/no topics published for this subject yet/i)).toBeVisible();
  });

  test("a real subject's real topic and question count render", async ({ page }) => {
    const db = getDb();
    const marker = randomUUID().slice(0, 8);

    const [subject] = await db
      .insert(subjects)
      .values({ name: `E2E Subject ${marker}`, slug: `e2e-subject-${marker}` })
      .returning();
    const [topic] = await db
      .insert(topics)
      .values({ subjectId: subject.id, name: `E2E Topic ${marker}`, slug: `e2e-topic-${marker}` })
      .returning();
    const [question] = await db
      .insert(questions)
      .values({
        slug: `e2e-question-${marker}`,
        questionText: `E2E question ${marker}`,
        status: "published",
        topicId: topic.id,
      })
      .returning();

    try {
      await page.goto(`/subjects/${subject.slug}`);
      await expect(page.getByText(topic.name)).toBeVisible();
      await expect(page.getByText("1 VOL")).toBeVisible();
    } finally {
      await db.delete(questions).where(eq(questions.id, question.id));
      await db.delete(topics).where(eq(topics.id, topic.id));
      await db.delete(subjects).where(eq(subjects.id, subject.id));
    }
  });
});

test.describe("question detail page — real data, auth-gated reveal", () => {
  test("a real published question renders and prompts sign-in to reveal", async ({ page }) => {
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
        name: `E2E Exam ${marker}`,
        slug: `e2e-exam-${marker}`,
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
      })
      .returning();
    const questionText = `What is the e2e-detail-marker-${marker}?`;
    const [question] = await db
      .insert(questions)
      .values({ slug: `e2e-question-${marker}`, questionText, status: "published" })
      .returning();
    const [optA] = await db
      .insert(questionOptions)
      .values({
        questionId: question.id,
        optionKey: "A",
        optionText: "Correct answer",
        sequence: 1,
      })
      .returning();
    await db
      .insert(questionOptions)
      .values({ questionId: question.id, optionKey: "B", optionText: "Wrong answer", sequence: 2 });
    await db.insert(questionAnswers).values({ questionId: question.id, correctOptionId: optA.id });
    await db.insert(questionOccurrences).values({ questionId: question.id, questionSetId: set.id });

    try {
      await page.goto(
        `/questions/${exam.slug}/${variant.slug}/2025/${subject.slug}/${question.slug}`,
      );
      await expect(page.getByText(questionText)).toBeVisible();
      await expect(page.getByText("Correct answer")).toBeVisible();
      await expect(page.getByText(/sign in to reveal answer/i)).toBeVisible();
    } finally {
      await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, question.id));
      await db.delete(questionAnswers).where(eq(questionAnswers.questionId, question.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, question.id));
      await db.delete(questions).where(eq(questions.id, question.id));
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

test.describe("practice — honest empty state for an exam with no published questions", () => {
  test("an exam with zero published questions shows an honest empty state, not a fixture", async ({
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
        name: `E2E Empty Exam ${marker}`,
        slug: `e2e-empty-exam-${marker}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning();

    try {
      await page.goto(`/practice?examSlug=${exam.slug}`);
      await expect(page.getByText(/doesn't have any published questions yet/i)).toBeVisible();
    } finally {
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});

test.describe("admin contributions — real submit and real admin review", () => {
  // Same admin-auth convention as tests/e2e/admin-pipeline.spec.ts: ADMIN_USERS must include this
  // email when the dev server starts (export it alongside your other env vars before running
  // `pnpm test:e2e`), since Better Auth's session has no role field to check instead.
  const E2E_ADMIN_EMAIL = "e2e-admin-contributions@example.com";

  test("a submitted contribution appears in the admin queue and can be approved", async ({
    page,
    context,
  }) => {
    const db = getDb();
    const marker = randomUUID().slice(0, 8);

    await db.delete(users).where(eq(users.email, E2E_ADMIN_EMAIL));
    const signUpRes = await context.request.post("/api/auth/sign-up/email", {
      data: { name: "E2E Admin", email: E2E_ADMIN_EMAIL, password: "e2e-test-password-123!" },
    });
    expect(signUpRes.ok()).toBe(true);
    const { user } = await signUpRes.json();

    const title = `E2E Contribution ${marker}`;

    try {
      // Real public submission through contribute.tsx.
      await page.goto("/contribute");
      await page.getByPlaceholder("e.g. Kerala PSC").fill(`E2E Authority ${marker}`);
      await page
        .getByPlaceholder(/Question 1/)
        .fill(`# ${title}\n\nWhat is the e2e marker?\n\nA) ${marker}\n\n**Answer:** A`);
      await page.getByRole("button", { name: /execute upload/i }).click();
      await expect(page.getByText(/submission received/i)).toBeVisible({ timeout: 10_000 });

      // Real admin review of that same real row.
      await page.goto("/admin/contributions");
      await expect(page.getByText(`E2E Authority ${marker}`).first()).toBeVisible({
        timeout: 10_000,
      });
      await page.getByText(`E2E Authority ${marker}`).first().click();
      await page.getByRole("button", { name: /^approve$/i }).click();
      // updateStatus + the list refetch are async and unawaited by the click itself — wait for
      // the Approve button to actually disappear (the row leaving the "pending" view) before
      // trusting the mutation has landed, rather than racing the filter switch below against it.
      await expect(page.getByRole("button", { name: /^approve$/i })).toBeHidden({
        timeout: 10_000,
      });

      // Approving moves the row out of the (default) "pending" filter, so switch to "approved"
      // before asserting the real status change actually reached the database.
      await page.getByRole("button", { name: "/ approved" }).click();
      await expect(page.getByText(`E2E Authority ${marker}`).first()).toBeVisible({
        timeout: 10_000,
      });
      await page.getByText(`E2E Authority ${marker}`).first().click();
      await expect(page.getByText("APPROVED").first()).toBeVisible();
    } finally {
      await db.delete(contributions).where(eq(contributions.examSlug, `E2E Authority ${marker}`));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
