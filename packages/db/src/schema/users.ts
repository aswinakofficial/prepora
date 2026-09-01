import {
  pgTable,
  text,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  id,
  timestamps,
  adminRoleEnum,
  contributionStatusEnum,
  commentStatusEnum,
  reportReasonEnum,
} from "./shared.ts";
import { questions } from "./questions.ts";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: adminRoleEnum("role"),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  ...timestamps,
});

export const accounts = pgTable("accounts", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  ...timestamps,
});

export const verifications = pgTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expires_at").notNull(),
  ...timestamps,
});

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("bookmarks_user_id_idx").on(t.userId)],
);

// ─── Attempts ─────────────────────────────────────────────────────────────────

export const attempts = pgTable(
  "attempts",
  {
    id: id(),
    userId: text("user_id").references(() => users.id),
    sessionId: text("session_id"), // anonymous session
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    selectedOptionId: text("selected_option_id"),
    textAnswer: text("text_answer"),
    isCorrect: boolean("is_correct"),
    practiceSessionId: text("practice_session_id"),
    ...timestamps,
  },
  (t) => [
    index("attempts_user_id_idx").on(t.userId),
    index("attempts_session_id_idx").on(t.sessionId),
    index("attempts_question_id_idx").on(t.questionId),
    index("attempts_practice_session_id_idx").on(t.practiceSessionId),
  ],
);

// ─── Practice Sessions ────────────────────────────────────────────────────────

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: id(),
    userId: text("user_id").references(() => users.id),
    sessionId: text("session_id"), // anonymous
    mode: text("mode").notNull(), // 'practice' | 'mock'
    questionSetId: text("question_set_id"),
    totalQuestions: integer("total_questions").notNull(),
    correct: integer("correct").notNull().default(0),
    incorrect: integer("incorrect").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    timeTakenSeconds: integer("time_taken_seconds"),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (t) => [index("practice_sessions_user_id_idx").on(t.userId)],
);

// ─── Community: Contributions ─────────────────────────────────────────────────

export const contributions = pgTable(
  "contributions",
  {
    id: id(),
    examSlug: text("exam_slug"),
    examVariantSlug: text("exam_variant_slug"),
    year: integer("year"),
    subjectSlug: text("subject_slug"),
    title: text("title"),
    markdownContent: text("markdown_content"),
    pdfStorageKey: text("pdf_storage_key"),
    contributorName: text("contributor_name"),
    contributorEmail: text("contributor_email"),
    status: contributionStatusEnum("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("contributions_status_idx").on(t.status)],
);

// ─── Community: Comments ──────────────────────────────────────────────────────

export const comments = pgTable(
  "comments",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    authorName: text("author_name"),
    content: text("content").notNull(),
    status: commentStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    index("comments_question_id_idx").on(t.questionId),
    index("comments_status_idx").on(t.status),
  ],
);

// ─── Community: Reports ───────────────────────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("pending"), // pending | resolved | dismissed
    resolvedBy: text("resolved_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("reports_question_id_idx").on(t.questionId),
    index("reports_status_idx").on(t.status),
  ],
);

// ─── Community: Feedbacks ─────────────────────────────────────────────────────

export const feedbacks = pgTable(
  "feedbacks",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    helpful: boolean("helpful").notNull(),
    sessionId: text("session_id"),
    ...timestamps,
  },
  (t) => [index("feedbacks_question_id_idx").on(t.questionId)],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  bookmarks: many(bookmarks),
  attempts: many(attempts),
  practiceSessions: many(practiceSessions),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  question: one(questions, { fields: [bookmarks.questionId], references: [questions.id] }),
}));
