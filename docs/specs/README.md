# Implementation specs

The [knowledge-index design](../architecture/knowledge-index.md) says *what* Prepora is building.
These specs say exactly *how* to build each next step: which files change, the schema and
migrations, the API and routes, tests, acceptance criteria, and the decisions that need the owner.
They're written so any contributor — or any AI model — can implement a step without re-deciding
its design.

Every spec is linked from its GitHub issue. Follow the working agreements in
[CLAUDE.md](../../CLAUDE.md#working-agreements) (issue workflow, checks, production safety).

## Order

Work top to bottom. A step starts only when the steps it depends on are merged.

| # | Spec | Issues | Depends on | Status |
|---|---|---|---|---|
| 1 | [S0 · Question URLs that work](01-question-urls.md) | #19, #34, #26 | — | **Done** (#53, migrated) |
| 2 | [P · Shared PDF stages](02-pdf-stages.md) | #29, #30 | — | **Done** |
| 3 | [S4-min · Marks, sections, answer status, numeric answers](03-paper-structure-min.md) | #45 | 1 | **Done** (#56, migrated) |
| 4 | [M · Image storage on R2](04-media-storage.md) | #46 | — | Code done — **needs the owner** (Cloudflare setup, then the live check) |
| 5 | [GATE CS pilot](05-gate-pilot.md) | #27, #47, #48, #49 | 2, 3, 4 | Ready |
| 7 | [Intake: quality as data](07-intake.md) | #69 | 5 | **Done** (PR pending, migration pending) |
| 8 | [Paper editions: several sources for one paper](08-paper-editions.md) | #70 | 7 | Draft |
| 9 | [Fixing held questions](09-remediation.md) | #71 | 7, 8 (4 for crops) | Draft |
| 10 | [Explanations: data model and display](10-explanations.md) | #72 | 7 | Draft |
| 11 | [AI explanations: source first, AI otherwise](11-ai-explanations.md) | #73 | 10 | Draft |
| 6 | [S1 · Exam hierarchies](06-hierarchy.md) | #35 | 5 | Draft — **after the quality pipeline** |

### Why this order (and not the one in the knowledge-index doc)

The project has one maintainer for now, so the plan was narrowed (2026-10-02):

- **S0 first, and it's urgent.** Every published question today sits in a session with no year,
  and the question page URL requires a year — so *no* question has a working page or a sitemap
  entry. Spec 1 fixes that.
- **One source end to end before breadth.** GATE CS is the first new track: official papers and
  keys, English, text PDFs, and it exercises the PDF stages every later PDF source reuses.
- **S1 (hierarchies) moves after the GATE pilot.** GATE fits the current model (exam → variant →
  session → question set with `shift_label`). Designing S1 against two real exam types (MS Learn +
  GATE) is better than against one, and GATE reaches users sooner.
- **Deferred to a later milestone:** full multi-source attestations (S3 — a single answer
  `provenance` column covers one-source-per-exam), languages (S5), universities (S6), faceted search
  (S7), OCR (O), and the optional AI step. They return when a track needs them.
- **The quality pipeline (Specs 7–11) comes next (owner, 2026-10-03).** One paper exists in
  several sources at different quality (GATE: clean IITG PDFs, the Drive archive's scans and
  embedded keys). So held questions are kept and fixed rather than lost, the cleanest source wins
  per question, and explanations come from the source first, AI otherwise. See
  [knowledge-index §4a](../architecture/knowledge-index.md). Explanations build on clean
  questions, so they come last. S1 waits until after this.
- **Media storage is new.** No published question has an image yet, but GATE's figures will be the
  first, and the deployed site can't serve images from the local disk.

## Writing a new spec

Copy the shape of an existing one: **Context → Scope (in/out) → Decisions → Changes (per file) →
Migration → Tests → Acceptance → Owner checkpoints → Risks**. Keep decisions explicit — a spec that
leaves a design choice open isn't ready.
