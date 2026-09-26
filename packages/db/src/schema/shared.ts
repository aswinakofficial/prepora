import { sql } from "drizzle-orm";
import { customType, pgEnum, text, timestamp } from "drizzle-orm/pg-core";

// ─── Shared helpers ──────────────────────────────────────────────────────────

export const id = () => text("id").primaryKey().default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// docs/roadmap/engineering-roadmap.md item 23 — Postgres full-text search (ADR-006). Drizzle has
// no built-in tsvector column type; this is the minimal custom type needed to declare one.
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

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

export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard", "expert"]);

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

export const adminRoleEnum = pgEnum("admin_role", ["admin", "editor", "moderator"]);

export const contributionStatusEnum = pgEnum("contribution_status", [
  "pending",
  "processing",
  "approved",
  "rejected",
  "needs_correction",
]);

export const redirectStatusEnum = pgEnum("redirect_status", ["301", "302"]);

export const aiSourceEnum = pgEnum("ai_source", ["verified", "ai_generated", "community"]);

// Shared by pipeline_jobs and pipeline_job_stages — see docs/roadmap/engineering-roadmap.md item
// 13. A stage's status uses the same vocabulary as its job's for consistency, even though a stage
// itself is never literally "cancelled" today (jobs are).
export const pipelineJobStatusEnum = pgEnum("pipeline_job_status", [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

// See docs/roadmap/engineering-roadmap.md item 14 — whether a source's robots.txt/terms have been
// reviewed for scraping, tracked explicitly rather than assumed.
export const robotsReviewStatusEnum = pgEnum("robots_review_status", [
  "not_reviewed",
  "reviewed_allowed",
  "reviewed_disallowed",
]);

// See docs/roadmap/engineering-roadmap.md item 17 — a resource that disappeared from a source's
// discovery pass is flagged for human review, never silently deleted or unpublished.
export const removedResourceStatusEnum = pgEnum("removed_resource_status", [
  "flagged",
  "confirmed_removed",
  "restored",
]);
