import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { id, publishingStatusEnum, timestamps } from "./shared.ts";

// ─── Organizations ──────────────────────────────────────────────────────────
// The body behind an exam (conducts/administers/publishes it) — see
// docs/architecture/exam-domain-model.md §11. No separate "role" table: the
// organizationId reference on `exams` itself is the role.

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    officialUrl: text("official_url"),
    logoUrl: text("logo_url"),
    jurisdiction: text("jurisdiction"), // nullable; e.g. "global", "IN", "IN-KL"
    ...timestamps,
  },
  (t) => [index("organizations_slug_idx").on(t.slug)],
);

// ─── Exam Types ─────────────────────────────────────────────────────────────
// A lookup table, not a Postgres enum — adding a category is one INSERT, not a
// migration. See docs/architecture/exam-domain-model.md §12.

export const examTypes = pgTable("exam_types", {
  id: id(),
  slug: text("slug").notNull().unique(), // certification | competitive | government | ...
  label: text("label").notNull(),
  description: text("description"),
  hasProgramHierarchy: boolean("has_program_hierarchy").notNull().default(false),
  ...timestamps,
});

// ─── Exams ────────────────────────────────────────────────────────────────────

export const exams = pgTable(
  "exams",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    examTypeId: text("exam_type_id")
      .notNull()
      .references(() => examTypes.id),
    officialUrl: text("official_url"),
    logoUrl: text("logo_url"),
    // Nullable, comma-separated substrings matched against scraped_questions.source_url to
    // attribute scraped content to this exam without a code change — see
    // packages/api/src/routers/exams.router.ts and docs/roadmap/engineering-roadmap.md item 10's
    // "Done when" (the rewritten read path must serve scraped content identically to the deleted
    // resolveExamMeta()'s hardcoded matching). A new scraped-content exam is one INSERT with this
    // pattern set, not a code change.
    urlMatchPattern: text("url_match_pattern"),
    status: publishingStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [index("exams_slug_idx").on(t.slug)],
);

export const examVariants = pgTable(
  "exam_variants",
  {
    id: id(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    syllabus: text("syllabus"),
    // Long-tail, rarely-queried, display-only attributes (certification level, retirement date,
    // eligibility rules, ...) validated at the application layer, keyed by the exam's examTypeId —
    // see docs/architecture/exam-domain-model.md §7.
    metadata: jsonb("metadata"),
    status: publishingStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    unique("exam_variants_exam_id_slug_unique").on(t.examId, t.slug),
    index("exam_variants_exam_id_idx").on(t.examId),
  ],
);

// ─── Exam Sessions ──────────────────────────────────────────────────────────
// A specific sitting/version of a variant. Every variant gets at least one row, uniformly, even a
// degenerate single-version one — see docs/architecture/exam-domain-model.md §12.

export const examSessions = pgTable(
  "exam_sessions",
  {
    id: id(),
    examVariantId: text("exam_variant_id")
      .notNull()
      .references(() => examVariants.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "2025", "Semester 6, 2025-26", "Version 1"
    year: integer("year"), // nullable — null for exam types with no calendar year (e.g. a
    // certification's single, un-dated version)
    sessionCode: text("session_code"), // nullable — non-yearly versioning (cert revisions)
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: publishingStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [index("exam_sessions_exam_variant_id_idx").on(t.examVariantId)],
);

// ─── Subjects ─────────────────────────────────────────────────────────────────

export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("subjects_slug_idx").on(t.slug)],
);

// ─── Courses ────────────────────────────────────────────────────────────────
// A thin enrichment join between an examVariant (the program/branch) and a subject (the universal
// knowledge domain), for university/school exam types only. Deliberately has no name/slug of its
// own — identity and display name stay owned by the joined `subjects` row. See
// docs/architecture/exam-domain-model.md §5/§7.

export const courses = pgTable(
  "courses",
  {
    id: id(),
    examVariantId: text("exam_variant_id")
      .notNull()
      .references(() => examVariants.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id),
    code: text("code"), // e.g. "IT302" — nullable, university/school specific
    semester: integer("semester"), // curriculum-design fact: which semester normally teaches this
    credits: integer("credits"),
    ...timestamps,
  },
  (t) => [
    unique("courses_variant_subject_unique").on(t.examVariantId, t.subjectId),
    index("courses_exam_variant_id_idx").on(t.examVariantId),
  ],
);

// ─── Topics (hierarchical) ────────────────────────────────────────────────────

export const topics = pgTable(
  "topics",
  {
    id: id(),
    parentId: text("parent_id"),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    unique("topics_subject_id_slug_unique").on(t.subjectId, t.slug),
    index("topics_parent_id_idx").on(t.parentId),
    index("topics_subject_id_idx").on(t.subjectId),
  ],
);

// ─── Question Sets ────────────────────────────────────────────────────────────

export const questionSets = pgTable(
  "question_sets",
  {
    id: id(),
    examVariantId: text("exam_variant_id")
      .notNull()
      .references(() => examVariants.id),
    examSessionId: text("exam_session_id")
      .notNull()
      .references(() => examSessions.id),
    subjectId: text("subject_id").references(() => subjects.id),
    shiftLabel: text("shift_label"), // nullable — GATE-style multi-shift disambiguation
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sourceType: text("source_type"),
    sourceDocument: text("source_document"),
    sourceUrl: text("source_url"),
    publicationStatus: publishingStatusEnum("publication_status").notNull().default("draft"),
    publishedAt: text("published_at"),
    ...timestamps,
  },
  (t) => [
    index("question_sets_slug_idx").on(t.slug),
    index("question_sets_exam_variant_id_idx").on(t.examVariantId),
    index("question_sets_exam_session_id_idx").on(t.examSessionId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  exams: many(exams),
}));

export const examTypesRelations = relations(examTypes, ({ many }) => ({
  exams: many(exams),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [exams.organizationId],
    references: [organizations.id],
  }),
  examType: one(examTypes, { fields: [exams.examTypeId], references: [examTypes.id] }),
  variants: many(examVariants),
}));

export const examVariantsRelations = relations(examVariants, ({ one, many }) => ({
  exam: one(exams, { fields: [examVariants.examId], references: [exams.id] }),
  sessions: many(examSessions),
  courses: many(courses),
  questionSets: many(questionSets),
}));

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  examVariant: one(examVariants, {
    fields: [examSessions.examVariantId],
    references: [examVariants.id],
  }),
  questionSets: many(questionSets),
}));

export const coursesRelations = relations(courses, ({ one }) => ({
  examVariant: one(examVariants, {
    fields: [courses.examVariantId],
    references: [examVariants.id],
  }),
  subject: one(subjects, { fields: [courses.subjectId], references: [subjects.id] }),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  topics: many(topics),
  courses: many(courses),
  questionSets: many(questionSets),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  parent: one(topics, {
    fields: [topics.parentId],
    references: [topics.id],
    relationName: "parentChild",
  }),
  children: many(topics, { relationName: "parentChild" }),
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
}));

export const questionSetsRelations = relations(questionSets, ({ one }) => ({
  examVariant: one(examVariants, {
    fields: [questionSets.examVariantId],
    references: [examVariants.id],
  }),
  examSession: one(examSessions, {
    fields: [questionSets.examSessionId],
    references: [examSessions.id],
  }),
  subject: one(subjects, { fields: [questionSets.subjectId], references: [subjects.id] }),
}));
