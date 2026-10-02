import type { getDb } from "@prepora/db";
import { questions } from "@prepora/db/schema";
import { inArray, sql } from "drizzle-orm";
import { numericKey } from "./numeric-answer.js";
import { loadQuestionImages, type QuestionImage } from "./question-media.js";

// docs/roadmap/engineering-roadmap.md item 24: shared catalog-traversal logic for every page that
// lists or resolves published questions — extracted so exams.router.ts, topics.router.ts,
// subjects.router.ts, and question-sets.router.ts don't each hand-roll the same
// question -> occurrence -> question_set -> exam_variant -> exam chain independently (which is
// exactly how exams.router.ts's getBySlug ended up reading from the abandoned scrapedQuestions
// blob instead of the real catalog in the first place — one query shape drifted from reality
// while nobody else needed to touch it).

export type AnswerStatus = "scored" | "marks_to_all" | "dropped" | "cancelled";

/** Facts about a question in one paper (docs/specs/03-paper-structure-min.md). */
export interface OccurrenceFacts {
  sectionLabel: string | null;
  numberLabel: string | null;
  marks: number | null;
  negativeMarks: number | null;
  answerStatus: AnswerStatus;
}

export interface QuestionOccurrenceContext extends OccurrenceFacts {
  questionId: string;
  questionSetId: string;
  questionSetSlug: string;
  /** Only populated by listPublishedOccurrencesForExam. */
  questionSetTitle?: string;
  examSlug: string;
  examVariantSlug: string;
  year: number | null;
  subjectSlug: string | null;
  subjectName: string | null;
  originalQuestionNumber: number | null;
}

// numeric(5,2) comes back from the driver as a string; these are numbers to the page.
const OCCURRENCE_FACTS = sql`
      o.section_label AS "sectionLabel",
      o.number_label AS "numberLabel",
      o.marks::float8 AS "marks",
      o.negative_marks::float8 AS "negativeMarks",
      o.answer_status AS "answerStatus"`;

/**
 * Every occurrence of every published question under a given exam, one row per occurrence (a
 * question recurring across years appears once per year here) — the raw material for both "list
 * every question under this exam" and "resolve one question's link params" call sites.
 */
export async function listPublishedOccurrencesForExam(
  db: ReturnType<typeof getDb>,
  examId: string,
): Promise<QuestionOccurrenceContext[]> {
  const result = await db.execute(sql`
    SELECT
      q.id AS "questionId",
      qs.id AS "questionSetId",
      qs.slug AS "questionSetSlug",
      qs.title AS "questionSetTitle",
      e.slug AS "examSlug",
      ev.slug AS "examVariantSlug",
      es.year,
      s.slug AS "subjectSlug",
      s.name AS "subjectName",
      o.original_question_number AS "originalQuestionNumber",
      ${OCCURRENCE_FACTS}
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    LEFT JOIN exam_sessions es ON es.id = qs.exam_session_id
    LEFT JOIN subjects s ON s.id = qs.subject_id
    WHERE ev.exam_id = ${examId} AND q.status = 'published'
    ORDER BY es.year DESC NULLS LAST, o.original_question_number ASC NULLS LAST
  `);
  return result.rows as unknown as QuestionOccurrenceContext[];
}

/** Same as above, scoped to one question_set (a "paper") instead of a whole exam. */
export async function listPublishedOccurrencesForQuestionSet(
  db: ReturnType<typeof getDb>,
  questionSetId: string,
): Promise<QuestionOccurrenceContext[]> {
  const result = await db.execute(sql`
    SELECT
      q.id AS "questionId",
      qs.id AS "questionSetId",
      qs.slug AS "questionSetSlug",
      e.slug AS "examSlug",
      ev.slug AS "examVariantSlug",
      es.year,
      s.slug AS "subjectSlug",
      s.name AS "subjectName",
      o.original_question_number AS "originalQuestionNumber",
      ${OCCURRENCE_FACTS}
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    LEFT JOIN exam_sessions es ON es.id = qs.exam_session_id
    LEFT JOIN subjects s ON s.id = qs.subject_id
    WHERE qs.id = ${questionSetId} AND q.status = 'published'
    ORDER BY o.original_question_number ASC NULLS LAST
  `);
  return result.rows as unknown as QuestionOccurrenceContext[];
}

/** Every occurrence of every published question tagged with a given topic. */
export async function listPublishedOccurrencesForTopic(
  db: ReturnType<typeof getDb>,
  topicId: string,
): Promise<QuestionOccurrenceContext[]> {
  const result = await db.execute(sql`
    SELECT
      q.id AS "questionId",
      qs.id AS "questionSetId",
      qs.slug AS "questionSetSlug",
      e.slug AS "examSlug",
      ev.slug AS "examVariantSlug",
      es.year,
      s.slug AS "subjectSlug",
      s.name AS "subjectName",
      o.original_question_number AS "originalQuestionNumber",
      ${OCCURRENCE_FACTS}
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    LEFT JOIN exam_sessions es ON es.id = qs.exam_session_id
    LEFT JOIN subjects s ON s.id = qs.subject_id
    WHERE q.topic_id = ${topicId} AND q.status = 'published'
    ORDER BY es.year DESC NULLS LAST, o.original_question_number ASC NULLS LAST
  `);
  return result.rows as unknown as QuestionOccurrenceContext[];
}

/**
 * Published-question counts for every topic under a given subject, keyed by topic id — used by
 * subjects.router.ts's `getBySlug` so the topic list shows real counts without an N+1 round trip.
 */
export async function countPublishedQuestionsByTopicForSubject(
  db: ReturnType<typeof getDb>,
  subjectId: string,
): Promise<Map<string, number>> {
  const result = await db.execute(sql`
    SELECT t.id AS "topicId", COUNT(*)::int AS "count"
    FROM questions q
    JOIN topics t ON t.id = q.topic_id
    WHERE t.subject_id = ${subjectId} AND q.status = 'published'
    GROUP BY t.id
  `);
  const counts = new Map<string, number>();
  for (const row of result.rows as unknown as { topicId: string; count: number }[]) {
    counts.set(row.topicId, row.count);
  }
  return counts;
}

/**
 * Published-question counts for every exam in one query, keyed by exam id — used by exams.router.ts's
 * `list` to show a real count per exam without an N+1 round trip per row. `question_sets` has no
 * direct `occurrences` relation (only `questions` does — see questionsRelations in
 * schema/questions.ts), so this is a plain grouped join rather than the Drizzle relational query API.
 */
export async function countPublishedQuestionsByExam(
  db: ReturnType<typeof getDb>,
): Promise<Map<string, number>> {
  const result = await db.execute(sql`
    SELECT e.id AS "examId", COUNT(*)::int AS "count"
    FROM questions q
    JOIN question_occurrences o ON o.question_id = q.id
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    WHERE q.status = 'published'
    GROUP BY e.id
  `);
  const counts = new Map<string, number>();
  for (const row of result.rows as unknown as { examId: string; count: number }[]) {
    counts.set(row.examId, row.count);
  }
  return counts;
}

export interface QuestionWithAnswer {
  id: string;
  slug: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  topicName: string | null;
  options: { id: string; key: string; text: string }[];
  /** Every correct option key, in option order — more than one for a "Choose N" question. */
  correctKeys: string[];
  /** The first of correctKeys, kept for single-answer callers. */
  correctKey: string | null;
  questionType: string;
  /** A numerical question's accepted ranges, inclusive; empty when it's graded as text. */
  numericRanges: Array<[number, number]>;
  /** A numerical question's answer as the key prints it, e.g. "4.24 to 4.26". */
  numericAnswer: string | null;
  /** False when there's nothing to score: marks to all, dropped or cancelled. */
  hasAnswer: boolean;
  images: QuestionImage[];
}

/**
 * Full question content (text, options, the correct key) for a set of question ids, keyed by id.
 * `correctKey` is included client-side deliberately, matching the practice-mode UX this data
 * already had with fixture data (immediate local scoring, no server round trip per answer) — item
 * 24 replaces fabricated content with real content, it does not redesign practice.tsx's existing
 * client-side-scoring security posture; see docs/roadmap/engineering-roadmap.md item 25 for
 * whether attempts get persisted at all.
 */
export async function loadQuestionsWithAnswers(
  db: ReturnType<typeof getDb>,
  questionIds: string[],
): Promise<Map<string, QuestionWithAnswer>> {
  if (questionIds.length === 0) return new Map();

  const rows = await db.query.questions.findMany({
    where: inArray(questions.id, questionIds),
    with: {
      options: true,
      answers: true,
      topic: true,
    },
  });

  const imagesById = await loadQuestionImages(db, questionIds);
  const byId = new Map<string, QuestionWithAnswer>();
  for (const row of rows) {
    const sortedOptions = [...row.options].sort((a, b) => a.sequence - b.sequence);
    // Every correct answer, not just the first: multiple_correct questions store one
    // question_answers row per correct option, and taking answers[0] alone made practice mode
    // treat them as single-choice ("Choose 3" revealed after one click).
    const correctIds = new Set(
      row.answers
        .filter((a) => a.isCorrect !== false && a.correctOptionId)
        .map((a) => a.correctOptionId as string),
    );
    const correctKeys = sortedOptions.filter((o) => correctIds.has(o.id)).map((o) => o.optionKey);
    const numeric = numericKey(row.answers);

    byId.set(row.id, {
      id: row.id,
      slug: row.slug,
      questionText: row.questionText,
      explanation: row.explanation,
      difficulty: row.difficulty,
      topicName: row.topic?.name ?? null,
      // docs/roadmap/engineering-roadmap.md item 25: `id` is included so callers can pass a real
      // selectedOptionId straight into questions.submitAnswer instead of only having the display key.
      options: sortedOptions.map((o) => ({ id: o.id, key: o.optionKey, text: o.optionText })),
      correctKeys,
      correctKey: correctKeys[0] ?? null,
      questionType: row.questionType,
      numericRanges: numeric.ranges,
      numericAnswer: numeric.display,
      hasAnswer: row.answers.length > 0,
      images: imagesById.get(row.id) ?? [],
    });
  }
  return byId;
}

/** One paper a published question appeared in, for the question page's "Appeared in" list. */
export interface QuestionAppearance extends OccurrenceFacts {
  examSlug: string;
  examName: string;
  questionSetSlug: string;
  questionSetTitle: string;
  year: number | null;
  sessionLabel: string | null;
  originalQuestionNumber: number | null;
}

/**
 * Resolves a question page's URL, `/questions/{slug}`, to its published question. The slug is the
 * public key: unique (questions_slug_unique) and never changed after publishing, so the URL doesn't
 * depend on the exam hierarchy — it used to be /questions/{exam}/{variant}/{year}/{subject}/{slug},
 * which no question in a session without a year could resolve. See docs/specs/01-question-urls.md.
 */
export async function findPublishedQuestionBySlug(
  db: ReturnType<typeof getDb>,
  slug: string,
): Promise<{
  id: string;
  topicName: string | null;
  questionType: string;
  appearances: QuestionAppearance[];
} | null> {
  const found = await db.execute(sql`
    SELECT q.id AS "id", t.name AS "topicName", q.question_type AS "questionType"
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id
    WHERE q.slug = ${slug} AND q.status = 'published'
    LIMIT 1
  `);
  const question = found.rows[0] as unknown as
    | { id: string; topicName: string | null; questionType: string }
    | undefined;
  if (!question) return null;

  const appearances = await db.execute(sql`
    SELECT
      e.slug AS "examSlug",
      e.name AS "examName",
      qs.slug AS "questionSetSlug",
      qs.title AS "questionSetTitle",
      es.year AS "year",
      es.label AS "sessionLabel",
      o.original_question_number AS "originalQuestionNumber",
      ${OCCURRENCE_FACTS}
    FROM question_occurrences o
    JOIN question_sets qs ON qs.id = o.question_set_id
    JOIN exam_variants ev ON ev.id = qs.exam_variant_id
    JOIN exams e ON e.id = ev.exam_id
    LEFT JOIN exam_sessions es ON es.id = qs.exam_session_id
    WHERE o.question_id = ${question.id} AND qs.publication_status = 'published'
    ORDER BY es.year DESC NULLS LAST, o.created_at ASC
  `);
  return {
    ...question,
    appearances: appearances.rows as unknown as QuestionAppearance[],
  };
}
