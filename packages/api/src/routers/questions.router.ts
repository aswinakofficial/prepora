import { ORPCError } from "@orpc/server";
import { getDb } from "@prepora/db";
import { questions } from "@prepora/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import { createPracticeSession, finalizePracticeSession, recordAttempt } from "../lib/attempts.js";
import { findPublishedQuestionBySlug } from "../lib/catalog-questions.js";
import { loadQuestionImages } from "../lib/question-media.js";

export const questionsRouter = {
  // docs/roadmap/engineering-roadmap.md item 24: the question-detail page used to render a fixed
  // Strength-of-Materials fixture (DEMO_QUESTION) for every URL. This resolves the real question
  // by its slug (/questions/{slug}), returning options WITHOUT correctness — the reveal step calls
  // the existing submitAnswer mutation below, which verifies server-side.
  getBySlug: publicProcedure
    .route({
      method: "GET",
      path: "/questions/by-slug/{questionSlug}",
      summary: "Resolve a question by its page URL, /questions/{slug}",
    })
    .input(z.object({ questionSlug: z.string().min(1) }))
    .handler(async ({ input }) => {
      const db = getDb();
      const match = await findPublishedQuestionBySlug(db, input.questionSlug);

      if (!match) return null;

      const q = await db.query.questions.findFirst({
        where: eq(questions.id, match.id),
        with: { options: true, answers: true },
      });
      if (!q) return null;

      // Question and option images only — explanation images come back with the explanation,
      // from submitAnswer, so they can't hint at the answer before one is chosen.
      const images = (await loadQuestionImages(db, [q.id], ["question", "option"])).get(q.id) ?? [];

      return {
        id: q.id,
        text: q.questionText,
        // "numerical" questions take a typed answer, graded by submitAnswer against the key's
        // ranges — which never leave the server before an answer is submitted.
        questionType: q.questionType,
        // False when there's nothing to score (marks to all, dropped, cancelled): the page says
        // why, from the appearances' answerStatus, instead of offering a reveal.
        hasAnswer: q.answers.length > 0,
        images,
        // How many options make up the answer (3 for "Choose 3"), so the page can collect that
        // many before revealing — the count only, never which ones.
        answerCount: Math.max(
          1,
          q.answers.filter((a) => a.isCorrect !== false && a.correctOptionId).length,
        ),
        options: [...q.options]
          .sort((a, b) => a.sequence - b.sequence)
          .map((o) => ({ id: o.id, key: o.optionKey, text: o.optionText })),
        topic: match.topicName,
        // Every paper it appeared in, newest first — the page's "Appeared in" list and breadcrumbs.
        appearances: match.appearances,
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

  // docs/roadmap/engineering-roadmap.md item 25: scoring is server-authoritative and every
  // submission now writes a real `attempts` row — previously this procedure computed isCorrect
  // and returned it without persisting anything (see its own prior comment: "Here you would
  // typically log the attempt... For now we just return the result"). Downgraded from
  // protectedProcedure to publicProcedure so signed-out practice works: an anonymous caller sends
  // `sessionId` (a client-generated id persisted in localStorage) instead of relying on
  // context.user, so the attempt can still be attributed and later claimed on sign-in.
  submitAnswer: publicProcedure
    .route({
      method: "POST",
      path: "/questions/{id}/submit",
      summary: "Submit an answer for scoring",
    })
    .input(
      z.object({
        id: z.string(),
        // One option for a single-answer question; every chosen option for a "Choose N" one.
        selectedOptionIds: z.array(z.string()).min(1).optional(),
        selectedOptionId: z.string().optional(),
        // The typed answer to a numerical question.
        numericAnswer: z.string().trim().min(1).max(64).optional(),
        sessionId: z.string().optional(),
        practiceSessionId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (
        !input.selectedOptionIds?.length &&
        !input.selectedOptionId &&
        input.numericAnswer === undefined
      ) {
        throw new ORPCError("BAD_REQUEST", { message: "Select an option or enter an answer." });
      }
      const db = getDb();
      const result = await recordAttempt(db, {
        questionId: input.id,
        selectedOptionIds: input.selectedOptionIds,
        selectedOptionId: input.selectedOptionId,
        numericAnswer: input.numericAnswer,
        userId: context.user?.id,
        sessionId: input.sessionId,
        practiceSessionId: input.practiceSessionId,
      });
      if (!result) throw new ORPCError("NOT_FOUND", { message: "Question not found" });
      return result;
    }),

  // A practiceSessions row created when a real practice/mock run starts, so attempts can be
  // grouped into a session (`attempts.practiceSessionId`) and the run's own tallies persist past a
  // refresh instead of living only in practice.tsx's React state.
  startPracticeSession: publicProcedure
    .route({
      method: "POST",
      path: "/practice-sessions",
      summary: "Start a practice or mock session",
    })
    .input(
      z.object({
        mode: z.enum(["practice", "mock"]),
        questionSetId: z.string().optional(),
        totalQuestions: z.number(),
        sessionId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      return createPracticeSession(db, {
        mode: input.mode,
        questionSetId: input.questionSetId,
        totalQuestions: input.totalQuestions,
        userId: context.user?.id,
        sessionId: input.sessionId,
      });
    }),

  completePracticeSession: publicProcedure
    .route({
      method: "POST",
      path: "/practice-sessions/{id}/complete",
      summary: "Finalize a practice or mock session",
    })
    .input(
      z.object({
        id: z.string(),
        correct: z.number(),
        incorrect: z.number(),
        skipped: z.number(),
        timeTakenSeconds: z.number(),
      }),
    )
    .handler(async ({ input }) => {
      const db = getDb();
      await finalizePracticeSession(db, input);
      return { id: input.id };
    }),
};
