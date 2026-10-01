# ADR-013: Knowledge-index hierarchy: relational ends, typed tree in the middle

- **Status:** Accepted
- **Date:** 2026-10-01
- **Design:** [docs/architecture/knowledge-index.md](../architecture/knowledge-index.md)

## Context

Prepora covers certification, government, competitive and university exams, each with a different
natural hierarchy:
- **certification:** vendor → track → exam → version;
- **GATE:** paper → year → sitting;
- **JEE:** paper → year → session → shift;
- **university:** programme → regulation → branch → semester → course → session.

The owner's priorities are to browse each kind by its own hierarchy, and to search across all of
them.

Today's model is a fixed chain: organization → exam → variant → session → question set, with an
optional `courses` table. It fits single-version certifications. It can't express:
- GATE's sittings;
- JEE's shifts;
- university regulations, semesters and courses;
- one paper serving many posts (Kerala PSC) or many branches (common courses).

The question URL also assumes every session has a year.

## Options

1. **Optional relational levels with per-type flags.** Add regulation, sitting, shift and other
   columns or tables, and switch on exam type. KTU alone needs about seven levels. Every new kind
   of exam means a migration and type-specific branches in the routers and pipeline.
2. **One generic tree for everything, organization and exam included.** Maximally flexible, but it
   loses the foreign keys the pipeline publishes against, Drizzle's typed relations, and simple
   listing queries.
3. **Hybrid.** Organization, exam type, exam and question set (the paper) stay relational. The
   levels in between become a typed tree per exam, constrained by a hierarchy template for its
   kind.

## Decision

Option 3.
- **Templates:** `hierarchy_templates` and `hierarchy_levels` define each kind's levels, including
  whether each appears in URLs and whether it's a facet.
- **The tree:** `catalog_nodes` stores a materialized `path` and an `ancestorIds[]` array (not
  `ltree`, which Drizzle doesn't support). A trigger validates the tree's shape against the
  template.
- **Placements:** `question_set_placements` lets one paper sit in several places.
- **Shared courses:** `courses` becomes a shared catalogue of course codes.
- **Canonical question URLs** (`/questions/{publicId}/{slug}`) don't depend on the hierarchy.

## Consequences

- **New kinds of exam** need a template, not a migration.
- **Facets, breadcrumbs and "everything under this node"** are single, index-backed queries.
- **Migration from today:**
  - existing exams get a `cert-simple` template with one hidden `version` level;
  - variant `standard` collapses into the exam;
  - each session becomes a node.

  `exam_variants` and `exam_sessions` are written to alongside the new tables until nothing reads
  them (step S8).
- **Changing a template after data exists** means re-parenting nodes. That's mitigated by template
  versioning, the trigger, automatic redirects and canonical question URLs.
- **Per-level `attributes` (jsonb)** need validation per level, and promotion to columns or facets
  once they become filters.
