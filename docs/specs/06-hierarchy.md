# Spec 6 · S1: Exam hierarchies (DRAFT — revisit after the GATE pilot)

**Issue:** #35 (epic #38)
**Milestone:** S1 · Exam hierarchies
**Depends on:** Spec 5 (the GATE pilot)
**Status:** **Draft.** Don't implement until this spec is re-reviewed against the data the GATE
pilot actually produces, and marked Ready in [the index](README.md).

## Why it waits

The [knowledge-index design](../architecture/knowledge-index.md) §2 and [ADR-013](../adr/013-knowledge-index-hierarchy.md)
chose the hybrid model: relational exam and question set, with a typed per-exam node tree in between.

The plan was to build it before any new source. Two things changed that:
- **GATE fits the current model.** Variant `cs`, session `2026`, `shift_label` `CS-1` (Spec 5).
- **One maintainer.** Designing the tree against two real exam types (MS Learn's flat
  `version` and GATE's `paper → year → sitting`) beats designing it against one.

So S1 follows the pilot. Its migration back-fills both exam types from their existing variants,
sessions and shifts.

## Settled decisions (from ADR-013, keep)

- **Tables:**
  - `hierarchy_templates`;
  - `hierarchy_levels`: depth, key, label, value kind, whether it's in URLs, whether it's a facet,
    and whether it's required;
  - `catalog_nodes`, with `path` (URL levels only) and `ancestor_ids text[]`, kept correct by a
    trigger;
  - `question_sets.node_id`.
- **Templates for the two existing exam types:**
  - `cert-simple`: `version`, hidden from URLs;
  - `gate-paper`: `paper` → `year` → `sitting`, where `sitting` is optional.
- **URLs:** `/exams/{exam}/{…path}` for nodes, and `/exams/{exam}/{…path}/{set}` for a paper.
  Question URLs stay `/questions/{slug}` (Spec 1).
- **No rewriting old data:** `exam_variants` and `exam_sessions` stay, and are written alongside
  the nodes until S8.

## Open questions to settle at re-review

1. **Placements:** are `question_set_placements` (M:N) and `exam_groups` needed now, or deferred
   until a shared paper or a vendor-hub page actually exists? Leaning towards defer.
2. **Trigger or application code** for path and depth validation? The trigger is safer. Write its
   SQL in this spec when it's Ready.
3. **Pipeline contract:** an explicit `hierarchy: [{level, slug, label, year?}]` on
   NormalizedQuestion, or derive nodes from variant, year and shift through the exam's template?
   Leaning towards deriving now, and adding the explicit field later with Kerala PSC.
4. **Exam page design:** a list of first-level nodes (GATE: papers; MS Learn: hidden, so sets
   directly), then year, sitting and sets.
5. **The back-fill:** exact SQL for creating nodes from existing sessions and shifts, per template.

When these are settled, fill in the standard sections (Changes, Migration, Tests, Acceptance,
Owner checkpoints, Risks) and mark the spec Ready.
