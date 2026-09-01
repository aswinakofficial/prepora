import {
  pgTable,
  text,
  integer,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  id,
  timestamps,
  publishingStatusEnum,
  questionTypeEnum,
  difficultyEnum,
  sourceTypeEnum,
  aiSourceEnum,
} from "./shared.ts";
import { questionSets } from "./catalog.ts";
import { topics, subjects } from "./catalog.ts";

// ─── Questions (canonical) ────────────────────────────────────────────────────

export const questions = pgTable(
  "questions",
  {
    id: id(),
    stableContentId: text("stable_content_id").unique(), // e.g. KPSC-AE-2025-CIVIL-Q001
    slug: text("slug").notNull(),
    questionText: text("question_text").notNull(),
    questionType: questionTypeEnum("question_type").notNull().default("mcq"),
    explanation: text("explanation"),
    sourceLabel: aiSourceEnum("source_label").notNull().default("verified"),
    difficulty: difficultyEnum("difficulty"),
    difficultySource: text("difficulty_source"), // 'official' | 'editorial' | 'community'
    topicId: text("topic_id").references(() => topics.id),
    status: publishingStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("questions_slug_idx").on(t.slug),
    index("questions_stable_id_idx").on(t.stableContentId),
    index("questions_topic_id_idx").on(t.topicId),
    index("questions_status_idx").on(t.status),
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
    numericalAnswer: text("numerical_answer"),
    isCorrect: boolean("is_correct").notNull().default(true), // for multiple_correct
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
  questionId: text("question_id").references(() => questions.id),
  questionSetId: text("question_set_id").references(() => questionSets.id),
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
  correctOption: one(questionOptions, { fields: [questionAnswers.correctOptionId], references: [questionOptions.id] }),
}));

export const questionOccurrencesRelations = relations(questionOccurrences, ({ one }) => ({
  question: one(questions, { fields: [questionOccurrences.questionId], references: [questions.id] }),
  questionSet: one(questionSets, { fields: [questionOccurrences.questionSetId], references: [questionSets.id] }),
}));
