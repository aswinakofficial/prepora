import { randomUUID } from "node:crypto";
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
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { findPublishedQuestionBySlug } from "./catalog-questions.ts";

// The lookup behind /questions/{slug} (docs/specs/01-question-urls.md). Requires DATABASE_URL, like
// sitemap.test.ts; every test builds its own catalog chain and removes it afterwards.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("findPublishedQuestionBySlug", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const undo of cleanup.splice(0).reverse()) await undo();
  });

  async function seed() {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);
    const [org] = await db
      .insert(organizations)
      .values({ name: `Org ${unique}`, slug: `org-${unique}` })
      .returning({ id: organizations.id });
    const [examType] = await db
      .insert(examTypes)
      .values({ slug: `type-${unique}`, label: `Type ${unique}` })
      .returning({ id: examTypes.id });
    const [exam] = await db
      .insert(exams)
      .values({
        name: `Exam ${unique}`,
        slug: `exam-${unique}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning({ id: exams.id, slug: exams.slug, name: exams.name });
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning({ id: examVariants.id });
    // One session without a year (like every MS Learn exam) and one with.
    const [version1] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "Version 1" })
      .returning({ id: examSessions.id });
    const [y2025] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: "2025", year: 2025 })
      .returning({ id: examSessions.id });
    const sets = await db
      .insert(questionSets)
      .values([
        {
          examVariantId: variant.id,
          examSessionId: version1.id,
          title: `Practice ${unique}`,
          slug: `practice-${unique}`,
          publicationStatus: "published" as const,
        },
        {
          examVariantId: variant.id,
          examSessionId: y2025.id,
          title: `Paper 2025 ${unique}`,
          slug: `paper-2025-${unique}`,
          publicationStatus: "published" as const,
        },
      ])
      .returning({ id: questionSets.id });
    const created = await db
      .insert(questions)
      .values([
        { slug: `pub-${unique}`, questionText: "Published", status: "published" as const },
        { slug: `draft-${unique}`, questionText: "Draft", status: "draft" as const },
      ])
      .returning({ id: questions.id });
    const [published, draft] = created;
    await db.insert(questionOccurrences).values([
      { questionId: published.id, questionSetId: sets[0].id, originalQuestionNumber: 12 },
      { questionId: published.id, questionSetId: sets[1].id, originalQuestionNumber: 3 },
      { questionId: draft.id, questionSetId: sets[0].id },
    ]);

    cleanup.push(async () => {
      for (const q of created) {
        await db.delete(questionOccurrences).where(eq(questionOccurrences.questionId, q.id));
        await db.delete(questions).where(eq(questions.id, q.id));
      }
      for (const s of sets) await db.delete(questionSets).where(eq(questionSets.id, s.id));
      await db.delete(examVariants).where(eq(examVariants.id, variant.id));
      await db.delete(exams).where(eq(exams.id, exam.id));
      await db.delete(examTypes).where(eq(examTypes.id, examType.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    });
    return { unique, exam, publishedId: published.id };
  }

  it("finds a published question by slug, with every paper it appeared in, newest first", async () => {
    const { unique, exam, publishedId } = await seed();
    const found = await findPublishedQuestionBySlug(getDb(), `pub-${unique}`);

    expect(found?.id).toBe(publishedId);
    expect(found?.appearances).toEqual([
      {
        examSlug: exam.slug,
        examName: exam.name,
        questionSetSlug: `paper-2025-${unique}`,
        questionSetTitle: `Paper 2025 ${unique}`,
        year: 2025,
        sessionLabel: "2025",
        originalQuestionNumber: 3,
      },
      {
        examSlug: exam.slug,
        examName: exam.name,
        questionSetSlug: `practice-${unique}`,
        questionSetTitle: `Practice ${unique}`,
        year: null,
        sessionLabel: "Version 1",
        originalQuestionNumber: 12,
      },
    ]);
  });

  it("returns null for a draft question and for an unknown slug", async () => {
    const { unique } = await seed();
    expect(await findPublishedQuestionBySlug(getDb(), `draft-${unique}`)).toBeNull();
    expect(await findPublishedQuestionBySlug(getDb(), `missing-${unique}`)).toBeNull();
  });
});
