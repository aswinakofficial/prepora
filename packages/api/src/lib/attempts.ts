import type { getDb } from "@prepora/db";
import { attempts, practiceSessions, questions } from "@prepora/db/schema";
import { eq } from "drizzle-orm";

/**
 * The logic behind questions.router.ts's `submitAnswer` procedure, extracted so it's directly
 * unit-testable without going through oRPC's request machinery — mirrors search/run-search.ts's
 * extraction (item 23) for the same reason.
 *
 * docs/roadmap/engineering-roadmap.md item 25: scoring is computed here, server-side, from the
 * real `question_answers` row — never trusted from the caller — and every call writes a real
 * `attempts` row. Exactly one of `userId`/`sessionId` should be set (a signed-in user vs. an
 * anonymous browser session); passing neither still records the attempt, just unattributed.
 */
export async function recordAttempt(
  db: ReturnType<typeof getDb>,
  input: {
    questionId: string;
    selectedOptionId: string;
    userId?: string | null;
    sessionId?: string | null;
    practiceSessionId?: string | null;
  },
): Promise<{
  questionId: string;
  isCorrect: boolean;
  correctOptionId: string | null | undefined;
  explanation: string | null;
} | null> {
  const q = await db.query.questions.findFirst({
    where: eq(questions.id, input.questionId),
    with: { answers: true },
  });
  if (!q) return null;

  const correctAnswer = q.answers.find((a) => a.isCorrect);
  const isCorrect = correctAnswer?.correctOptionId === input.selectedOptionId;

  await db.insert(attempts).values({
    userId: input.userId ?? null,
    sessionId: input.userId ? null : (input.sessionId ?? null),
    questionId: q.id,
    selectedOptionId: input.selectedOptionId,
    isCorrect,
    practiceSessionId: input.practiceSessionId ?? null,
  });

  return {
    questionId: q.id,
    isCorrect,
    correctOptionId: correctAnswer?.correctOptionId,
    explanation: q.explanation,
  };
}

/** The logic behind questions.router.ts's `startPracticeSession` procedure. */
export async function createPracticeSession(
  db: ReturnType<typeof getDb>,
  input: {
    mode: "practice" | "mock";
    questionSetId?: string;
    totalQuestions: number;
    userId?: string | null;
    sessionId?: string | null;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(practiceSessions)
    .values({
      userId: input.userId ?? null,
      sessionId: input.userId ? null : (input.sessionId ?? null),
      mode: input.mode,
      questionSetId: input.questionSetId,
      totalQuestions: input.totalQuestions,
    })
    .returning({ id: practiceSessions.id });
  return { id: row.id };
}

/** The logic behind questions.router.ts's `completePracticeSession` procedure. */
export async function finalizePracticeSession(
  db: ReturnType<typeof getDb>,
  input: {
    id: string;
    correct: number;
    incorrect: number;
    skipped: number;
    timeTakenSeconds: number;
  },
): Promise<void> {
  await db
    .update(practiceSessions)
    .set({
      correct: input.correct,
      incorrect: input.incorrect,
      skipped: input.skipped,
      timeTakenSeconds: input.timeTakenSeconds,
      completedAt: new Date().toISOString(),
    })
    .where(eq(practiceSessions.id, input.id));
}
