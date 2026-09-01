import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Shared helpers ──────────────────────────────────────────────────────────

export const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ─── Enums ────────────────────────────────────────────────────────────────────

export const publishingStatusEnum = pgEnum("publishing_status", [
  "draft",
  "processing",
  "review",
  "published",
  "flagged",
  "archived",
  "rejected",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "mcq",
  "multiple_correct",
  "true_false",
  "fill_blank",
  "descriptive",
  "numerical",
  "assertion_reason",
  "match_following",
]);

export const difficultyEnum = pgEnum("difficulty", [
  "easy",
  "medium",
  "hard",
  "expert",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "official",
  "user_submitted",
  "editorial",
  "generated",
  "unknown",
]);

export const commentStatusEnum = pgEnum("comment_status", [
  "pending",
  "approved",
  "rejected",
  "spam",
]);

export const reportReasonEnum = pgEnum("report_reason", [
  "wrong_answer",
  "incorrect_question",
  "typo",
  "missing_option",
  "incorrect_explanation",
  "duplicate",
  "other",
]);

export const adminRoleEnum = pgEnum("admin_role", [
  "admin",
  "editor",
  "moderator",
]);

export const contributionStatusEnum = pgEnum("contribution_status", [
  "pending",
  "processing",
  "approved",
  "rejected",
  "needs_correction",
]);

export const redirectStatusEnum = pgEnum("redirect_status", ["301", "302"]);

export const aiSourceEnum = pgEnum("ai_source", ["verified", "ai_generated", "community"]);
