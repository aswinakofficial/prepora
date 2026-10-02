import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { questionSets, topics } from "./catalog.ts";
import {
  aiSourceEnum,
  answerProvenanceEnum,
  answerStatusEnum,
  difficultyEnum,
  id,
  publishingStatusEnum,
  questionTypeEnum,
  timestamps,
  tsvector,
} from "./shared.ts";

// ─── Questions (canonical) ────────────────────────────────────────────────────

export const questions = pgTable(
  "questions",
  {
    id: id(),
    stableContentId: text("stable_content_id").unique(), // e.g. KPSC-AE-2025-CIVIL-Q001 — a
    // per-*appearance* id (it embeds year), so it alone cannot tell "the same question in a
    // different year's paper" from a genuinely new question — see contentHash below.
    slug: text("slug").notNull(),
    questionText: text("question_text").notNull(),
    // Exact-duplicate content hash — the same normalize+djb2 algorithm as
    // packages/content/src/duplicates.ts's contentHash(), ported to Python in
    // apps/pipeline/prepora_pipeline/stages/publish.py. This is what lets the same question
    // republished under a different stable_content_id (a different exam year) reuse the existing
    // canonical row instead of creating a duplicate — an exact-match-only precursor to the fuzzy
    // near-duplicate detection docs/roadmap/engineering-roadmap.md item 20 adds on top.
    contentHash: text("content_hash"),
    questionType: questionTypeEnum("question_type").notNull().default("mcq"),
    explanation: text("explanation"),
    sourceLabel: aiSourceEnum("source_label").notNull().default("verified"),
    difficulty: difficultyEnum("difficulty"),
    difficultySource: text("difficulty_source"), // 'official' | 'editorial' | 'community'
    topicId: text("topic_id").references(() => topics.id),
    status: publishingStatusEnum("status").notNull().default("draft"),
    // docs/roadmap/engineering-roadmap.md item 23 — generated, not maintained by application code:
    // Postgres recomputes it on every insert/update of question_text or explanation, so it can
    // never silently drift out of sync the way a manually-updated column could. Question text is
    // weighted 'A' (highest), explanation 'B' — a match in the question itself should always rank
    // above a match that only appears in its explanation.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(question_text, '')), 'A') || setweight(to_tsvector('english', coalesce(explanation, '')), 'B')`,
    ),
    ...timestamps,
  },
  (t) => [
    // The public key of a question page, /questions/{slug} (docs/specs/01-question-urls.md).
    // Publishing sets it once, to the lowercased stable_content_id, and never changes it.
    uniqueIndex("questions_slug_unique").on(t.slug),
    index("questions_stable_id_idx").on(t.stableContentId),
    index("questions_content_hash_idx").on(t.contentHash),
    index("questions_topic_id_idx").on(t.topicId),
    index("questions_status_idx").on(t.status),
    index("questions_search_vector_idx").using("gin", t.searchVector),
    // Candidate search for duplicate detection (apps/pipeline/prepora_pipeline/dedupe/
    // candidates.py): pg_trgm's % operator over the whole corpus. The extension itself is
    // created by migration 0016.
    index("questions_question_text_trgm_idx").using("gin", t.questionText.op("gin_trgm_ops")),
  ],
);

// ─── Question Options (MCQ choices) ──────────────────────────────────────────

export const questionOptions = pgTable(
  "question_options",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    optionKey: text("option_key").notNull(), // A, B, C, D
    optionText: text("option_text").notNull(),
    sequence: integer("sequence").notNull(),
  },
  (t) => [
    index("question_options_question_id_idx").on(t.questionId),
    unique("question_options_key_unique").on(t.questionId, t.optionKey),
  ],
);

// ─── Question Answers ─────────────────────────────────────────────────────────

export const questionAnswers = pgTable(
  "question_answers",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    correctOptionId: text("correct_option_id").references(() => questionOptions.id),
    // For non-MCQ types:
    textAnswer: text("text_answer"),
    numericalAnswer: text("numerical_answer"), // for display, e.g. "4.24 to 4.26"
    // A numerical answer accepted as a range, inclusive: one row per range, so "-0.61 to -0.57 OR
    // 0.57 to 0.61" is two rows, range_group 0 and 1 (docs/specs/03-paper-structure-min.md).
    numericMin: numeric("numeric_min", { mode: "number" }),
    numericMax: numeric("numeric_max", { mode: "number" }),
    rangeGroup: integer("range_group"),
    isCorrect: boolean("is_correct").notNull().default(true), // for multiple_correct
    // Who says this is the answer. No default: every writer states it.
    provenance: answerProvenanceEnum("provenance").notNull(),
    ...timestamps,
  },
  (t) => [index("question_answers_question_id_idx").on(t.questionId)],
);

// ─── Question Occurrences ─────────────────────────────────────────────────────

export const questionOccurrences = pgTable(
  "question_occurrences",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionSetId: text("question_set_id")
      .notNull()
      .references(() => questionSets.id, { onDelete: "cascade" }),
    originalQuestionNumber: integer("original_question_number"),
    pageNumber: integer("page_number"),
    sourceReference: text("source_reference"),
    // Facts about the question in this one paper (docs/specs/03-paper-structure-min.md).
    sectionLabel: text("section_label"), // "General Aptitude"
    numberLabel: text("number_label"), // the number as printed, e.g. "Q.31"
    marks: numeric("marks", { precision: 5, scale: 2, mode: "number" }),
    negativeMarks: numeric("negative_marks", { precision: 5, scale: 2, mode: "number" }),
    // Not "scored" when the official key gave marks to everyone, or dropped or cancelled it.
    answerStatus: answerStatusEnum("answer_status").notNull().default("scored"),
    ...timestamps,
  },
  (t) => [
    index("question_occurrences_question_id_idx").on(t.questionId),
    index("question_occurrences_question_set_id_idx").on(t.questionSetId),
    unique("question_occurrences_unique").on(t.questionId, t.questionSetId),
  ],
);

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const questionTags = pgTable(
  "question_tags",
  {
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [unique("question_tags_unique").on(t.questionId, t.tagId)],
);

// ─── Media ────────────────────────────────────────────────────────────────────

export const media = pgTable("media", {
  id: id(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes"),
  altText: text("alt_text"),
  // Cascades like question_options/question_answers do — an image belongs to its question, and
  // without this any question with an image could never be deleted.
  questionId: text("question_id").references(() => questions.id, { onDelete: "cascade" }),
  questionSetId: text("question_set_id").references(() => questionSets.id),
  // Where a question's image appears: "question" (the stem), "option" (with optionKey), or
  // "explanation"; position orders images within the same placement.
  placement: text("placement"),
  optionKey: text("option_key"),
  position: integer("position").notNull().default(0),
  uploadedBy: text("uploaded_by"),
  ...timestamps,
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const questionsRelations = relations(questions, ({ one, many }) => ({
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
  options: many(questionOptions),
  answers: many(questionAnswers),
  occurrences: many(questionOccurrences),
  tags: many(questionTags),
  media: many(media),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, { fields: [questionOptions.questionId], references: [questions.id] }),
}));

export const questionAnswersRelations = relations(questionAnswers, ({ one }) => ({
  question: one(questions, { fields: [questionAnswers.questionId], references: [questions.id] }),
  correctOption: one(questionOptions, {
    fields: [questionAnswers.correctOptionId],
    references: [questionOptions.id],
  }),
}));

export const questionOccurrencesRelations = relations(questionOccurrences, ({ one }) => ({
  question: one(questions, {
    fields: [questionOccurrences.questionId],
    references: [questions.id],
  }),
  questionSet: one(questionSets, {
    fields: [questionOccurrences.questionSetId],
    references: [questionSets.id],
  }),
}));

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const insertQuestionSchema = createInsertSchema(questions);
export const selectQuestionSchema = createSelectSchema(questions);
export const insertQuestionOptionSchema = createInsertSchema(questionOptions);
export const selectQuestionOptionSchema = createSelectSchema(questionOptions);
