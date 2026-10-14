import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { questions } from "./questions.ts";
import { scrapedQuestions } from "./scraping.ts";
import { id, timestamps } from "./shared.ts";
import { sources } from "./sources.ts";

// docs/specs/07-intake.md — quality as data (knowledge-index §4a). Every question a connector
// parses is stored here first, `ready` or `held` with machine-readable issue codes, before
// anything reaches the review queue. A held question waits for a fix (Spec 9); it's never dropped.
// Later specs add `superseded` (Spec 8) and `fixing` (Spec 9) with ALTER TYPE … ADD VALUE.
export const intakeStatusEnum = pgEnum("intake_status", [
  "ready",
  "held",
  "in_review",
  "published",
  "rejected",
]);

export const intakeItems = pgTable(
  "intake_items",
  {
    id: id(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    // A stable, source-independent name for the paper: "gate/2026/cs/CS-1".
    paperKey: text("paper_key").notNull(),
    // Which copy of the paper this came from: "iitg", "drive" (Spec 8).
    edition: text("edition").notNull(),
    number: integer("number").notNull(),
    numberLabel: text("number_label"),
    rawArtifactSha256: text("raw_artifact_sha256"),
    // The NormalizedQuestion the connector built (apps/pipeline's contract), as JSON.
    candidate: jsonb("candidate").notNull(),
    // SHA-256 of the candidate's content, without provenance or version stamps: a re-parse that
    // changes nothing keeps the item's status (apps/pipeline/prepora_pipeline/core/intake.py).
    contentHash: text("content_hash").notNull(),
    // [{ code, detail }] — codes in apps/pipeline/prepora_pipeline/core/quality.py.
    issues: jsonb("issues").notNull().default([]),
    regions: jsonb("regions"), // where to crop it, for Spec 9
    parserVersion: text("parser_version").notNull(),
    status: intakeStatusEnum("status").notNull(),
    reviewBatchId: text("review_batch_id").references(() => scrapedQuestions.id, {
      onDelete: "set null",
    }),
    questionId: text("question_id").references(() => questions.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("intake_items_question_unique").on(t.sourceId, t.paperKey, t.edition, t.number),
    index("intake_items_status_idx").on(t.status),
    index("intake_items_paper_key_idx").on(t.paperKey),
    index("intake_items_review_batch_idx").on(t.reviewBatchId),
  ],
);

export const intakeItemsRelations = relations(intakeItems, ({ one }) => ({
  source: one(sources, { fields: [intakeItems.sourceId], references: [sources.id] }),
  reviewBatch: one(scrapedQuestions, {
    fields: [intakeItems.reviewBatchId],
    references: [scrapedQuestions.id],
  }),
  question: one(questions, { fields: [intakeItems.questionId], references: [questions.id] }),
}));
