import { randomUUID } from "node:crypto";
import { getDb } from "@prepora/db";
import { analyticsEvents, practiceSessions, searchQueries, users } from "@prepora/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENT_TYPES,
  getEventCountsByType,
  getPracticeFunnelStats,
  getSearchFailureStats,
  getTopViewedEntities,
  recordEvents,
} from "./analytics.ts";

// docs/roadmap/engineering-roadmap.md item 27. Requires DATABASE_URL — matches the live-database
// testing convention already established across this repo's own test suites. Every test tags its
// rows with a unique marker (sessionId or entityId) and tears them down afterward.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("analytics", () => {
  const sessionIdsToClean: string[] = [];
  const userIdsToClean: string[] = [];
  const searchQueryIdsToClean: string[] = [];
  const practiceSessionIdsToClean: string[] = [];

  afterEach(async () => {
    const db = getDb();
    for (const sessionId of sessionIdsToClean.splice(0)) {
      await db.delete(analyticsEvents).where(eq(analyticsEvents.sessionId, sessionId));
    }
    for (const userId of userIdsToClean.splice(0)) {
      await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    for (const id of searchQueryIdsToClean.splice(0)) {
      await db.delete(searchQueries).where(eq(searchQueries.id, id));
    }
    for (const id of practiceSessionIdsToClean.splice(0)) {
      await db.delete(practiceSessions).where(eq(practiceSessions.id, id));
    }
  });

  it("writes every event type correctly", async () => {
    const db = getDb();
    const sessionId = `test-${randomUUID()}`;
    sessionIdsToClean.push(sessionId);

    const events = ANALYTICS_EVENT_TYPES.map((event) => ({
      event,
      entityType: "test_entity",
      entityId: `entity-${event}`,
      meta: { note: event },
    }));

    const result = await recordEvents(db, events, { sessionId });
    expect(result.inserted).toBe(ANALYTICS_EVENT_TYPES.length);

    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.sessionId, sessionId));
    expect(rows).toHaveLength(ANALYTICS_EVENT_TYPES.length);

    for (const eventType of ANALYTICS_EVENT_TYPES) {
      const row = rows.find((r) => r.event === eventType);
      expect(row).toBeDefined();
      expect(row?.entityId).toBe(`entity-${eventType}`);
      expect(JSON.parse(row?.meta ?? "{}")).toEqual({ note: eventType });
    }
  });

  it("anonymous events carry a sessionId and no userId", async () => {
    const db = getDb();
    const sessionId = `test-${randomUUID()}`;
    sessionIdsToClean.push(sessionId);

    await recordEvents(db, [{ event: "page_view", entityType: "route", entityId: "/exams" }], {
      sessionId,
    });

    const [row] = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.sessionId, sessionId));
    expect(row.userId).toBeNull();
    expect(row.sessionId).toBe(sessionId);
  });

  it("authenticated events carry a userId and no sessionId, even if a sessionId is also sent", async () => {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(users)
      .values({ email: `analytics-test-${unique}@example.com`, name: "Test User" })
      .returning({ id: users.id });
    userIdsToClean.push(user.id);

    await recordEvents(db, [{ event: "page_view", entityType: "route", entityId: "/exams" }], {
      userId: user.id,
      sessionId: "should-be-ignored",
    });

    const [row] = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.userId, user.id));
    expect(row.userId).toBe(user.id);
    expect(row.sessionId).toBeNull();
  });

  it("a session's event sequence is recorded in order (search -> result_click -> question_view -> answer_reveal)", async () => {
    const db = getDb();
    const sessionId = `test-${randomUUID()}`;
    sessionIdsToClean.push(sessionId);
    const questionId = `q-${randomUUID().slice(0, 8)}`;

    await recordEvents(db, [{ event: "search", meta: { q: "young's modulus" } }], { sessionId });
    await recordEvents(
      db,
      [{ event: "result_click", entityType: "question", entityId: questionId }],
      { sessionId },
    );
    await recordEvents(
      db,
      [{ event: "question_view", entityType: "question", entityId: questionId }],
      {
        sessionId,
      },
    );
    await recordEvents(
      db,
      [{ event: "answer_reveal", entityType: "question", entityId: questionId }],
      {
        sessionId,
      },
    );

    const rows = await db.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.sessionId, sessionId),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    expect(rows.map((r) => r.event)).toEqual([
      "search",
      "result_click",
      "question_view",
      "answer_reveal",
    ]);
    expect(rows.slice(1).every((r) => r.entityId === questionId)).toBe(true);
  });

  it("getEventCountsByType groups by event", async () => {
    const db = getDb();
    const sessionId = `test-${randomUUID()}`;
    sessionIdsToClean.push(sessionId);

    await recordEvents(
      db,
      [
        { event: "question_view", entityId: "a" },
        { event: "question_view", entityId: "b" },
      ],
      { sessionId },
    );

    const counts = await getEventCountsByType(db, 1);
    const questionViewCount = counts.find((c) => c.event === "question_view");
    expect(questionViewCount).toBeDefined();
    expect(questionViewCount?.count).toBeGreaterThanOrEqual(2);
  });

  it("getTopViewedEntities ranks by view count", async () => {
    const db = getDb();
    const sessionId = `test-${randomUUID()}`;
    sessionIdsToClean.push(sessionId);
    const marker = randomUUID().slice(0, 8);
    const popular = `popular-${marker}`;
    const rare = `rare-${marker}`;

    await recordEvents(
      db,
      [
        { event: "question_view", entityType: "question", entityId: popular },
        { event: "question_view", entityType: "question", entityId: popular },
        { event: "question_view", entityType: "question", entityId: rare },
      ],
      { sessionId },
    );

    const top = await getTopViewedEntities(db, "question_view", "question", 10);
    const popularEntry = top.find((t) => t.entityId === popular);
    const rareEntry = top.find((t) => t.entityId === rare);
    expect(popularEntry?.count).toBe(2);
    expect(rareEntry?.count).toBe(1);
  });

  it("getSearchFailureStats computes the zero-result rate", async () => {
    const db = getDb();
    const marker = randomUUID().slice(0, 8);

    const [zero] = await db
      .insert(searchQueries)
      .values({ query: `zero-${marker}`, resultCount: 0 })
      .returning({ id: searchQueries.id });
    const [hit] = await db
      .insert(searchQueries)
      .values({ query: `hit-${marker}`, resultCount: 5 })
      .returning({ id: searchQueries.id });
    searchQueryIdsToClean.push(zero.id, hit.id);

    const stats = await getSearchFailureStats(db, 1);
    expect(stats.totalSearches).toBeGreaterThanOrEqual(2);
    expect(stats.zeroResultSearches).toBeGreaterThanOrEqual(1);
    expect(stats.zeroResultRate).toBeGreaterThan(0);
  });

  it("getPracticeFunnelStats computes started vs. completed", async () => {
    const db = getDb();

    const [started] = await db
      .insert(practiceSessions)
      .values({ mode: "practice", totalQuestions: 5 })
      .returning({ id: practiceSessions.id });
    const [completed] = await db
      .insert(practiceSessions)
      .values({ mode: "practice", totalQuestions: 5, completedAt: new Date().toISOString() })
      .returning({ id: practiceSessions.id });
    practiceSessionIdsToClean.push(started.id, completed.id);

    const funnel = await getPracticeFunnelStats(db, 1);
    expect(funnel.started).toBeGreaterThanOrEqual(2);
    expect(funnel.completed).toBeGreaterThanOrEqual(1);
    expect(funnel.completionRate).toBeGreaterThan(0);
  });
});
