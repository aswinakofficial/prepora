import { pgTable, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { id, timestamps, publishingStatusEnum } from "./shared.ts";

// ─── Exams ────────────────────────────────────────────────────────────────────

export const exams = pgTable(
  "exams",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    organization: text("organization"),
    category: text("category"),
    officialUrl: text("official_url"),
    logoUrl: text("logo_url"),
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
    status: publishingStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("exam_variants_slug_idx").on(t.slug),
    index("exam_variants_exam_id_idx").on(t.examId),
  ],
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
    slug: text("slug").notNull().unique(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    index("topics_slug_idx").on(t.slug),
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
    subjectId: text("subject_id").references(() => subjects.id),
    year: integer("year"),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sourceType: text("source_type"),
    sourceDocument: text("source_document"),
    sourceUrl: text("source_url"),
    publicationStatus: publishingStatusEnum("publication_status")
      .notNull()
      .default("draft"),
    publishedAt: text("published_at"),
    ...timestamps,
  },
  (t) => [
    index("question_sets_slug_idx").on(t.slug),
    index("question_sets_exam_variant_id_idx").on(t.examVariantId),
    index("question_sets_year_idx").on(t.year),
    index("question_sets_exam_year_idx").on(t.examVariantId, t.year),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const examsRelations = relations(exams, ({ many }) => ({
  variants: many(examVariants),
}));

export const examVariantsRelations = relations(examVariants, ({ one, many }) => ({
  exam: one(exams, { fields: [examVariants.examId], references: [exams.id] }),
  questionSets: many(questionSets),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  topics: many(topics),
  questionSets: many(questionSets),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  parent: one(topics, { fields: [topics.parentId], references: [topics.id], relationName: "parentChild" }),
  children: many(topics, { relationName: "parentChild" }),
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
}));

export const questionSetsRelations = relations(questionSets, ({ one, many }) => ({
  examVariant: one(examVariants, { fields: [questionSets.examVariantId], references: [examVariants.id] }),
  subject: one(subjects, { fields: [questionSets.subjectId], references: [subjects.id] }),
}));
