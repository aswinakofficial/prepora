import { randomUUID } from "node:crypto";
import { getDb } from "@prepora/db";
import {
  attempts,
  practiceSessions,
  questionAnswers,
  questionOptions,
  questions,
  users,
} from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createPracticeSession, finalizePracticeSession, recordAttempt } from "./attempts.ts";

// docs/roadmap/engineering-roadmap.md item 25. Requires DATABASE_URL — matches the live-database
// testing convention already established across this repo's own test suites (see
// search/postgres-provider.test.ts). Every test builds its own minimal question and tears it down.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("attempts", () => {
  const seededQuestionIds: string[] = [];
  const seededSessionIds: string[] = [];
  const seededUserIds: string[] = [];

  afterEach(async () => {
    const db = getDb();
    for (const id of seededSessionIds.splice(0)) {
      await db.delete(attempts).where(eq(attempts.practiceSessionId, id));
      await db.delete(practiceSessions).where(eq(practiceSessions.id, id));
    }
    for (const id of seededQuestionIds.splice(0)) {
      await db.delete(attempts).where(eq(attempts.questionId, id));
      await db.delete(questionAnswers).where(eq(questionAnswers.questionId, id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
      await db.delete(questions).where(eq(questions.id, id));
    }
    for (const id of seededUserIds.splice(0)) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  async function seedQuestion() {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);
    const [q] = await db
      .insert(questions)
      .values({
        slug: `test-q-${unique}`,
        questionText: `Test question ${unique}`,
        status: "published",
      })
      .returning({ id: questions.id });
    seededQuestionIds.push(q.id);

    const [optA] = await db
      .insert(questionOptions)
      .values({ questionId: q.id, optionKey: "A", optionText: "Correct", sequence: 1 })
      .returning({ id: questionOptions.id });
    const [optB] = await db
      .insert(questionOptions)
      .values({ questionId: q.id, optionKey: "B", optionText: "Wrong", sequence: 2 })
      .returning({ id: questionOptions.id });
    await db.insert(questionAnswers).values({ questionId: q.id, correctOptionId: optA.id });

    return { questionId: q.id, correctOptionId: optA.id, wrongOptionId: optB.id };
  }

  it("a correct submission writes exactly one attempt with isCorrect=true", async () => {
    const db = getDb();
    const { questionId, correctOptionId } = await seedQuestion();

    const result = await recordAttempt(db, {
      questionId,
      selectedOptionId: correctOptionId,
      sessionId: `anon-${randomUUID()}`,
    });

    expect(result?.isCorrect).toBe(true);
    expect(result?.correctOptionId).toBe(correctOptionId);

    const rows = await db.select().from(attempts).where(eq(attempts.questionId, questionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].isCorrect).toBe(true);
    expect(rows[0].selectedOptionId).toBe(correctOptionId);
  });

  it("an incorrect submission writes exactly one attempt with isCorrect=false", async () => {
    const db = getDb();
    const { questionId, wrongOptionId } = await seedQuestion();

    const result = await recordAttempt(db, {
      questionId,
      selectedOptionId: wrongOptionId,
      sessionId: `anon-${randomUUID()}`,
    });

    expect(result?.isCorrect).toBe(false);

    const rows = await db.select().from(attempts).where(eq(attempts.questionId, questionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].isCorrect).toBe(false);
  });

  it("returns null for a question that doesn't exist, without writing an attempt", async () => {
    const db = getDb();
    const result = await recordAttempt(db, {
      questionId: randomUUID(),
      selectedOptionId: randomUUID(),
      sessionId: "anon-nonexistent",
    });
    expect(result).toBeNull();
  });

  it("an anonymous attempt is attributed by sessionId, not userId", async () => {
    const db = getDb();
    const { questionId, correctOptionId } = await seedQuestion();
    const sessionId = `anon-${randomUUID()}`;

    await recordAttempt(db, { questionId, selectedOptionId: correctOptionId, sessionId });

    const [row] = await db.select().from(attempts).where(eq(attempts.questionId, questionId));
    expect(row.userId).toBeNull();
    expect(row.sessionId).toBe(sessionId);
  });

  it("a signed-in attempt is attributed by userId even if a sessionId is also sent", async () => {
    const db = getDb();
    const { questionId, correctOptionId } = await seedQuestion();
    const unique = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(users)
      .values({ email: `attempts-test-${unique}@example.com`, name: "Test User" })
      .returning({ id: users.id });
    seededUserIds.push(user.id);

    await recordAttempt(db, {
      questionId,
      selectedOptionId: correctOptionId,
      userId: user.id,
      sessionId: "should-be-ignored",
    });

    const [row] = await db.select().from(attempts).where(eq(attempts.questionId, questionId));
    expect(row.userId).toBe(user.id);
    expect(row.sessionId).toBeNull();
  });

  it("an anonymous practice session persists and is claimable on sign-in", async () => {
    const db = getDb();
    const sessionId = `anon-${randomUUID()}`;

    const { id: practiceSessionId } = await createPracticeSession(db, {
      mode: "practice",
      totalQuestions: 3,
      sessionId,
    });
    seededSessionIds.push(practiceSessionId);

    const [created] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, practiceSessionId));
    expect(created.userId).toBeNull();
    expect(created.sessionId).toBe(sessionId);
    expect(created.completedAt).toBeNull();

    await finalizePracticeSession(db, {
      id: practiceSessionId,
      correct: 2,
      incorrect: 1,
      skipped: 0,
      timeTakenSeconds: 90,
    });

    const [finalized] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, practiceSessionId));
    expect(finalized.correct).toBe(2);
    expect(finalized.incorrect).toBe(1);
    expect(finalized.timeTakenSeconds).toBe(90);
    expect(finalized.completedAt).not.toBeNull();

    // "Claimable on sign-in": the anonymous session row can be re-attributed to a real user
    // afterward — this is the structural guarantee item 25 asks for; the sign-in flow that
    // triggers it is out of this item's affected-files scope.
    const unique = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(users)
      .values({ email: `claim-test-${unique}@example.com`, name: "Claiming User" })
      .returning({ id: users.id });
    seededUserIds.push(user.id);

    await db
      .update(practiceSessions)
      .set({ userId: user.id, sessionId: null })
      .where(eq(practiceSessions.id, practiceSessionId));

    const [claimed] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, practiceSessionId));
    expect(claimed.userId).toBe(user.id);
    expect(claimed.correct).toBe(2);
  });
});
