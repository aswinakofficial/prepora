import { os, ORPCError } from "@orpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure } from "../context.js";
import { getDb } from "@prepora/db";
import { questions, questionOptions, questionAnswers } from "@prepora/db/schema";
import { eq, and } from "drizzle-orm";

export const questionsRouter = {
  list: publicProcedure
    .route({
      method: "GET",
      path: "/questions",
      summary: "List practice questions",
    })
    .input(
      z.object({
        limit: z.number().default(20),
        topicId: z.string().optional(),
      }).optional()
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
          answers: true
        }
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
      })
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      
      const q = await db.query.questions.findFirst({
        where: eq(questions.id, input.id),
        with: {
          answers: true
        }
      });
      
      if (!q) throw new ORPCError("NOT_FOUND", { message: "Question not found" });
      
      const correctAnswer = q.answers.find(a => a.isCorrect);
      const isCorrect = correctAnswer?.correctOptionId === input.selectedOptionId;
      
      // Here you would typically log the attempt into userAnalytics or progression tables
      // For now we just return the result
      return {
        questionId: q.id,
        isCorrect,
        correctOptionId: correctAnswer?.correctOptionId,
        explanation: q.explanation
      };
    }),
};
