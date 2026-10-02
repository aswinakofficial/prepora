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
  searchQueries,
  subjects,
  topics,
} from "@prepora/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { PostgresSearchProvider } from "./postgres-provider.ts";
import { recordSearchClick, runSearchAndLog } from "./run-search.ts";

// docs/roadmap/engineering-roadmap.md item 23. Requires DATABASE_URL — matches the live-database
// testing convention already established across this repo's own test suites. Every test builds
// its own minimal catalog chain (org/exam/variant/session/subject/question_set) with a unique
// slug and tears it all down afterward.
const DATABASE_URL = process.env.DATABASE_URL;

interface SeededChain {
  organizationId: string;
  examTypeId: string;
  examId: string;
  subjectId: string;
  topicId: string | null;
  questionSetId: string;
  questionId: string;
}

describe.skipIf(!DATABASE_URL)("search", () => {
  const seeded: SeededChain[] = [];

  afterEach(async () => {
    if (seeded.length === 0) return;
    const db = getDb();
    for (const chain of seeded.splice(0)) {
      // FK-safe order: occurrences -> question -> question set -> topic -> subject -> exam
      // variant (cascades exam_sessions) -> exam -> exam type -> organization.
      await db
        .delete(questionOccurrences)
        .where(eq(questionOccurrences.questionId, chain.questionId));
      await db.delete(questions).where(eq(questions.id, chain.questionId));
      await db.delete(questionSets).where(eq(questionSets.id, chain.questionSetId));
      if (chain.topicId) {
        await db.delete(topics).where(eq(topics.id, chain.topicId));
      }
      await db.delete(subjects).where(eq(subjects.id, chain.subjectId));
      await db.delete(examVariants).where(eq(examVariants.examId, chain.examId));
      await db.delete(exams).where(eq(exams.id, chain.examId));
      await db.delete(examTypes).where(eq(examTypes.id, chain.examTypeId));
      await db.delete(organizations).where(eq(organizations.id, chain.organizationId));
    }
  });

  async function seedQuestion(overrides: {
    questionText: string;
    explanation?: string;
    status?: "published" | "draft";
    examName?: string;
    subjectName?: string;
    topicName?: string;
    year?: number;
  }) {
    const db = getDb();
    const unique = randomUUID().slice(0, 8);

    const [org] = await db
      .insert(organizations)
      .values({ name: `Test Org ${unique}`, slug: `test-org-${unique}` })
      .returning({ id: organizations.id });
    const [examType] = await db
      .insert(examTypes)
      .values({ slug: `test-type-${unique}`, label: `Test Type ${unique}` })
      .returning({ id: examTypes.id });
    const [exam] = await db
      .insert(exams)
      .values({
        name: overrides.examName ?? `Test Exam ${unique}`,
        slug: `test-exam-${unique}`,
        organizationId: org.id,
        examTypeId: examType.id,
        status: "published",
      })
      .returning({ id: exams.id, slug: exams.slug });
    const [variant] = await db
      .insert(examVariants)
      .values({ examId: exam.id, name: "Standard", slug: "standard" })
      .returning({ id: examVariants.id });
    const year = overrides.year ?? 2025;
    const [session] = await db
      .insert(examSessions)
      .values({ examVariantId: variant.id, label: String(year), year })
      .returning({ id: examSessions.id });
    const [subject] = await db
      .insert(subjects)
      .values({
        name: overrides.subjectName ?? `Test Subject ${unique}`,
        slug: `test-subject-${unique}`,
      })
      .returning({ id: subjects.id, slug: subjects.slug });
    let topicId: string | null = null;
    if (overrides.topicName) {
      const [topic] = await db
        .insert(topics)
        .values({ subjectId: subject.id, name: overrides.topicName, slug: `test-topic-${unique}` })
        .returning({ id: topics.id });
      topicId = topic.id;
    }
    const [set] = await db
      .insert(questionSets)
      .values({
        examVariantId: variant.id,
        examSessionId: session.id,
        subjectId: subject.id,
        title: `Test Set ${unique}`,
        slug: `test-set-${unique}`,
        publicationStatus: "published",
        paperKind: "official_practice",
        keyStatus: "final",
      })
      .returning({ id: questionSets.id });
    const [question] = await db
      .insert(questions)
      .values({
        slug: `test-question-${unique}`,
        questionText: overrides.questionText,
        explanation: overrides.explanation,
        topicId,
        status: overrides.status ?? "published",
      })
      .returning({ id: questions.id, slug: questions.slug });
    await db.insert(questionOccurrences).values({ questionId: question.id, questionSetId: set.id });

    seeded.push({
      organizationId: org.id,
      examTypeId: examType.id,
      examId: exam.id,
      subjectId: subject.id,
      topicId,
      questionSetId: set.id,
      questionId: question.id,
    });
    return {
      questionId: question.id,
      questionSlug: question.slug,
      examSlug: exam.slug,
      subjectSlug: subject.slug,
      year,
    };
  }

  describe("searchQuestions", () => {
    it("finds a known question by a distinctive phrase", async () => {
      const distinctivePhrase = `xylophone-resonance-frequency-${randomUUID().slice(0, 8)}`;
      const seeded = await seedQuestion({
        questionText: `What determines the ${distinctivePhrase} of a struck bar?`,
      });

      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchQuestions(distinctivePhrase);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(seeded.questionId);
      expect(results[0].slug).toBe(seeded.questionSlug);
      expect(results[0].examSlug).toBe(seeded.examSlug);
      expect(results[0].subjectSlug).toBe(seeded.subjectSlug);
      expect(results[0].year).toBe(seeded.year);
    });

    it("weights a match in the question text above a match only in the explanation", async () => {
      const marker = randomUUID().slice(0, 8);
      const inQuestion = await seedQuestion({
        questionText: `Explain torsion-${marker} in a circular shaft.`,
        explanation: "Unrelated explanation text.",
      });
      const inExplanationOnly = await seedQuestion({
        questionText: "Explain an unrelated concept.",
        explanation: `This relates to torsion-${marker} indirectly.`,
      });

      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchQuestions(`torsion-${marker}`);

      const ids = results.map((r) => r.id);
      expect(ids).toContain(inQuestion.questionId);
      expect(ids).toContain(inExplanationOnly.questionId);
      expect(ids.indexOf(inQuestion.questionId)).toBeLessThan(
        ids.indexOf(inExplanationOnly.questionId),
      );
    });

    it("returns empty for a query matching nothing", async () => {
      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchQuestions(`no-such-term-${randomUUID()}`);
      expect(results).toEqual([]);
    });

    it("never returns a draft question", async () => {
      const marker = randomUUID().slice(0, 8);
      await seedQuestion({ questionText: `Draft marker ${marker}`, status: "draft" });

      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchQuestions(`marker ${marker}`);
      expect(results).toEqual([]);
    });
  });

  describe("searchExams and searchTopics", () => {
    it("finds an exam by name", async () => {
      const marker = randomUUID().slice(0, 8);
      const seeded = await seedQuestion({
        questionText: "irrelevant",
        examName: `Distinctive Exam ${marker}`,
      });

      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchExams(`Distinctive Exam ${marker}`);
      expect(results.some((r) => r.slug === seeded.examSlug)).toBe(true);
    });

    it("finds a topic by name", async () => {
      const marker = randomUUID().slice(0, 8);
      await seedQuestion({ questionText: "irrelevant", topicName: `Distinctive Topic ${marker}` });

      const provider = new PostgresSearchProvider(getDb());
      const results = await provider.searchTopics(`Distinctive Topic ${marker}`);
      expect(results.some((r) => r.name === `Distinctive Topic ${marker}`)).toBe(true);
    });
  });

  describe("runSearchAndLog", () => {
    it("logs a zero-result query with resultCount 0 and still returns empty results", async () => {
      const db = getDb();
      const query = `no-results-${randomUUID()}`;

      const result = await runSearchAndLog(db, { q: query });

      expect(result.questions).toEqual([]);
      expect(result.exams).toEqual([]);
      expect(result.topics).toEqual([]);
      expect(result.searchQueryId).not.toBeNull();

      const [logged] = await db
        .select()
        .from(searchQueries)
        .where(eq(searchQueries.id, result.searchQueryId as string));
      expect(logged.resultCount).toBe(0);
      expect(logged.query).toBe(query);

      await db.delete(searchQueries).where(eq(searchQueries.id, result.searchQueryId as string));
    });

    it("does not log an empty/whitespace-only query", async () => {
      const result = await runSearchAndLog(getDb(), { q: "   " });
      expect(result.searchQueryId).toBeNull();
    });

    it("logs a real result count for a matching query", async () => {
      const db = getDb();
      const distinctivePhrase = `logging-verification-${randomUUID().slice(0, 8)}`;
      await seedQuestion({ questionText: `A question about ${distinctivePhrase}` });

      const result = await runSearchAndLog(db, { q: distinctivePhrase });

      const [logged] = await db
        .select()
        .from(searchQueries)
        .where(eq(searchQueries.id, result.searchQueryId as string));
      expect(logged.resultCount).toBeGreaterThanOrEqual(1);

      await db.delete(searchQueries).where(eq(searchQueries.id, result.searchQueryId as string));
    });

    it("recordSearchClick sets the clicked result id on the logged query", async () => {
      const db = getDb();
      const result = await runSearchAndLog(db, { q: `click-test-${randomUUID()}` });

      await recordSearchClick(db, {
        searchQueryId: result.searchQueryId as string,
        resultId: "some-result-id",
      });

      const [logged] = await db
        .select()
        .from(searchQueries)
        .where(eq(searchQueries.id, result.searchQueryId as string));
      expect(logged.clickedResultId).toBe("some-result-id");

      await db.delete(searchQueries).where(eq(searchQueries.id, result.searchQueryId as string));
    });
  });

  describe("performance", () => {
    const WORDS = [
      "modulus",
      "elasticity",
      "torsion",
      "bending",
      "shear",
      "stress",
      "strain",
      "beam",
      "column",
      "truss",
      "concrete",
      "reinforcement",
      "algorithm",
      "graph",
      "network",
      "cloud",
      "storage",
      "database",
      "protocol",
      "encryption",
    ];
    const CORPUS_SIZE = 5000;
    const BATCH_SIZE = 500;

    it("p95 latency for searchQuestions stays under a documented bound on a realistic corpus", async () => {
      const db = getDb();
      const marker = randomUUID().slice(0, 8);

      const [org] = await db
        .insert(organizations)
        .values({ name: `Perf Org ${marker}`, slug: `perf-org-${marker}` })
        .returning({ id: organizations.id });
      const [examType] = await db
        .insert(examTypes)
        .values({ slug: `perf-type-${marker}`, label: `Perf Type ${marker}` })
        .returning({ id: examTypes.id });
      const [exam] = await db
        .insert(exams)
        .values({
          name: `Perf Exam ${marker}`,
          slug: `perf-exam-${marker}`,
          organizationId: org.id,
          examTypeId: examType.id,
          status: "published",
        })
        .returning({ id: exams.id });
      const [variant] = await db
        .insert(examVariants)
        .values({ examId: exam.id, name: "Standard", slug: "standard" })
        .returning({ id: examVariants.id });
      const [session] = await db
        .insert(examSessions)
        .values({ examVariantId: variant.id, label: "2025", year: 2025 })
        .returning({ id: examSessions.id });
      const [subject] = await db
        .insert(subjects)
        .values({ name: `Perf Subject ${marker}`, slug: `perf-subject-${marker}` })
        .returning({ id: subjects.id });
      const [set] = await db
        .insert(questionSets)
        .values({
          examVariantId: variant.id,
          examSessionId: session.id,
          subjectId: subject.id,
          title: `Perf Set ${marker}`,
          slug: `perf-set-${marker}`,
          publicationStatus: "published",
          paperKind: "official_practice",
          keyStatus: "final",
        })
        .returning({ id: questionSets.id });

      const questionRows = Array.from({ length: CORPUS_SIZE }, (_, i) => ({
        id: randomUUID(),
        slug: `perf-question-${marker}-${i}`,
        questionText: `Perf corpus question ${marker} ${i} about ${WORDS[i % WORDS.length]} and ${WORDS[(i + 7) % WORDS.length]}`,
        status: "published" as const,
      }));

      for (let i = 0; i < questionRows.length; i += BATCH_SIZE) {
        await db.insert(questions).values(questionRows.slice(i, i + BATCH_SIZE));
      }
      for (let i = 0; i < questionRows.length; i += BATCH_SIZE) {
        const batch = questionRows
          .slice(i, i + BATCH_SIZE)
          .map((q) => ({ questionId: q.id, questionSetId: set.id }));
        await db.insert(questionOccurrences).values(batch);
      }

      try {
        const provider = new PostgresSearchProvider(db);
        const latencies: number[] = [];
        for (let i = 0; i < 20; i++) {
          const started = performance.now();
          await provider.searchQuestions(WORDS[i % WORDS.length]);
          latencies.push(performance.now() - started);
        }
        latencies.sort((a, b) => a - b);
        const p95 = latencies[Math.floor(latencies.length * 0.95)];
        console.log(`p95 latency over ${CORPUS_SIZE} questions: ${p95.toFixed(1)}ms`);

        // Documented bound: full-text search via the GIN index itself is fast regardless of
        // corpus size in this range — round-trip latency to a remote serverless Postgres instance
        // (Neon) dominates, not the query plan. ~100ms was actually observed against a 5,000-row
        // corpus; 500ms leaves headroom for real network variance without being loose enough to
        // hide a genuine regression.
        expect(p95).toBeLessThan(500);
      } finally {
        await db.delete(questionOccurrences).where(eq(questionOccurrences.questionSetId, set.id));
        await db.execute(sql`DELETE FROM questions WHERE slug LIKE ${`perf-question-${marker}-%`}`);
        await db.delete(questionSets).where(eq(questionSets.id, set.id));
        await db.delete(subjects).where(eq(subjects.id, subject.id));
        await db.delete(examVariants).where(eq(examVariants.examId, exam.id));
        await db.delete(exams).where(eq(exams.id, exam.id));
        await db.delete(examTypes).where(eq(examTypes.id, examType.id));
        await db.delete(organizations).where(eq(organizations.id, org.id));
      }
    }, 120_000);
  });
});
