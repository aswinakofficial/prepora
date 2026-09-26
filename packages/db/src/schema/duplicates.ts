import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { questions } from "./questions.ts";
import { scrapedQuestions } from "./scraping.ts";
import { id } from "./shared.ts";
import { users } from "./users.ts";

// Possible duplicates held for a human decision (apps/pipeline/prepora_pipeline/stages/dedupe.py).
// When a question being published is very similar — but not identical — to one already published,
// it is never merged or published automatically: approving its batch publishes everything else and
// records the question here, with a suggestion, until an admin decides:
//   same       → link it to the existing question (and remember the wording, see questionVariants)
//   different  → publish it as a new question
//   skipped    → don't publish it
// A batch is complete (approved) once none of its decisions are still pending.
export const duplicateReviews = pgTable(
  "duplicate_reviews",
  {
    id: id(),
    scrapedQuestionId: text("scraped_question_id")
      .notNull()
      .references(() => scrapedQuestions.id, { onDelete: "cascade" }),
    // The question's number within its batch (1-based), for display and for idempotency: holding
    // the same question again on a retry updates the existing row instead of adding another.
    questionNumber: integer("question_number").notNull(),
    // The NormalizedQuestion exactly as it would be published, so a decision can publish it later
    // without re-reading the batch.
    candidate: jsonb("candidate").notNull(),
    existingQuestionId: text("existing_question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    similarity: real("similarity").notNull(),
    optionsMatch: boolean("options_match").notNull(),
    answerMatch: boolean("answer_match").notNull(),
    suggestion: text("suggestion").notNull(), // "same" | "different"
    status: text("status").notNull().default("pending"), // "pending" | "same" | "different" | "skipped"
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("duplicate_reviews_batch_question_unique").on(t.scrapedQuestionId, t.questionNumber),
    index("duplicate_reviews_status_idx").on(t.status),
  ],
);

// Other wordings of a published question, recorded when an admin decides a possible duplicate is
// the same question. The exact-match step of deduplication checks these too, so a known rewording
// links to its question automatically the next time it's collected — the decision is made once.
export const questionVariants = pgTable(
  "question_variants",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("question_variants_question_hash_unique").on(t.questionId, t.contentHash),
    index("question_variants_content_hash_idx").on(t.contentHash),
  ],
);
