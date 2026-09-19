# Prepora — Multi-Exam-Type Domain Model

> **Status:** Design proposal, not yet implemented · **Date:** 2026-09-19 · **Scope:** the exam
> catalog (`exams`, `examVariants`, `subjects`, `topics`, `questionSets`) and how it should evolve to
> support certification, competitive, government, university, school, and future exam categories
> without a schema redesign each time one is added.
>
> This document does not modify any code or run any migration. It is the design that
> `docs/roadmap/engineering-roadmap.md` item 10 implements. Every claim about the current schema is
> cited as `path:line` and was re-verified against source while writing this document.

---

## Table of contents

1. [Current schema analysis](#1-current-schema-analysis)
2. [Current limitations](#2-current-limitations)
3. [Domain requirements](#3-domain-requirements)
4. [Common exam concepts](#4-common-exam-concepts)
5. [Type-specific concepts](#5-type-specific-concepts)
6. [Alternative schema strategies](#6-alternative-schema-strategies)
7. [Recommended architecture](#7-recommended-architecture)
8. [Entity relationship diagram](#8-entity-relationship-diagram)
9. [Example records for different exam types](#9-example-records-for-different-exam-types)
10. [Question / question-set relationship](#10-question--question-set-relationship)
11. [Organization model](#11-organization-model)
12. [Exam / session / version model](#12-exam--session--version-model)
13. [Content schema implications](#13-content-schema-implications)
14. [Scraper implications](#14-scraper-implications)
15. [SEO implications](#15-seo-implications)
16. [RAG implications](#16-rag-implications)
17. [Migration strategy](#17-migration-strategy)
18. [Future extensibility considerations](#18-future-extensibility-considerations)

---

## 1. Current schema analysis

The catalog lives in `packages/db/src/schema/catalog.ts` (137 lines, four tables) plus
`packages/db/src/schema/questions.ts` (the question side, out of scope for redesign — see §10).

**`exams`** (`catalog.ts:7-22`): `id, name, slug (unique), description, organization, category,
officialUrl, logoUrl, status, ...timestamps`. `organization` and `category` are **plain `text`
columns** — free strings, not foreign keys, not even a checked enum. There is exactly one exam
hierarchy level above "variant": an `exams` row is the only concept above `examVariants`.

**`examVariants`** (`catalog.ts:24-42`): `id, examId (FK), name, slug, description, syllabus,
status, ...timestamps`. No temporal or session concept exists here at all — a variant is a flat,
timeless "kind of test within an exam family." **`slug` is only indexed
(`index("exam_variants_slug_idx")`, `catalog.ts:39`), not actually unique** — nothing in the database
today stops two variants of the same exam, or of different exams, from sharing a slug.

**`subjects`** (`catalog.ts:46-56`): `id, name, slug (globally unique), description, ...timestamps`.
Deliberately flat and exam-agnostic already — a strength, not a gap (§4).

**`topics`** (`catalog.ts:60-78`): self-referential via `parentId`, scoped to one `subjectId`, slug
**globally unique**. Also already exam-agnostic, though the global-uniqueness choice has a real edge
case — see §2.

**`questionSets`** (`catalog.ts:82-109`): `id, examVariantId (FK), subjectId (FK, nullable), year
(plain int, nullable), title, slug, description, sourceType, sourceDocument, sourceUrl,
publicationStatus, publishedAt, ...timestamps`. This is the **only** place a temporal value exists
in the entire catalog — `year` is a bare integer with no relation to any "session" or "sitting"
entity, no start/end dates, no non-yearly versioning, and no way to record a shift/sitting-within-day
(GATE runs multiple shifts per day).

**How the exam domain is modeled today, answering the brief's own framing:**

| Question | Current answer |
|---|---|
| What is currently an `Exam`? | One row per named test family (e.g. "AB-100", "GATE") — but see §2, this conflates "exam" and "organization" for bodies that run many exams |
| How are organizations represented? | A free-text string on `exams.organization` (`catalog.ts:14`) — not queryable, not deduplicated, not a real entity |
| How are exam variants represented? | `examVariants`, a flat child of `exams` — no session/version distinction, and no real uniqueness constraint on its slug |
| How are years represented? | A nullable `int` on `questionSets` (`catalog.ts:90`) — no session entity, no start/end dates, no non-year versioning, no shift |
| How are subjects/topics represented? | `subjects`/`topics`, globally unique, already exam-agnostic — the one part of the catalog already built correctly for this brief |
| How are question sets associated with exams? | Via `examVariantId` (required) and `subjectId` (optional) on `questionSets` |
| Which fields are generic? | `name`, `slug`, `description`, `status`, `officialUrl`, `logoUrl` — genuinely reusable across any exam type |
| Which fields are implicitly designed around one exam type? | `organization`/`category` as bare strings assume nobody will ever need to query or dedupe by them; the total absence of a course/curriculum concept assumes no exam type has an academic hierarchy above "subject" |

**Downstream code that already assumes this shape:** `packages/content/src/schema.ts:5-18`
(frontmatter: `exam`, `exam_variant`, `year`, `subject` — matches the DB shape exactly, including its
gaps); `packages/api/src/routers/exams.router.ts` (read path, see §2 for its most important finding);
`apps/web/app/routes/exams/index.tsx` (its own independent `CATEGORIES` list, see §2);
`apps/web/app/routes/admin/scraping.tsx:43-122` (`TARGET_WEBSITES`, one hardcoded `defaultExam`/
`defaultSubject` string pair per site — the scraper has no organization/type concept whatsoever).

## 2. Current limitations

Four concrete, cited defects — not hypothetical risks — that already prove the current schema
cannot support "many exam categories without redesigning the database every time":

**Limitation 1 — exam-type-specific knowledge is hardcoded in application code, not modeled in
data.** `packages/api/src/routers/exams.router.ts:8-63` defines `resolveExamMeta()` and
`getExamDescription()`: `if (slug.includes("az-900")) return { title: "AZ-900: Microsoft Azure
Fundamentals", ..., logoUrl: "https://learn.microsoft.com/.../microsoft-certified-fundamentals-badge.svg" }`,
repeated for five separate Microsoft certification codes (AB-100, AB-731, AB-730, AZ-900, AI-102),
each with its title, badge URL, and marketing description written directly in TypeScript and matched
by *substring search on the URL or slug* — entirely bypassing `exams`/`examVariants`. **Adding a
sixth Microsoft certification today requires editing this source file, not inserting a database
row.** This is the single clearest proof that the current architecture fails the brief's central
test (§22 of the brief): a new exam, even within an *already-supported* organization, needs a code
change.

**Limitation 2 — the exam-type taxonomy already exists, three times, and disagrees with itself.**
`exams.category` is free text (`catalog.ts:15`) with no canonical value list. Line 71 of
`exams.router.ts` defaults an absent category to `"CERTIFICATION"` — evidence the concept is patched
together at read time, not modeled. Independently, `apps/web/app/routes/exams/index.tsx:24-31`
defines its own `CATEGORIES = [ALL, CERTIFICATION, GOVERNMENT, COMPETITIVE, UNIVERSITY]` — a second,
hand-maintained copy of the same taxonomy, in the frontend, with no relationship to the database
value. Two independent lists of "the exam types Prepora supports" that can silently drift apart is
exactly the failure mode this domain-model exercise exists to close.

**Limitation 3 — the schema cannot express "one organization conducts many exams."** Today's
frontmatter convention (`agents/content/schema.md:35-39`) sets `exam: kerala-psc,
exam_variant: assistant-engineer` for Kerala PSC content. That means the *organization* — Kerala
Public Service Commission — is currently modeled as if it **were** the exam, with "Assistant
Engineer" demoted to a mere variant of it. But Kerala PSC conducts many distinct, unrelated exams
(Assistant Engineer, dozens of other posts) — there is no way today to express "one organization, N
exams" because organization was never a first-class entity with its own identity independent of any
single exam. The same collapse would happen for any government body, university, or company that
runs more than one kind of exam.

**Limitation 4 — no real uniqueness on `examVariants.slug` or scoping on `topics.slug`.** Two
separate, smaller integrity gaps worth fixing in the same migration as the larger redesign, since
both are touched by it anyway: `examVariants.slug` has only a non-unique index (`catalog.ts:39`), so
nothing stops a duplicate variant slug today. `topics.slug` is *globally* unique (`catalog.ts:69`),
which is stricter than it needs to be — a generic topic name ("Introduction", "Basics") in one
subject can never be reused in an unrelated subject, forcing artificially prefixed slugs. Neither is
a multi-exam-type problem specifically, but both are cheap to fix while other constraints on these
same tables are already changing (§17).

**Secondary limitations**, real but lower-severity: no program/curriculum hierarchy for university or
school exams (§5); no jurisdiction field anywhere in the catalog; the scraper
(`apps/scraper/handlers/*.py`, `admin/scraping.tsx:43-122`) treats `exam`/`subject` as arbitrary
per-request strings with zero structure to validate or normalize against.

## 3. Domain requirements

Derived from the brief and from what Prepora's actual product surfaces need (exam listing pages,
question pages, search, admin content review, future RAG):

- Represent an **organization** independently of any exam it runs, so one organization can have many
  exams, and one exam is never confused with the body that conducts it.
- Represent an **exam type/category** as data, extensible by inserting a row, never by migrating a
  schema or editing an enum definition.
- Distinguish an **exam's definition** (its name, syllabus, structure) from **a specific occurrence**
  of it (this year's sitting, this certification's current version) — brief §8's exam-vs-occurrence
  distinction is real and currently entirely absent. Model this occurrence concept **uniformly**
  across every exam type (§12), not as a feature only some types opt into, so no branching logic is
  needed anywhere that reads it.
- Keep `subjects`/`topics` **universal** — the same "Computer Networks" row must be reachable from a
  GATE paper, a Microsoft exam, and a CUSAT course without duplication or a parallel taxonomy.
- Support a **course/curriculum enrichment layer** for the exam types that genuinely have one
  (university, school) without forcing that structure onto types that don't (certification,
  competitive), and without inventing a parallel hierarchy that duplicates what `exams`/`examVariants`
  already express.
- Keep the parts of the model that queries actually need — organization, type, subject, session —
  **relationally queryable** ("all GATE papers from 2024," "all Azure certifications"), while
  allowing genuinely long-tail, rarely-queried, display-only attributes (a certification's retirement
  date, a government exam's age-limit rule) to live somewhere that doesn't force a table per exam
  type.
- Preserve everything the pipeline roadmap already depends on: `questions`/`questionOptions`/
  `questionAnswers`/`questionOccurrences` (the canonical/occurrence split), which is already
  exam-type-agnostic and correct.

## 4. Common exam concepts

Concepts that apply to essentially every examination system, independent of category:

```
Organization  — the body behind the exam (owns, conducts, administers, or publishes it)
Exam Type     — what kind of examination this is (drives which type-specific concepts apply)
Exam          — the named test family (e.g. "GATE", "AB-100", "Assistant Engineer", "CUSAT B.Tech")
Exam Variant  — a specific branch/stream/discipline/program within that family (e.g. "CSE", "Civil",
                "Information Technology")
Exam Session  — a specific sitting/edition of a variant (a year, a certification version, a
                semester-in-academic-year) — modeled uniformly, present for every exam type
Subject/Topic — the universal knowledge-domain taxonomy, reused across every exam and type
Question Set  — a specific paper/collection of questions, tied to a variant and its session
```

This is close to the brief's own sketch in §2, arrived at independently from the actual gaps found
in §2 above, not assumed a priori — every layer here maps directly to a limitation this document
found, not to the brief's suggested shape for its own sake. Notably, **a university "program" (CUSAT
B.Tech Information Technology) is not a new concept** — it is an `exam` + `examVariant` pair, exactly
the same two-level shape "GATE" + "CSE" already uses (§5, §9).

## 5. Type-specific concepts

Attributes that only make sense for some exam categories, identified per category (not assumed
exhaustive — new ones are expected, which is exactly what the recommended model in §7 accommodates
without a migration):

| Category | Type-specific attributes |
|---|---|
| Certification | certification code, certification level, retirement/expiry date, prerequisite certifications, recertification cycle |
| Competitive | conducting institute (rotates — e.g. GATE's organizing IIT changes yearly), shift (multiple sittings per day), normalization formula, negative marking scheme |
| Government/public-service | conducting authority (usually = organization, but can differ for outsourced exams), recruitment cycle, eligibility criteria, age limit, number of attempts allowed, reservation categories |
| University/school | degree/program, semester, course code, credits, department, academic year |

The **common** attributes that apply everywhere — name, slug, description, organization, exam type,
official URL, logo, status, and (optionally) jurisdiction — are exactly the ones already present as
plain columns on `exams` today (`catalog.ts:7-22`), confirming those columns were the right generic
core to begin with; only `organization` and `category` need to change shape, not the rest of the
table.

**The university/school case gets one genuinely new entity, `courses` (§7), not a parallel
program hierarchy**: it is a thin enrichment join between an `examVariant` (the program/branch) and
a `subject` (the universal knowledge domain), carrying only the facts that are meaningless outside
that context — course code, curriculum semester number, credit weight. The subject's identity and
display name stay owned by `subjects`, with no duplication.

## 6. Alternative schema strategies

| Strategy | Description | Verdict for Prepora |
|---|---|---|
| **A — one wide table** | Every exam type's fields live as columns on `exams`, mostly `NULL` for any given row | **Rejected.** A `retirement_date` column that is always `NULL` for every government exam, and an `age_limit` column always `NULL` for every certification, is the textbook anti-pattern the brief warns against in its own §5. Grows without bound as categories are added; no type-safety gain over the alternatives. |
| **B — base + subtype tables** | `Exam` plus `CertificationExam`, `GovernmentExam`, `UniversityExam`, ... | **Rejected.** Every new exam type needs a new table and a migration before it can even store type-specific data — this fails the brief's own "5 years from now" test (§22) outright, which is the one test this whole exercise is judged against. Also awkward for an exam that doesn't cleanly fit one category. |
| **C — base + flexible JSONB metadata for everything** | `Exam` plus one unstructured `metadata` JSON column, no structured type-specific columns at all | **Rejected as the *sole* mechanism.** No FK integrity for genuinely relational concepts (an organization is a real entity that should be joinable and deduplicated, not a JSON key); the queries Prepora actually runs — "all GATE papers from 2024," "all Azure certifications," both used on real listing pages — become JSON-path lookups instead of indexed joins; Postgres enforces no shape on the JSON, so validation is entirely the application's responsibility with zero database backstop. |
| **D — hybrid: common relational fields + specific relational entities only where a real structural distinction exists + one narrow validated JSONB column for genuinely long-tail attributes** | Recommended, detailed in §7 | Organization and exam type are real, common, frequently-queried concepts → real tables. Session and course-enrichment are real structural concerns for *some* types → small tables, populated only where relevant, uniform in shape so no code branches on "does this type have one." Certification level, age limits, and similar rarely-queried, display-only, genuinely idiosyncratic attributes → one narrow `metadata` JSONB column, application-validated per exam type. The only strategy that passes the "5 years from now" test *and* keeps the queries Prepora already runs fast and type-safe. |

## 7. Recommended architecture

**Decisive recommendation: Strategy D.** New tables, in `packages/db/src/schema/catalog.ts`
conventions (the existing `id()` helper — text primary key, `gen_random_uuid()` default — and the
`...timestamps` spread from `shared.ts`, matching every other table in this schema):

```ts
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  officialUrl: text("official_url"),
  logoUrl: text("logo_url"),
  jurisdiction: text("jurisdiction"),        // nullable; e.g. "global", "IN", "IN-KL" — an
                                              // ISO-3166-1/2-style convention, documented, not
                                              // enforced by a lookup table (too low-value for the
                                              // handful of distinct values this will ever hold)
  ...timestamps,
});

export const examTypes = pgTable("exam_types", {
  id: id(),
  slug: text("slug").notNull().unique(),    // "certification" | "competitive" | "government" |
                                             // "university" | "school" | "professional" | "other"
  label: text("label").notNull(),
  description: text("description"),
  hasProgramHierarchy: boolean("has_program_hierarchy").notNull().default(false),
  ...timestamps,
});
// A lookup table, not a Postgres enum — see §12 for why. Note there is deliberately no
// "hasSessions" flag: every exam type gets exam_sessions rows uniformly (§12), so there is nothing
// to flag. hasProgramHierarchy is the only per-type behavior switch this design needs.

export const examSessions = pgTable("exam_sessions", {
  id: id(),
  examVariantId: text("exam_variant_id").notNull().references(() => examVariants.id, { onDelete: "cascade" }),
  label: text("label").notNull(),           // human label: "2025", "Semester 6, 2025-26", "Version 1"
  year: integer("year"),                    // nullable — populated whenever a calendar year
                                             // genuinely applies; null for e.g. a certification's
                                             // single, un-dated version
  sessionCode: text("session_code"),        // nullable — non-yearly versioning (cert revisions)
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: publishingStatusEnum("status").notNull().default("draft"),
  ...timestamps,
}, (t) => [index("exam_sessions_exam_variant_id_idx").on(t.examVariantId)]);

export const courses = pgTable("courses", {
  id: id(),
  examVariantId: text("exam_variant_id").notNull().references(() => examVariants.id, { onDelete: "cascade" }),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  code: text("code"),                       // e.g. "IT302" — nullable, university/school specific
  semester: integer("semester"),            // curriculum-design fact: which semester normally
                                             // teaches/examines this subject — independent of which
                                             // year's sitting a question_set belongs to
  credits: integer("credits"),
  ...timestamps,
}, (t) => [unique("courses_variant_subject_unique").on(t.examVariantId, t.subjectId)]);
// Populated only when exam_types.hasProgramHierarchy = true for the owning exam. Deliberately has
// no name/slug of its own — display name and identity stay owned by the joined `subjects` row, so
// there is exactly one place "Database Management Systems" is spelled, never two that can drift.
```

Changes to existing tables:

```ts
// exams — replace two free-text columns with real relationships; everything else unchanged
organization: text("organization")            →  organizationId: text("organization_id")
                                                     .notNull().references(() => organizations.id)
category: text("category")                    →  examTypeId: text("exam_type_id")
                                                     .notNull().references(() => examTypes.id)

// examVariants — one integrity fix, already overdue (Limitation 4), plus one additive nullable column
slug: text("slug").notNull()                  →  slug: text("slug").notNull()   // unchanged type,
                                                     // but the index becomes unique(examId, slug)
+ metadata: jsonb("metadata")                     // the one escape hatch — see below

// questionSets — two additive columns; examVariantId is untouched, `year` is retired in favor of
// the session it now always references (see §12 for why this is safe and not a special case)
- year: integer("year")
+ examSessionId: text("exam_session_id").notNull().references(() => examSessions.id)
+ shiftLabel: text("shift_label")             // nullable — GATE-style multi-shift disambiguation

// topics — tighten scoping (Limitation 4): globally-unique slug becomes unique(subjectId, slug)
```

**The `metadata` JSONB column, precisely scoped:** lives on `examVariants` (the "what specific test"
level — certification level, retirement date, eligibility rules are properties of a specific
variant, not the umbrella exam or the organization). Validated at the application layer by a
discriminated Zod schema keyed on the exam's `examTypeId`/slug (e.g. a `certificationMetadataSchema`,
`governmentMetadataSchema`, ...), **not** enforced by Postgres — an explicit, accepted trade-off:
these fields are rarely queried and purely informational for display, so the cost of no DB-level
constraint is low, while the alternative (Strategy B's subtype-table-per-type) would fail the
extensibility test this whole document is judged against.

**Unchanged, confirmed by inspection:** `questions`, `questionOptions`, `questionAnswers`,
`questionOccurrences` (`packages/db/src/schema/questions.ts`) — already exam-type-agnostic, no
redesign needed (§10). `subjects` — including its existing global slug uniqueness — the right call,
not a gap; see §15's "Computer Networks" reasoning.

## 8. Entity relationship diagram

See `docs/architecture/diagrams/exam-domain.mmd` for the full Mermaid `erDiagram`. Summary of
cardinalities: an `organization` has many `exams`; an `examType` classifies many `exams`; an `exam`
has many `examVariants`; an `examVariant` has many `examSessions` (always — every variant gets at
least one, even a degenerate single-version one) and many `questionSets`; an `examVariant` also has
many `courses` (only when its exam's type `hasProgramHierarchy`); a `course` joins one `examVariant`
to one `subject`; an `examSession` has many `questionSets`; a `subject` has many `topics`, many
`courses`, and many `questionSets`; a `topic` classifies many `questions`; a `questionSet` has many
`questionOccurrences`; a `question` has many `questionOccurrences`, `questionOptions`, and
`questionAnswers`.

## 9. Example records for different exam types

All four of the brief's worked examples, mapped without any special case:

**Certification — Microsoft AB-100**
```
organizations:    { name: "Microsoft", slug: "microsoft", jurisdiction: "global" }
exam_types:       { slug: "certification", hasProgramHierarchy: false }
exams:            { name: "Microsoft Certified: AB-100 Agentic AI Business Solutions Architect",
                    slug: "ab-100-agentic-ai", organizationId: microsoft, examTypeId: certification }
exam_variants:    { name: "Standard", slug: "standard", examId: ab-100 }
exam_sessions:    { examVariantId: standard, label: "Version 1", year: null }
                  -- a degenerate single-edition session, not a special case: every variant gets one
subjects:         { name: "Agentic AI Architecture", slug: "agentic-ai-architecture" }
question_sets:    { examVariantId: standard, examSessionId: v1, subjectId: agentic-ai-architecture,
                    shiftLabel: null, title: "AB-100 Practice Set 1" }
```

**Competitive — GATE CSE 2025**
```
organizations:    { name: "GATE", slug: "gate", jurisdiction: "IN" }
exam_types:       { slug: "competitive", hasProgramHierarchy: false }
exams:            { name: "GATE", slug: "gate", organizationId: gate, examTypeId: competitive }
exam_variants:    { name: "Computer Science and Engineering", slug: "cse", examId: gate }
exam_sessions:    { examVariantId: cse, label: "2025", year: 2025 }
subjects:         { name: "Computer Networks", slug: "computer-networks" }
question_sets:    { examVariantId: cse, examSessionId: cse-2025, subjectId: computer-networks,
                    shiftLabel: "Forenoon Shift 1", title: "GATE CSE 2025" }
```

**Government — Kerala PSC AE Civil 2025**
```
organizations:    { name: "Kerala Public Service Commission", slug: "kerala-psc", jurisdiction: "IN-KL" }
exam_types:       { slug: "government", hasProgramHierarchy: false }
exams:            { name: "Assistant Engineer", slug: "assistant-engineer",
                    organizationId: kerala-psc, examTypeId: government }
exam_variants:    { name: "Civil Engineering", slug: "civil", examId: assistant-engineer }
exam_sessions:    { examVariantId: civil, label: "2025", year: 2025 }
subjects:         { name: "Civil Engineering", slug: "civil-engineering" }
question_sets:    { examVariantId: civil, examSessionId: civil-2025, subjectId: civil-engineering,
                    shiftLabel: null, title: "Kerala PSC AE 2025 Civil Engineering" }
```
Kerala PSC is now the **organization**, correctly separated from "Assistant Engineer" (the exam) —
directly resolving Limitation 3 in §2. A second Kerala PSC exam (any other post) is one new `exams`
row under the same `organizationId`, not a redesign.

**University — CUSAT B.Tech IT Sem 6 DBMS 2025**
```
organizations:    { name: "Cochin University of Science and Technology", slug: "cusat",
                    jurisdiction: "IN-KL" }
exam_types:       { slug: "university", hasProgramHierarchy: true }
exams:            { name: "CUSAT B.Tech", slug: "cusat-btech", organizationId: cusat,
                    examTypeId: university }
exam_variants:    { name: "Information Technology", slug: "it", examId: cusat-btech }
                  -- same two-level exam→variant shape as GATE; "B.Tech Information Technology" is
                  -- not a new kind of entity, just an exam family and a branch within it
courses:          { examVariantId: it, subjectId: dbms, code: "IT302", semester: 6, credits: 4 }
exam_sessions:    { examVariantId: it, label: "Semester 6, 2025-26", year: 2025 }
subjects:         { name: "Database Management Systems", slug: "database-management-systems" }
question_sets:    { examVariantId: it, examSessionId: sem6-2025-26, subjectId: dbms,
                    shiftLabel: null, title: "CUSAT B.Tech IT Semester 6 DBMS 2025" }
```
`subjectId` here is the **same universal `subjects` row** any other exam type would use for
Database Management Systems — no parallel "courses-as-subjects" table was needed. `courses.semester`
(a static curriculum fact — DBMS is normally examined in semester 6) is deliberately independent of
`exam_sessions.label` (which specific year's semester-6 sitting a question set belongs to) — the two
answer different questions and would conflate two distinct facts if merged into one field.

## 10. Question / question-set relationship

Out of scope for redesign, and confirmed correct by inspection: `questions` (canonical, keyed by
`stableContentId`) → `questionOccurrences` (an appearance of a question in one `questionSet`, with
its original question number and page reference) → `questionSets` (`packages/db/src/schema/questions.ts:24-108`).
This already correctly separates "a question" from "its appearances," is exam-type-agnostic, and is
exactly the structure the brief's §9 asks for — it exists today, independent of everything else in
this document, and needs no change here (its actual *population* — currently broken, per the
separately-tracked roadmap item 18, "Idempotent, occurrence-aware publishing" — is unrelated to
domain modeling and not this document's concern).

**`QuestionSet` terminology, resolved:** a `questionSet` represents one concrete paper/collection —
"GATE CSE 2025," "CUSAT Sem 6 DBMS 2025" — the brief's §10 second option (`Exam → Question Set →
Question`), not the four-level `Exam → Session → Paper → Question` alternative it also offers. The
reason: `examSessions` (§12) already carries the "occurrence" concept; inserting a further "Question
Paper" layer between session and question set would duplicate it. A `questionSet` is scoped by
*both* `examVariantId` and `examSessionId` (both always present, per §12) — it is the concrete
artifact a human authored or a scraper produced, not an abstract occurrence. No new column is needed
on `questionOccurrences` itself: `question_occurrences → question_sets → exam_sessions →
exam_variants` is already a complete FK chain, and a session/variant reference directly on
`questionOccurrences` would be pure denormalization with no new query it enables.

## 11. Organization model

`organizations` is genuinely first-class now, per §7. No separate "role" table
(`conducts`/`administers`/`publishes`/`owns-certification`) is introduced: the relationship itself
*is* the role — an organization that both conducts exams and offers academic programs simply has
rows in `exams.organizationId` referencing it in each case; forcing every organization to declare a
fixed set of roles up front would be exactly the kind of premature taxonomy that has already caused
problems (§2, Limitation 2). Building a separate `organizationRoles` join table would model a
distinction with zero observed cases requiring more than one organization per exam — reject it under
YAGNI now; a nullable second organization FK on `exams` later (for genuinely co-administered exams)
would be additive and non-breaking if that need ever materializes.

This also avoids assuming `certification → company`, `government → government body`,
`university → university` — the same `organizations` table holds Microsoft, Kerala PSC, GATE, and
CUSAT with no discriminator column needed; `examTypeId` lives on the *exam*, not the organization,
since one organization could conceivably run exams of more than one type.

## 12. Exam / session / version model

**Why a lookup table, not a Postgres enum, for `examTypes`:** an enum requires `ALTER TYPE ... ADD
VALUE` — a schema migration — to add a category; a lookup table takes one `INSERT`. Since the brief's
central success criterion (§22) is "how much of the database would need to change" when a new type
appears, an enum fails that test by construction, even though it looks type-safe on paper. The
lookup table also carries `hasProgramHierarchy`, letting application code decide whether to show/join
`courses` by reading data, rather than hardcoding a switch statement per category (directly closing
Limitation 1 from §2, without moving the same hardcoding problem into a different file).

**Exam vs. exam occurrence, resolved uniformly — no per-type branching:** `exams` is the stable
definition (name, syllabus, organization, type). `examVariants` is "which specific test within that
family" (a discipline, a certification code, a degree program's branch). `examSessions` is "which
specific sitting/version of that variant," and — this is the key simplification over an earlier draft
of this design — **every exam variant gets at least one session row, always**, including exam types
that don't naturally recur yearly. A certification with a single, never-revised version still gets
one `examSessions` row (`label: "Version 1", year: null`); GATE CSE gets one row per year
(`year: 2024`, `year: 2025`, ...); CUSAT gets one row per academic year's semester sitting. Making
`questionSets.examSessionId` **`NOT NULL`** and dropping the old bare `year` column entirely means no
code anywhere needs an `if (examType.hasSessions)` branch — the session is simply sometimes
degenerate (a single row, `year` null), never absent. This directly honors the brief's own warning in
§8 that "year, session, version, attempt, and exam variant are not necessarily the same concept" —
by giving every type the *same* entity rather than forcing a false uniformity onto the *values*
within it.

## 13. Content schema implications

`packages/content/src/schema.ts:5-18` and `agents/content/schema.md:29-45` need a small number of
additive, optional frontmatter fields — nothing existing breaks:

```yaml
organization: kerala-psc     # NEW, optional — organization slug; resolved/validated against the
                              # organizations table at publish time
exam: assistant-engineer     # UNCHANGED in shape, but now names the exam itself, not the organization
exam_variant: civil          # unchanged
year: 2025                   # unchanged — still resolves into the exam_session for this content
session_label:                # NEW, optional — for sessions where `year` alone is ambiguous or
                              # absent (a certification version, a university semester string)
shift:                       # NEW, optional — GATE-style shift disambiguation
course: dbms                 # NEW, optional — university/school only; resolves a `courses` row
                              # by (exam_variant, subject)
subject: civil-engineering   # unchanged
```
`exam_type` is deliberately **not** added as a frontmatter field: it is a property of the `exams` row
(looked up once an exam is registered), not something a content author should be able to set
per-file — this prevents the same three-copies-of-the-taxonomy problem (§2, Limitation 2) from
recurring in content files. The already-planned Markdown connector (roadmap item 22) needs to
resolve `organization`/`exam`/`exam_variant`/`course` slugs against the new tables at
normalize time, exactly the kind of slug-resolution work it already has to do for `exam`/`subject`
today — an extension of existing planned work, not new work.

## 14. Scraper implications

The scraper (`apps/scraper/handlers/*.py`) already passes `exam`/`subject` as free-text strings per
request (e.g. `target_exam: "Kerala PSC AE Civil"`), with no organization or type concept — and that
does not need to change at the extraction layer. The already-planned normalize pipeline stage
(roadmap item 11, "Pipeline contracts and version stamping") is where free-text scraper output gets
resolved against real catalog rows; this document's model gives that stage two more things to
resolve (`organization`, and `course` where relevant) using the same slug-matching approach it
already needs for `exam`/`subject`. No scraper connector needs a different database model per
source — the whole point of normalizing at one pipeline stage, which this document's model does not
disturb.

## 15. SEO implications

Slugs continue to live on `organizations`, `exams`, `examVariants`, `subjects`, `topics`, and
`questionSets` exactly as they do today — the database was already slug-first, and nothing here
changes that. URL structure (`/exams/microsoft/azure-fundamentals`, `/exams/gate/cse/2025`,
`/exams/cusat/btech-it`) is a **read-path/routing concern**, composed from these slugs at request
time, not something the schema needs to encode directly — the route layer already does exactly this
composition today (`apps/web/app/routes/exams/`), and gains one more slug segment
(`organization.slug`) to work with.

**Slug uniqueness scoping, revisited (Limitation 4):** `organizations.slug` and `exams.slug` stay
globally unique — each is a genuinely distinct product/brand, few enough in number that global
uniqueness is natural. `examVariants.slug` gains an actual `unique(examId, slug)` constraint (fixing
the pre-existing gap), letting different exams reuse variant slugs like `"cse"` without conflict.
**`subjects.slug` stays globally unique, confirmed correct** — this is precisely what lets
`/topics/computer-networks` be one canonical, indexable page reachable from GATE, Microsoft, and
CUSAT content alike, rather than three duplicate pages — a genuine SEO strength of the existing
design that this document preserves rather than "fixes." **`topics.slug` changes from globally
unique to `unique(subjectId, slug)`** — the one real defect in the current scoping: a generic topic
name ("Introduction") in one subject should not permanently block the same name in an unrelated
subject; scoping to `(subjectId, slug)` fixes this while keeping topics shared across every exam that
uses that subject (scoped to subject, not to exam).

## 16. RAG implications

The brief's example queries become directly answerable with real joins under this model, not
JSON-path traversal: *"Show me GATE CSE questions about operating systems"* → join
`organizations.slug = 'gate'` → `exams` → `examVariants.slug = 'cse'` → `questionSets` →
`questionOccurrences` → `questions` filtered by `topics.slug = 'operating-systems'`. *"Find Microsoft
certification questions about Azure networking"* → `organizations.slug = 'microsoft'` +
`exams.examTypeId → exam_types.slug = 'certification'` → same chain. *"What questions appeared in
CUSAT B.Tech IT DBMS exams"* → `organizations.slug = 'cusat'` → `exams` → `examVariants.slug = 'it'`
→ `courses.subjectId = dbms` → `questionSets`. Every field the brief's §18 asks to be preserved for
future retrieval — organization, type, subject, topic, session, provenance — is now a real, indexed,
joinable column, which is what makes citation-with-context possible later without another schema
change.

## 17. Migration strategy

Database content is confirmed scratch/empty for practical purposes (per the project's own stated
decision) — this is a build-forward migration, not a data-preserving one. Numbered sequence:

1. Create `organizations`, `exam_types`, `exam_sessions`, `courses` (new tables, additive).
2. Seed `exam_types` with the initial rows: `certification`, `competitive`, `government`,
   `university`, `school`, `professional`, `other` — each with `hasProgramHierarchy` set per §5's
   analysis (`true` only for `university`/`school`).
3. Alter `exams`: add `organization_id` (FK) and `exam_type_id` (FK); drop `organization` and
   `category` text columns once both are populated (the DB holds only scratch data, so this can be
   `NOT NULL` from the start rather than staged nullable-then-backfilled).
4. Alter `exam_variants`: change the existing non-unique index on `slug` to a real
   `unique(exam_id, slug)` constraint (Limitation 4); add `metadata` (nullable `jsonb`).
5. Alter `question_sets`: add `exam_session_id` (`NOT NULL` FK) and `shift_label` (nullable text);
   drop the old bare `year` column, since every question set now reaches its year via
   `exam_session_id → exam_sessions.year`.
6. Alter `topics`: change the global unique constraint on `slug` to `unique(subject_id, slug)`
   (Limitation 4).
7. No change to `questions`, `question_options`, `question_answers`, `question_occurrences`,
   `subjects` — confirmed unchanged throughout this document.
8. Update `packages/content/src/schema.ts` and `agents/content/schema.md` per §13.
9. Remove `resolveExamMeta()` and `getExamDescription()` from
   `packages/api/src/routers/exams.router.ts` — once `organizations`/`exam_types`/real `description`/
   `logoUrl` columns are populated, the exams API becomes a straight `SELECT` with joins, and this
   ~65-line hardcoded lookup (§2, Limitation 1) has no remaining reason to exist. Write a one-time
   seed inserting real rows for the five currently-hardcoded Microsoft certs so removing the
   functions doesn't regress existing content.
10. Source `apps/web/app/routes/exams/index.tsx`'s `CATEGORIES` list from `exam_types` (via a new
    lightweight oRPC procedure or a build-time generated constant) instead of its own hardcoded array
    — closing §2's Limitation 2.
11. Update `apps/web/app/routes/admin/scraping.tsx`'s `TARGET_WEBSITES` entries to reference
    `organization`/`examType` explicitly rather than embedding raw display strings — a smaller
    follow-up, not blocking, since the scraper's free-text extraction is unaffected (§14).

**Affected application code**, summarized: `packages/db/src/schema/catalog.ts` (schema changes and
new Drizzle relations for the four new tables), `packages/api/src/routers/exams.router.ts` (delete
two hardcoded functions, rewrite the read query), `apps/web/app/routes/exams/index.tsx` (source
categories from data), `apps/web/app/routes/admin/scraping.tsx` (reference real entities instead of
raw strings), `packages/content/src/schema.ts` and `agents/content/schema.md` (new optional
frontmatter fields), plus the `drizzle-zod` insert/select schemas for every changed and new table.

## 18. Future extensibility considerations

**The "5 years from now" test, answered directly:** introducing an entirely new examination
category — a professional licensing exam, a school-board exam, anything not enumerated today —
requires exactly:

- **One row** in `exam_types` (its slug, label, and the `hasProgramHierarchy` flag) — no migration.
- **Zero to one row** in `organizations`, only if the conducting body is genuinely new.
- **Zero new tables or columns**, because `courses` and `exam_sessions` already exist and are
  populated conditionally on the new type's flag — a school-board exam with a program hierarchy just
  sets `hasProgramHierarchy = true` and reuses `courses` exactly as CUSAT does today; one without a
  hierarchy (a licensing exam) leaves it `false` and never touches that table.
- **Optional, non-blocking** work: admin UI copy/icons for the new type, and — only if the type has
  attributes genuinely unlike anything seen before — a new discriminated-union branch in the
  application-level `metadata` Zod schema (§7), which is a narrow, additive code change, not a
  database migration.

**Honest limit, stated rather than hidden:** the one case that *does* need a migration is a new
attribute that must become a first-class, indexed, filterable column across many rows (e.g., a
licensing exam's "CPD hours required" becoming something students filter search results by) — that
starts life in the narrow `metadata` JSONB (zero migration) and is only promoted to a real column
later if usage proves it needs to be one. That is a small, additive `ADD COLUMN`, not a redesign.

This is the concrete, non-hedged answer the brief's §22 asks for: **a new exam type is data plus, at
most, a narrow validation-schema addition — never a database redesign.**
