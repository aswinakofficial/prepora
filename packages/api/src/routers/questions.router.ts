import { ORPCError } from "@orpc/server";
import { getDb } from "@prepora/db";
import { questions } from "@prepora/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../context.js";
import { findPublishedQuestionByPath } from "../lib/catalog-questions.js";

export const questionsRouter = {
  // docs/roadmap/engineering-roadmap.md item 24: the question-detail page used to render a fixed
  // Strength-of-Materials fixture (DEMO_QUESTION) for every URL. This resolves the real question
  // for the exact exam/variant/year/subject/question path, returning options WITHOUT correctness —
  // the reveal step calls the existing submitAnswer mutation below, which verifies server-side.
  getByPath: publicProcedure
    .route({
      method: "GET",
      path: "/questions/by-path/{examSlug}/{variantSlug}/{year}/{subjectSlug}/{questionSlug}",
      summary: "Resolve a question by its detail-page URL path",
    })
    .input(
      z.object({
        examSlug: z.string(),
        variantSlug: z.string(),
        year: z.coerce.number(),
        subjectSlug: z.string(),
        questionSlug: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      const match = await findPublishedQuestionByPath(db, {
        examSlug: input.examSlug,
        examVariantSlug: input.variantSlug,
        year: input.year,
        subjectSlug: input.subjectSlug,
        questionSlug: input.questionSlug,
      });

      if (!match) return null;

      const q = await db.query.questions.findFirst({
        where: eq(questions.id, match.id),
        with: { options: true },
      });
      if (!q) return null;

      return {
        id: q.id,
        text: q.questionText,
        options: [...q.options]
          .sort((a, b) => a.sequence - b.sequence)
          .map((o) => ({ key: o.optionKey, text: o.optionText })),
        topic: match.topicName,
      };
    }),

  list: publicProcedure
    .route({
      method: "GET",
      path: "/questions",
      summary: "List practice questions",
    })
    .input(
      z
        .object({
          limit: z.number().default(20),
          topicId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const db = getDb();

      const conditions = [];
      if (input?.topicId) {
        conditions.push(eq(questions.topicId, input.topicId));
      }

      const results = await db.query.questions.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit: input?.limit || 20,
        with: {
          options: true,
          answers: true,
        },
      });

      return results;
    }),

  submitAnswer: protectedProcedure
    .route({
      method: "POST",
      path: "/questions/{id}/submit",
      summary: "Submit an answer for scoring",
    })
    .input(
      z.object({
        id: z.string(),
        selectedOptionId: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();

      const q = await db.query.questions.findFirst({
        where: eq(questions.id, input.id),
        with: {
          answers: true,
        },
      });

      if (!q) throw new ORPCError("NOT_FOUND", { message: "Question not found" });

      const correctAnswer = q.answers.find((a) => a.isCorrect);
      const isCorrect = correctAnswer?.correctOptionId === input.selectedOptionId;

      // Here you would typically log the attempt into userAnalytics or progression tables
      // For now we just return the result
      return {
        questionId: q.id,
        isCorrect,
        correctOptionId: correctAnswer?.correctOptionId,
        explanation: q.explanation,
      };
    }),
};
