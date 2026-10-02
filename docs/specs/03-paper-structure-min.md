# Spec 3 · S4-min: Marks, sections, answer status and numeric answers

**Issue:** #45
**Milestone:** S4 · Paper structure
**Depends on:** Spec 1 (it builds on `getBySlug` and the new question page)
**Production database:** yes, one migration with back-fills. Needs the owner's go-ahead.

## Context

GATE papers ([dossier](../sources/gate.md) §4–5) need four things Prepora can't represent today:
- **marks and negative marks** per question;
- **sections** (General Aptitude vs the discipline);
- **numeric answers given as ranges** (`4.24 to 4.26`, `-0.61 to -0.57 OR 0.57 to 0.61`);
- **questions with no scored answer** (`MTA`, marks to all).

The stable question ID also lacks the **sitting**, so CS-1 and CS-2 of the same year would collide.

Nothing in the app grades numeric answers yet. `recordAttempt`
([attempts.ts](../../packages/api/src/lib/attempts.ts)) only compares option IDs, and the question
and practice pages only render options.

This is the minimum of the knowledge-index design's S4 that GATE needs. Paper groups, editions,
`paper_sections` and choice rules stay deferred.

## Decisions

1. **Marks, section and answer status live on the occurrence** (`question_occurrences`), not the
   question: they're facts about one paper.
2. **Numeric ranges live on `question_answers`:** one row per range, with `numeric_min`,
   `numeric_max` and `range_group`. "X to Y OR X to Y" becomes two rows. `numerical_answer` (text)
   stays for display.
3. **One `provenance` column on `question_answers`** stands in for the full multi-source design (S3,
   deferred). Existing rows are back-filled to `official_sample_key`, since all published answers
   today come from MS Learn practice assessments.
4. **Two set-level columns** on `question_sets`: `paper_kind` and `key_status`. They're needed to
   label GATE papers honestly ("Past paper · final official key"). Existing sets are back-filled to
   `official_practice` and `final`.
5. **No scored answer is allowed when it's honest.**
   - An occurrence whose `answer_status` is `marks_to_all`, `dropped` or `cancelled` may be
     published without an answer.
   - The question page shows why, instead of a reveal button.
   - A `scored` question still requires an answer, as today.
6. **The stable ID includes the sitting** when there is one: `{base}-{SHIFT}-Q{nnn}`. IDs without a
   shift are unchanged, so no existing ID is rewritten.
7. **The contract version goes from 4 to 5.** Every new field is optional with a default, so older
   producers keep working.

## Changes

### Database (`packages/db`)

In `src/schema/shared.ts`, add these enums:
- `answer_status`: `scored | marks_to_all | dropped | cancelled`
- `answer_provenance`: `official_final | official_provisional | official_sample_key | reviewer | ai_suggested_confirmed | community`
- `paper_kind`: `past_paper | official_practice | sample_paper | model_paper`
- `key_status`: `none | provisional | final | revised`

Columns by schema file:
- **`src/schema/questions.ts`, `questionOccurrences`:**
  - `sectionLabel` (text, nullable)
  - `numberLabel` (text, nullable)
  - `marks` (`numeric(5,2)`, nullable)
  - `negativeMarks` (`numeric(5,2)`, nullable)
  - `answerStatus` (`answer_status`, not null, default `scored`)
- **`src/schema/questions.ts`, `questionAnswers`:**
  - `numericMin` (`numeric`, nullable)
  - `numericMax` (`numeric`, nullable)
  - `rangeGroup` (integer, nullable)
  - `provenance` (`answer_provenance`, **not null**)
- **`src/schema/catalog.ts`, `questionSets`:**
  - `paperKind` (`paper_kind`, not null)
  - `keyStatus` (`key_status`, not null)

**The migration.** Run `pnpm db:generate`, then **edit the SQL by hand** so the three not-null
columns are back-filled and then lose their temporary defaults:

```sql
ALTER TABLE question_answers ADD COLUMN provenance answer_provenance NOT NULL DEFAULT 'official_sample_key';
ALTER TABLE question_answers ALTER COLUMN provenance DROP DEFAULT;
ALTER TABLE question_sets ADD COLUMN paper_kind paper_kind NOT NULL DEFAULT 'official_practice';
ALTER TABLE question_sets ALTER COLUMN paper_kind DROP DEFAULT;
ALTER TABLE question_sets ADD COLUMN key_status key_status NOT NULL DEFAULT 'final';
ALTER TABLE question_sets ALTER COLUMN key_status DROP DEFAULT;
```

The schema files declare these columns **without** defaults, so every writer must set them
explicitly. `pnpm db:check` must pass.

### Pipeline contract (`apps/pipeline/prepora_pipeline/contracts/`)

- **`normalized_question.py`, `NormalizedQuestion`:**
  - `section: str | None = None`
  - `number_label: str | None = None`
  - `marks: float | None = None`
  - `negative_marks: float | None = None`
  - `answer_status: Literal["scored","marks_to_all","dropped","cancelled"] = "scored"`
  - `answer_provenance: Literal["official_final","official_provisional","official_sample_key","reviewer","ai_suggested_confirmed","community"] = "official_final"`
  - `paper_kind: Literal["past_paper","official_practice","sample_paper","model_paper"] = "past_paper"`
  - `key_status: Literal["none","provisional","final","revised"] = "final"`
- **`NumericalAnswer`:** add `ranges: list[tuple[float, float]] | None = None`, with a validator
  requiring `lo <= hi` for every range.
- **`answer`:** may be `None` **only if** `answer_status != "scored"`, enforced with a model
  validator.
- **`versions.py`:** set `CONTRACT_VERSION = "5"`.
- **Packages:** mirror the new fields in `packages/content/src/schema.ts` only if that file mirrors
  the answer union field for field. Check its comment; if not, leave it.

### Pipeline (`apps/pipeline/prepora_pipeline/`)

- **`stages/validate.py`:** skip `MISSING_ANSWER` when `answer_status != "scored"`. Add the error
  `NUMERIC_RANGE_INVALID` for any range with `lo > hi`.
- **`stages/stable_id.py`, `derive_stable_content_id`:** for position identity, when
  `normalized.shift` is set, emit `{base}-{SHIFT}-Q{nnn}`, with the shift through `_slug_component`.
  Content identity is unchanged.
- **`stages/publish.py`:**
  - `_insert_answers`:
    - write `provenance` (from `normalized.answer_provenance`) on every row;
    - for a `NumericalAnswer` with `ranges`, insert one row per range with `numeric_min`,
      `numeric_max`, `range_group` (0, 1, …) and `numerical_answer` = the display string;
    - with `answer is None`, insert nothing.
  - `_resolve_or_create_occurrence`:
    - write `section_label`, `number_label`, `marks`, `negative_marks` and `answer_status`;
    - on conflict `(question_id, question_set_id)`, **update** those five columns, because a revised
      key can change an answer's status. It currently does nothing on conflict, so keep the
      `RETURNING` semantics for whether the row was created (use `xmax = 0`).
  - `_resolve_or_create_question_set`: write `paper_kind` and `key_status` on insert. On an existing
    set, update `key_status` when the new value is "later": `none` < `provisional` < `final` <
    `revised`.
- **`dedupe/fingerprint.py`, `shape_of`:** for a `NumericalAnswer` with `ranges`, make the answer
  shape the sorted list of `f"{lo}..{hi}"` strings.

### API (`packages/api`)

- **`src/routers/admin.router.ts`, `reviewElementToNormalizedQuestion`:** set
  `answer_provenance: "official_sample_key"`, `paper_kind: "official_practice"` and
  `key_status: "final"`. MS Learn batches are its only producer today. Spec 5 adds a pass-through
  for batches that already carry a full NormalizedQuestion.
- **`src/lib/catalog-questions.ts`:** `loadQuestionsWithAnswers` and `findPublishedQuestionBySlug`
  (Spec 1) also return:
  - `questionType`;
  - `numericRanges: Array<[number, number]>`;
  - per occurrence: `sectionLabel`, `numberLabel`, `marks`, `negativeMarks` and `answerStatus`.
- **`src/lib/attempts.ts`, `recordAttempt`:**
  - **Input:** accept `numericAnswer?: string`.
  - **Grading a numerical question:** parse the input as a float, with the decimal separator `.`.
    It's correct when it falls inside any `[numeric_min, numeric_max]` range, inclusive. If no
    ranges exist, compare it with `numerical_answer` after trimming.
  - **Storage:** store the raw input in `attempts.text_answer`.
  - **Returning:** add `correctNumericRanges` and `numericAnswerDisplay`.
- **`src/routers/questions.router.ts`, `submitAnswer`:** accept `numericAnswer`. `getBySlug`
  returns `questionType`. It never returns ranges before an answer is submitted.

### Web (`apps/web`)

- **Question page** (`app/routes/questions/$questionSlug.tsx`, from Spec 1):
  - **Numerical questions:** render a text input (`inputMode="decimal"`) and a "Check answer"
    button. After submitting, show the result and the accepted range(s), e.g. "Accepted: 4.24 to
    4.26".
  - **No answer to score:** when the question has no answer rows and an occurrence's `answerStatus`
    isn't `scored`, show "No answer to score: marks were awarded to everyone" (or "This question was
    dropped" / "This question was cancelled"). There's no reveal button in this case.
  - **Marks:** show `1 mark · −⅓ for a wrong answer` from the first occurrence, when `marks` is set.
- **Practice** (`app/routes/practice.tsx`):
  - **Grading:** practice grades on the client with `correctKey`/`correctKeys`. For `numerical`
    questions, add the same input, and grade on the client against `numericRanges` from the payload.
  - **Skipping:** skip questions with no scorable answer.
  - **Summary:** in Simulation mode's results, count them as "not scored".

## Tests

- **Pipeline:**
  - **Contract:** a range with lo > hi is rejected; `answer=None` is allowed only when not `scored`.
  - **Validate:** an MTA question with no answer is valid.
  - **Stable ID:** a shift appears in the ID only when set, and an existing no-shift ID is unchanged.
  - **Publishing:**
    - a numeric question with two ranges writes two answer rows, with `range_group` 0 and 1 and
      provenance set;
    - republishing with a changed `answer_status` updates the occurrence;
    - `key_status` only moves forward.
- **API** (`attempts.test.ts`), for a numeric question: inside a range is correct; outside is
  wrong; the second `OR` range is correct; non-numeric input is wrong. Also check that `text_answer`
  is stored.
- **Web:** lint and typecheck, plus a manual check of numeric input, the MTA note and the marks line
  on a locally published test question.

## Acceptance

- **Local publishing:** a NumericalAnswer with ranges, an MTA question, and an MCQ with marks −⅓
  (published through the pipeline CLI) each render and grade correctly on the question page and in
  practice.
- **Existing content:** MS Learn questions are unchanged, and their answers show provenance
  `official_sample_key` in the database.
- **Checks:** all checks pass, and `pnpm db:check` is clean.

## Owner checkpoints

- **Production migration:** the owner approves `pnpm db:migrate` on production after merging. It
  back-fills 3 columns on existing rows; that's safe, but it touches every answer and set row.

## Risks

- **Decimal formats:** some candidates type `4,25`. Accept a comma only when the input has no `.`,
  and say so in the input's placeholder.
- **Upserting occurrences changes semantics.** Re-approving a batch can now change `answer_status`
  on published occurrences. That's intended (revised keys), but it's covered by a test.
