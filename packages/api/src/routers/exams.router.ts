import { getDb } from "@prepora/db";
import { exams, examTypes } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import {
  countPublishedQuestionsByExam,
  listPublishedOccurrencesForExam,
  loadQuestionsWithAnswers,
} from "../lib/catalog-questions.js";

// docs/roadmap/engineering-roadmap.md item 24: this router used to read exam question content
// entirely from scrapedQuestions.parsedData — the pre-item-18 review-queue JSON blob. Since item
// 18, publish_question() writes real content straight into questions/question_occurrences/
// question_sets and never touches scrapedQuestions at all, so nothing published through the real
// pipeline could ever show up here. This rewrite reads the real catalog instead; a question that
// hasn't been published yet renders an honest empty state, not fabricated content.

export const examsRouter = {
  // Sources apps/web/app/routes/exams/index.tsx's category filter tabs from real data instead of
  // a hand-maintained, independently-drifting frontend constant (exam-domain-model.md §2,
  // Limitation 2).
  listTypes: publicProcedure
    .route({
      method: "GET",
      path: "/exams/types",
      summary: "List exam types (categories)",
    })
    .handler(async () => {
      const db = getDb();
      return db
        .select({ slug: examTypes.slug, label: examTypes.label })
        .from(examTypes)
        .orderBy(examTypes.label);
    }),

  list: publicProcedure
    .route({
      method: "GET",
      path: "/exams",
      summary: "List all available exams/question sets",
    })
    .input(
      z
        .object({
          limit: z.number().default(100),
          category: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const db = getDb();

      const [rows, counts] = await Promise.all([
        db.query.exams.findMany({
          where: eq(exams.status, "published"),
          limit: input?.limit || 100,
          with: { organization: true, examType: true },
        }),
        countPublishedQuestionsByExam(db),
      ]);

      return rows.map((exam) => {
        const questionCount = counts.get(exam.id) ?? 0;
        return {
          id: exam.id,
          name: exam.name,
          title: exam.name,
          slug: exam.slug,
          organization: exam.organization.name,
          org: exam.organization.name,
          category: exam.examType.label.toUpperCase(),
          categorySlug: exam.examType.slug,
          domain: exam.examType.label.toUpperCase(),
          code: exam.slug.toUpperCase(),
          logoUrl: exam.logoUrl,
          officialUrl: exam.officialUrl || "",
          description:
            exam.description ||
            `Official practice assessment and question repository for ${exam.name}.`,
          count: questionCount,
          questionCount,
        };
      });
    }),

  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/exams/{examSlug}",
      summary: "Get exam details by slug",
    })
    .input(
      z.object({
        examSlug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const exam = await db.query.exams.findFirst({
        where: eq(exams.slug, input.examSlug),
        with: { organization: true, examType: true },
      });

      if (!exam) {
        // Honest empty state for an exam slug that doesn't exist at all — never a fabricated
        // sample exam (docs/architecture/prepora-next-level-plan.md finding #3).
        return {
          id: input.examSlug,
          name: input.examSlug.replace(/-/g, " ").toUpperCase(),
          slug: input.examSlug,
          organization: null,
          category: null,
          categorySlug: null,
          officialUrl: null,
          logoUrl: null,
          description: null,
          questions: [],
          questionCount: 0,
          subjects: [],
          sets: [],
        };
      }

      const occurrences = await listPublishedOccurrencesForExam(db, exam.id);
      const questionsById = await loadQuestionsWithAnswers(
        db,
        occurrences.map((o) => o.questionId),
      );

      const finalQuestions = occurrences
        .map((occ) => {
          const q = questionsById.get(occ.questionId);
          if (!q) return null;
          return {
            id: q.id,
            text: q.questionText,
            options: q.options,
            correctKey: q.correctKey,
            explanation: q.explanation,
            topic: q.topicName || occ.subjectName || exam.name,
            examSlug: occ.examSlug,
            variantSlug: occ.examVariantSlug,
            year: occ.year,
            subjectSlug: occ.subjectSlug,
            questionSlug: q.slug,
          };
        })
        .filter((q): q is NonNullable<typeof q> => q !== null);

      const subjectSlugsSeen = new Set<string>();
      const subjectsList = occurrences
        .filter(
          (o) =>
            o.subjectSlug &&
            !subjectSlugsSeen.has(o.subjectSlug) &&
            subjectSlugsSeen.add(o.subjectSlug),
        )
        .map((o) => ({
          slug: o.subjectSlug as string,
          name: o.subjectName || (o.subjectSlug as string),
          questionCount: occurrences.filter((oo) => oo.subjectSlug === o.subjectSlug).length,
        }));

      const questionSetIds = new Set(occurrences.map((o) => o.questionSetId));

      return {
        id: exam.id,
        name: exam.name,
        slug: exam.slug,
        organization: exam.organization.name,
        category: exam.examType.label.toUpperCase(),
        categorySlug: exam.examType.slug,
        officialUrl: exam.officialUrl,
        logoUrl: exam.logoUrl,
        description:
          exam.description ||
          `Official practice assessment and question repository for ${exam.name}.`,
        questions: finalQuestions,
        questionCount: finalQuestions.length,
        subjects: subjectsList,
        sets: [...questionSetIds].map((id) => {
          const setOccurrences = occurrences.filter((o) => o.questionSetId === id);
          return {
            id,
            title: setOccurrences[0]?.questionSetSlug ?? id,
            questionCount: setOccurrences.length,
          };
        }),
      };
    }),

  getSubjectsByExam: publicProcedure
    .route({
      method: "GET",
      path: "/exams/{examSlug}/subjects",
      summary: "Get subjects for an exam",
    })
    .input(
      z.object({
        examSlug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const exam = await db.query.exams.findFirst({ where: eq(exams.slug, input.examSlug) });
      if (!exam) return [];

      const occurrences = await listPublishedOccurrencesForExam(db, exam.id);
      const subjectSlugsSeen = new Set<string>();
      const subjectSlugs = occurrences
        .filter(
          (o) =>
            o.subjectSlug &&
            !subjectSlugsSeen.has(o.subjectSlug) &&
            subjectSlugsSeen.add(o.subjectSlug),
        )
        .map((o) => o.subjectSlug as string);

      if (subjectSlugs.length === 0) return [];
      return db.query.subjects.findMany({
        where: (t, { inArray }) => inArray(t.slug, subjectSlugs),
      });
    }),
};
