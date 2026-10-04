# Spec 7 · Intake: quality as data

**Issue:** #69
**Milestone:** Quality pipeline
**Depends on:** Spec 5 (the GATE connector)
**Production database:** yes. One migration adds a table and an enum. The admin page reads it, so
production is migrated before merging, with the owner's go-ahead.
**Status:** Implemented (migration `drizzle/0019_intake_items.sql`)

## Context

Design: [knowledge-index §4a](../architecture/knowledge-index.md), principles 2 and 3.

Today a connector's run ends in a review batch. A question it can't trust is "held back", but only
printed in the importer's report: the GATE pilot held back 117 of 260 questions, and nothing
remembers them. When a better parser, an OCR step or a cleaner source arrives, there's no list to
work from, and no way to see across sources what's waiting and why.

This spec makes every parsed question a stored **intake item**, either `ready` or `held` with
machine-readable issue codes, before anything reaches the review queue. Specs 8 (paper editions)
and 9 (fixing held questions) build on it.

## Deliverable and UI acceptance

When this is done, the owner can see every imported question in the admin, including the ones not
yet good enough to publish, and why they're held. Checked by `tests/e2e/intake.spec.ts`.

| # | Step | Expected |
|---|---|---|
| 1 | Open Admin → Held questions (in the menu under Review) | One row per imported paper, with counts for ready, in review, published, held and rejected, and the held count per reason |
| 2 | Click "Show held questions" on a paper | Each held question shows its number, the start of its text, and its reason ("Figure or image: something is drawn in the question") |
| 3 | Approve that paper's batch in Admin → Review, then reopen Held questions | Its questions moved from "In review" to "Published"; held ones stay held |
| 4 | Reject another paper's batch, then reopen Held questions | Its questions show as "Rejected"; held ones stay held |
| 5 | Re-run the import for an unchanged paper (`gate-import`) | It reports 0 new and every question unchanged, and writes no review batch (checked by the pipeline's tests) |

## Scope

**In scope:**
- the `intake_items` table;
- the issue-code vocabulary and a shared detector module;
- GATE writing intake;
- review batches built from ready items;
- intake status kept in step with approval and rejection;
- an admin "Held questions" page.

**Out of scope:**
- fixing held items (Spec 9);
- several editions of one paper (Spec 8: `edition` exists, but GATE uses one, `iitg`);
- moving the MS Learn scraper onto intake (a follow-up issue).

## Decisions

1. **One row per question per paper per edition.** The key is `(source_id, paper_key, edition,
   number)`.
   - `paper_key` is a stable, source-independent name for the paper: `gate/2026/cs/CS-1`.
   - `edition` names where this copy came from: `iitg` (the GATE site), `drive` (the Drive
     folder, from Spec 8).
2. **A re-parse upserts, it never duplicates.** `content_hash` is the SHA-256 of the candidate
   question's content (text, options, answer, marks, section, answer status), excluding
   provenance and version stamps. On conflict:
   - **Same hash:** keep a decided status (`published`, `rejected`), and refresh
     `parser_version`, `raw_artifact_sha256` and `issues`.
   - **Hash changed:** the status is recomputed (`ready` or `held`). An item that was `published`
     becomes `ready` again: an improved parse goes back through review, where the existing
     possible-duplicate flow offers "same question, use the new wording".
   - **An item that is `in_review` isn't touched at all,** because its batch holds that copy.
     Resetting it would leave a stale, still-approvable copy in the old batch. A changed parse
     waits, counted as `waiting`, and the first run after the batch is decided picks it up. (This
     was changed from the first draft during review.)
3. **Status:** `ready | held | in_review | published | rejected`.
   - `superseded` (Spec 8) and `fixing` (Spec 9) are added by those specs, with `ALTER TYPE … ADD
     VALUE`.
4. **Issues are codes plus detail:** `[{code, detail}]`.
   - The codes: `figure`, `math`, `layout` (the detector), `image_option`, `invalid` (a
     validation error; detail holds the message) and `type_mismatch` (key vs paper).
   - Any issue means `held`. The codes are listed in `core/quality.py`, and the admin page's labels
     come from the same list.
5. **The detector moves to core** as `core/quality.py`.
   - It's GATE's `_flags` from `connectors/gate/paper_parser.py`, generalised. `detect_issues(…,
     profile: QualityProfile)` takes the thresholds (script gap, wide gap, tall empty block,
     script size) from a profile.
   - `GATE_QUALITY` keeps today's tuned values, so GATE's results are unchanged: 143 ready and 117
     held on the pilot papers.
6. **Batches come from intake.** `gate-import` writes every item, then builds one review batch per
   paper from its `ready` items that aren't already in review, and marks them `in_review` with the
   batch id. That makes `pending_batch_for` unnecessary, so it's removed: a re-run with nothing new
   writes no batch.
7. **Approval and rejection keep intake in step.**
   - Each batch element carries `intakeItemId`.
   - When the admin approve flow publishes an element, the item becomes `published`, with its
     `question_id`.
   - Rejecting the batch makes its items `rejected`.
   - Batches without `intakeItemId` (MS Learn) behave exactly as today.

## Changes

### Database (`packages/db`)
- **New `src/schema/intake.ts`:**
  - an enum `intake_status` (`ready`, `held`, `in_review`, `published`, `rejected`);
  - the table `intake_items`: `id`, `sourceId` (→ `sources.id`, not null), `paperKey`,
    `edition`, `number`, `numberLabel`, `rawArtifactSha256`, `candidate` (jsonb, not null),
    `contentHash`, `issues` (jsonb, not null, default `[]`), `regions` (jsonb), `parserVersion`,
    `status`, `reviewBatchId` (→ `scraped_questions.id`, on delete set null), `questionId` (→
    `questions.id`, on delete set null), and timestamps.
  - Indexes: unique `(source_id, paper_key, edition, number)`, `(status)`, and `(paper_key)`.
- Export it from `src/schema/index.ts`.
- Migration `0019_intake_items.sql` comes from `pnpm db:generate`. No back-fill.

### Pipeline (`apps/pipeline/prepora_pipeline`)
- **New `core/quality.py`:**
  - `Issue(code, detail)`, `ISSUE_CODES`, `QualityProfile`, `GATE_QUALITY`;
  - `detect_issues(block, stem, options, regions, pages, profile) -> list[Issue]`, moved from
    `_flags`.
- **New `core/intake.py`:**
  - `IntakeItem` (a dataclass with the fields above);
  - `content_hash(normalized)`;
  - `record_intake(items) -> RecordResult`, which upserts per decision 2 and counts inserted,
    changed, unchanged and status moves;
  - `ready_for_batch(source, paper_key, edition) -> list[(id, candidate)]`;
  - `mark_in_review(ids, batch_id)`.
- **`connectors/gate/paper_parser.py`:**
  - calls `detect_issues(..., GATE_QUALITY)`;
  - `GateQuestion.issues: list[Issue]` replaces `flags`, and a `flags` property returns the sorted
    codes, so existing callers keep working.
- **`connectors/gate/run.py`, `import_paper`:**
  - builds an `IntakeItem` per joined question, held when it has issues or fails
    normalisation/validation (`type_mismatch`, `image_option`, `invalid`);
  - calls `record_intake`, then builds the batch from `ready_for_batch` and calls `mark_in_review`.
  - `ImportReport` gains `recorded` (a `RecordResult`) and still prints held items by number and
    code.
- **`core/review_batches.py`:**
  - each element carries `intakeItemId`;
  - `pending_batch_for` is removed.

### API (`packages/api`)
- **`src/routers/admin.router.ts`:**
  - In `processOneReviewItem`, after an element publishes, set its intake item to `published` with
    `question_id` (the pipeline's publish response has `question_id`).
  - In the reject procedure, set the batch's intake items to `rejected`.
  - Both changes are no-ops for elements without `intakeItemId`.
  - New `adminRouter.intake.summary`: per `paper_key` and `edition`, counts by status and by issue
    code.
  - New `adminRouter.intake.items({ paperKey, status })`: the items, with number, issues and a text
    preview from `candidate.question_text`.
- **New `src/lib/intake.ts`:** the summary SQL and the issue labels (they mirror `ISSUE_CODES`).

### Web (`apps/web`)
- **New `app/routes/admin/intake.tsx`, "Held questions":**
  - a table per paper: ready, held, in review, published, rejected, and held counts by issue;
  - a paper drills down to its held items;
  - a link from the admin dashboard.

## Tests

- **Pipeline:**
  - `record_intake`:
    - an insert;
    - re-recording the same content changes no status and counts it unchanged;
    - changed content on a published item makes it ready;
    - a held item whose issues clear becomes ready.
  - `detect_issues` keeps today's behaviour: the existing GATE detector tests move to
    `core/test_quality.py`.
  - `import_paper`:
    - writes held and ready items;
    - a second run writes no new batch;
    - the batch's elements carry `intakeItemId`.
  - This uses the existing invented fixtures, plus a database test against the local database.
- **API:**
  - the summary SQL against the local database (seed items, check the counts);
  - approval marks items `published` and rejection marks them `rejected`, with `fetchPipeline`
    stubbed through the same pure-function seam as `lib/normalized-batches.ts`.

## Acceptance

- **Locally,** `gate-import --all-pilot` on a fresh database records 260 items: 143 ready and 117
  held, by code. Running it again records 0 new items and writes no batch.
- **Approving one batch** in the local admin page moves its items to `published`, and the "Held
  questions" page shows the counts.
- **Checks:** all of them pass, and `pnpm db:check` is clean.

## Owner checkpoints

- **The production migration** (`0019`) is applied before merging, with the owner's go-ahead.

## Risks

- **A changed parse of a published question goes back through review.** That's intended, but a
  parser change that alters many hashes means many reviews. The import report counts "changed"
  items, so a surprising number is caught before batching.
- **Intake grows with every edition and source.** Rows are small: the candidate is the only large
  field, a few kilobytes each. Archive and prune policy comes later, with S8.

## Decided during implementation

- **Approval finds an intake item by its batch and question number.** Elements still carry
  `intakeItemId`, but `markIntakePublished` and `markIntakeRejected` (`packages/api/src/lib/intake.ts`)
  key on `review_batch_id` plus the question's number. A pipeline batch holds one paper, so that
  pair names one item. It also covers questions a reviewer publishes later from the
  possible-duplicate screen, whose stored candidate has no intake id:
  - a "same" or "new" decision marks the item published;
  - "skip" marks it rejected.

  Batches with no intake rows (MS Learn) are untouched.
- **`image_option` is its own code.** An option with no text used to count as `figure`; it now
  gets its own code, so Spec 9 can tell "crop the options" apart from "crop the figure".
- **The issue labels live in `packages/api/src/lib/issue-labels.ts`,** which has no imports, so the
  admin page can use them through `@prepora/api/src/shared`. `lib/intake.ts` re-exports them.
- **The detector's tests stay with GATE** (`connectors/gate/test_parser.py`). They run it on
  generated papers with `GATE_QUALITY`, which is the behaviour that matters. The core tests
  (`apps/pipeline/test_intake.py`) cover `Issue`, `content_hash` and the store.
- **Acceptance, on a scratch local database** (so the owner's pending pilot batches stayed
  untouched):
  - the first run recorded 260 items: 143 ready (all sent to review) and 117 held;
  - a second run found 0 new and 260 unchanged, and wrote no batch;
  - approving the 2026 CS-1 batch through the admin API made its 45 items `published`, each with
    its `question_id`;
  - rejecting the 2025 CS-2 batch made its 36 items `rejected`, and its 29 held items stayed held;
  - the "Held questions" page was checked in the browser.
