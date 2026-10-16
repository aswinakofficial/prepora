# Spec 13 · Math recovery from the PDF

**Issue:** #78
**Milestone:** Finish GATE
**Depends on:** Spec 12 (the Markdown and LaTeX format; Done, #94)
**Design:** [ADR-016](../adr/016-deterministic-rebuilds-are-parsing.md) (Accepted with
this spec): rebuilding text from the source's own PDF is parsing, not a revision.
**Production database:** no migration. Production has no published GATE questions today (a
read-only check during #94's review). Rebuilt questions reach production only when the owner re-runs
`gate-import` against production and approves the batches (the owner's go-ahead, as for every
import).
**Status:** Ready (approved by the owner, 2026-10-16)
**Owner decision (2026-10-04):** PDF first, AI only for the rest; AI transcription is Spec 15
([ADR-015](../adr/015-ai-assistance.md), 2026-10-04 amendment).

## Owner decisions (2026-10-16)

The owner answered the spec's four questions on 2026-10-16:

1. **Re-typeset everything.**
   - Every math-font run in **every** GATE question becomes LaTeX: italic variables, letterlike
     symbols such as ℝ, and sub- and superscripts.
   - Changed published questions go back through review, through intake's content hash.
   - The all-or-nothing rule applies to every question. If a question isn't held for math and its
     rebuild can't explain every math run, it keeps its current text and status (Decision 2).
2. **Scripts and symbols only.** The rebuild covers:
   - sub- and superscripts (nested, multi-token, and both on one base);
   - Symbol-font glyphs;
   - upright names.

   Overbars and fractions aren't rebuilt. Questions that need them stay held with a named reason.
3. **The bar for done is correctness.**
   - Every recovered or re-typeset question matches the PDF in a hand check.
   - Every math-only hold is either recovered or still held with a named reason.
   - There's no numeric target.
4. **No badge in Admin → Review.**

## Context

Design: [knowledge-index §4a](../architecture/knowledge-index.md), rules 2–4 and the remediation
ladder's step 3, read through [ADR-016](../adr/016-deterministic-rebuilds-are-parsing.md). A rebuild
from the same PDF:
- re-processes the intake item in place, under a new `parser_version`;
- never creates a `question_revisions` row;
- carries no label.

Spec 5's spot checks found the math holds genuine: mostly sub- and superscripts that text extraction
flattens, so a reader would see "L 1" for L₁ and "n 2" for n². Clean questions lose information too.
NFKC (`core/pdf_text.py` `normalize_text`) turns a math-italic 𝑛 into a plain n and ℝ into R.

The PDF still has what's needed. `core/pdf_text.py` gives every word its font size, font name and
box, and pdfplumber splits a word wherever the size or font changes (`extract_words(...,
extra_attrs=["size", "fontname"])`). So:
- a script glyph is always a word of its own, smaller than its line, and raised or lowered against
  the glyph before it;
- a math run is a word in a math font.

That's enough to rebuild the notation as LaTeX **deterministically**, with no AI, and Spec 12 already
renders it.

### Measured on the pilot (the lead, on a fresh local scratch database, 2026-10-16)

`gate-import --all-pilot` recorded **260 items: 143 ready and 117 held.**
82 of the held items have a math issue.

**Held items by issue combination:**

| Issues | Questions |
|---|---|
| math | 52 |
| layout + math | 20 |
| figure | 19 |
| layout | 11 |
| figure + layout + math | 6 |
| figure + math | 4 |
| figure + layout | 2 |
| figure + image_option | 2 |
| figure + image_option + layout | 1 |

**Detector rules on the 52 math-only holds** (a question can have more than one):

| Rule (`core/quality.py`) | Questions |
|---|---|
| an inline sub- or superscript | 43 |
| a row of sub- or superscripts | 21 |
| math or private-use glyphs | 1 |
| single tokens stacked on 3+ lines | 0 |

So scripts account for every math-only hold. The rebuild clears each one that doesn't also need a
fraction or an overbar.

### Inspected for this spec (2026-10-15)

The pilot PDFs were inspected locally (the connector's cached artifacts under
`apps/pipeline/.data/raw/`, and the same files from the catalog URLs). No question text is quoted
here.

- **Fonts.** Both 2025 papers embed:
  - Times New Roman (regular, bold, italic);
  - **Cambria Math**;
  - **SymbolMT** (Type0, Identity-H, with a ToUnicode map);
  - Courier New, Calibri and Arial.

  Embedded names carry a subset prefix ("BCDGEE+CambriaMath"). The 2026 papers are Word 2016 exports
  that set math in Cambria Math too.
- **Kinds of notation, by eye.** 2026 CS-1 and most of 2025 CS-1 were read page by page. Leaving out
  questions with a table or a figure, the questions with notation beyond single inline symbols
  break down as follows:

  | Kind | Share |
  |---|---|
  | sub- and superscripts only | about 56% |
  | stacked fractions as well | about 15% |
  | overbars | about 12% |
  | a case split, aligned equations, a matrix or a root | about 15% |

  The fractions and overbars are the part of the math-only holds this spec leaves held.
- **Three more facts shape the design:**
  - **Superscripts also appear in the prose font** (Times), so script detection can't depend on the
    math font.
  - **Upright and italic letters both appear inside math** (an upright "log", "mod" or "e" next to
    italic variables). NFKC erases the difference, so the rebuild reads each word's text before NFKC.
  - **SymbolMT operators often extract into the Private Use Area** (U+F0xx). The Adobe Symbol
    encoding maps them back.
- **Overbars and fraction bars are drawn rules.** A drawn `line` graphic is already a figure for
  `_is_figure` (`core/quality.py`), so a bar drawn that way holds its question as a figure. A thin
  filled rectangle (2pt or less in one dimension) isn't a figure. So such a bar can sit unnoticed in
  a question that isn't held. The rebuild has to find it (Decision 1, step 7), so that it never
  certifies a formula whose bar it can't see.

## Deliverable and UI acceptance

When this is done, GATE questions read like the paper:
- **Held only for sub- and superscripts:** rebuilt from the PDF, then sent to review like any ready
  question.
- **Every other question's math runs** (italic variables, symbols, ℝ): re-typeset as LaTeX.
- **What the rebuild can't fully explain:** a math hold stays held, with a named reason. Any other
  question keeps the text and status it had.

Nothing half-rebuilt reaches the site, and nothing gets a badge or label (ADR-016).

Steps 1–10 are checked by `tests/e2e/acceptance/13-math-recovery.spec.ts`. Its setup runs
`python -m prepora_pipeline.connectors.gate.e2e_math_paper` (Changes). That module generates an
invented 7-question paper laid out like GATE, and its key, with reportlab, then runs the real
`import_paper` on them. The paper is `GATE 2099`, sitting `E2E-<random>`. The test cleans up
everything it created.

The invented questions use stems distinct from each other and from Spec 12's e2e seeds:

| # | What it contains | What the rebuild should do |
|---|---|---|
| Q.1 | a subscript row (`Z` with `1`, `Z` with `2`) in smaller type just below its line | recover it |
| Q.2 | options with inline superscripts in smaller, raised type (2 with 17, 2 with 19). Option A is glued to its marker: "(A)2", with the superscript after it | recover it |
| Q.3 (NAT) | a multi-token subscript (`d` with `k+1`) | recover it |
| Q.4 | a subscript plus a stacked fraction: two short rows with a thin filled rectangle (no more than `bar_thickness`, 2pt) between them | hold it, for the fraction |
| Q.5 | plain prose containing `*` and `_` | leave it as it is |
| Q.6 | a math run in reportlab's standard Symbol font (α ∪ β) | re-typeset it |
| Q.7 | a Symbol-font run that includes a glyph outside the rebuild's table (♣) | keep it as it is |

A bar drawn as a line would already hold Q.4 as a figure, which isn't the case under test.

| # | Step | Expected |
|---|---|---|
| 1 | Import the invented paper, then open Admin → Held questions | The paper's row reads Ready 0, In review 6, Published 0, Held 1, Rejected 0, with "1 · Math that didn't extract cleanly" |
| 2 | Click "Show held questions" on that paper | Only Q.4 is listed. Its reasons include "Math that didn't extract cleanly: the rebuild found a fraction, which it doesn't rebuild". Its text preview shows no `$` and no LaTeX |
| 3 | Open Admin → Review and find the paper's batch | It holds Q.1, Q.2, Q.3, Q.5, Q.6 and Q.7, with no badge on any. Q.1's preview renders Z with real subscripts (KaTeX sub/superscript markup) and shows no `$`, `\` or `_`. No formula in the batch is red-outlined (a KaTeX error) |
| 4 | Approve the batch, then open Q.1's question page | The readable text says "Let", then Z₁ and Z₂ as rendered math, then the rest of the invented sentence. The formulas' TeX sources (KaTeX's annotation) are `Z_{1}` and `Z_{2}`. No `$`, `\` or `_` is visible |
| 5 | Open Q.2's question page; choose option A and reveal the answer | Every option renders a superscript; option A's TeX source is `2^{17}`, and the option reads as one formula, with no stray "(A)" or space. Choosing and revealing works as for any question |
| 6 | Open Q.3's question page | Its formula's TeX source is `d_{k+1}`, rendered as a subscript |
| 7 | Open Q.5's question page | Its text reads exactly as printed, with `*` and `_` shown literally. The page has no KaTeX element |
| 8 | Open Q.6 and Q.7's question pages, and read the fixture's JSON output | Q.6's formula has the TeX source `\alpha \cup \beta`. Q.7 has no KaTeX element, and its text is the PDF's extracted text (the parser's `gate-1` output). The fixture's JSON output (the import report's lines) includes "Q.7 kept as is: unknown_symbol" |
| 9 | Open the paper's question set page (`/question-sets/<slug>`) | It lists Q.1, Q.2, Q.3, Q.5, Q.6 and Q.7. Q.4 isn't on the site |
| 10 | Import the same invented paper again, then reopen Admin → Held questions and Admin → Review | The row reads 0 / 0 / 6 / 1 / 0 (the six were published in step 4), and there's no new batch for the paper |
| 11 | **Pilot, by hand:** on a fresh local database (`scripts/dev-db.sh`), run `gate-import --all-pilot --report-dir docs/sources/reports/gate` | The four committed reports show, per paper, the math holds before and after, the reasons for what's still held, and the re-typeset and kept-as-is questions with their reasons. Their arithmetic holds for each paper: `recovered + still_held == flagged`, and `retypeset + kept == clean_with_math_runs`. Admin → Held questions' "Math that didn't extract cleanly" total equals the reports' `still_held` sum |
| 12 | **Pilot, by hand:** in Admin → Review, compare **every** recovered and every re-typeset pilot question with its page in the official PDF. Approve one re-typeset question that was already published | Each matches the paper: the right symbols, italic or upright as printed, the right base, level (sub or super) and script content, and no bar missing. No formula is red-outlined. The previously published question comes up as a possible duplicate of itself, and "same question, use the new wording" updates it. The PR lists each question by number with pass or fail |

**How the hand-checked steps are run:**
- Steps 11 and 12 need the real papers, which CI never fetches. The builder runs them locally and
  puts the report diff and a screenshot of each step in the PR.
- Any question that reads wrong in step 12 is a bug that blocks the merge.
- In the e2e fixture, how reportlab's Symbol font extracts (Unicode or Private Use Area) is the QA's
  to confirm. The glyphs may change, but the expected results above may not.

## Scope

**In scope:**
- **A shared rebuild stage, `core/math_rebuild.py`,** on `core/pdf_text.py` words and graphics. It
  depends on no connector. It rebuilds:
  - sub- and superscripts, inline (smaller type in the line) or as a row just above or below their
    line, including multi-token scripts, a subscript and a superscript on one base, and one extra
    level of nesting (`n^{\log_{4} 5}`);
  - every math-font run in every question: italic variables, Greek, operators, letterlike symbols
    (ℝ), and upright names (`log`, `mod`, `max`), read from the text before NFKC;
  - Symbol-font glyphs in the Private Use Area, through the Adobe Symbol encoding.
- **Detecting what it doesn't rebuild,** so that it never certifies it: overbars and fractions
  (Decision 1, step 7).
- **All or nothing per question,** for every question (Decision 2).
- **GATE using it** in `paper_parser.py`, with the parser version going to `gate-2`.
- **Re-approving a re-typeset published question** as "same question, use the new wording"
  (Decision 4).
- **The committed counts-only report** for the four pilot papers.
- **The e2e acceptance test,** with generated PDFs.

**Out of scope** (follow-up issues, opened with this spec's PR):
- Rebuilding overbars, stacked fractions, case splits, aligned equations, matrices and roots (owner,
  2026-10-16). They stay held for Spec 15, or keep their current text if not held for math.
- A review badge (owner, 2026-10-16).
- **A non-blocking intake note,** so the admin can show why a question was kept as is. It needs a
  migration (Decision 2).
- Display math (`$$…$$`) for centred formula lines. Every rebuilt formula is inline (Decision 3).
- Stripping LaTeX from the search index, page titles and JSON-LD (#96, from Spec 12).
- Other GATE papers and years. They reuse the stage with the same profile, checked again when
  they're added.

## Decisions

### 1. The rebuild algorithm

`rebuild_math(lines, graphics, profile) -> RebuildResult` works on one question's lines
(`Block.lines`) and the drawn graphics on its pages. It returns new lines in which every formula is
inside one word, plus the reasons for anything it couldn't explain. It's pure: words in, words out.

Its thresholds come from a `MathProfile`, like the detector's `QualityProfile`. `GATE_MATH` holds:
- the script shift, and the attachment and glue gaps;
- the bar thickness (2pt, matching `_is_figure`'s limit) and the bar's maximum length;
- the math fonts and the code fonts.

Its values are measured on the four pilot papers while building, and recorded with a comment, as
`GATE_QUALITY` was.

**Font names** are compared through a new `core/pdf_text.py` `font_family(fontname)`, which strips
a subset prefix ("ABCDEF+"), lowercases and removes spaces.
- **Code detection moves to core:** `CODE_FONTS` and `_is_code` move from `paper_parser.py` to
  `core/pdf_text.py` as `is_code_line(line, code_fonts)`.
- `MathProfile.code_fonts` is passed to it, so the core stage depends on no connector.

The steps:

1. **Lines in code** (`is_code_line`) are left alone.
   - So is an option marker: only the `(A)` prefix. When the marker is glued to its text ("(A)2"),
     the remainder ("2") is split off as a normal word, which can be a base.
2. **Body, script and math words.**
   - A word is a script candidate when its size is under `profile.script_size` (0.8, as in
     `GATE_QUALITY`) × the median size of the body words around it.
   - A word is math when its `font_family` is in `profile.math_fonts` (Cambria Math, Symbol), or when
     its text before NFKC holds a math-alphanumeric (U+1D400–U+1D7FF), letterlike (ℝ, ℕ, ℤ, ℚ, ℂ) or
     Symbol Private Use Area character.
3. **Attach each script to a base.** The base is the word (body, or a larger script for nesting)
   whose right edge is within `profile.attach_gap` points of the script's left edge, and whose
   vertical extent is within one script height of the script. Rows that `group_lines` split off
   above or below their line are handled the same way, because attachment uses positions, not lines.
   - No such word is **`no_base`** (a pre-script, or a limit under ∑).
4. **Sub or super.** The script's vertical centre is compared with its base's. Higher by at least
   `profile.script_shift` × the base's size is a superscript; lower by as much is a subscript.
   - A subscript and a superscript on one base become `x_{…}^{…}`.
   - These are **`unclear_level`**, never emitted, because KaTeX would reject them or misplace them:
     - anything in between;
     - two scripts of the same level on one base (a double superscript);
     - a prime or another glyph glued after a superscript on the same base.
5. **Script groups and nesting.**
   - Consecutive script words at the same level, each starting within `profile.glue_gap` of the
     previous one, form one script (`k+1`, `R.P=S.X`).
   - A script smaller again than the script it attaches to is nested inside it.
   - Deeper than two levels is **`too_deep`**.
6. **Formula extent, and glued prose.**
   - A formula is a maximal run of math words on one line, plus any base and its scripts, extended
     over glued math-safe words (gap under `profile.glue_gap`): digits, brackets, operators and
     punctuation in any font. So "Θ(n" + "2" + ")" is one formula.
   - Math words separated only by spaces on one line stay in one formula.
   - **Glued prose stays in the same `Word`,** outside the formula's markers. That's because
     `Line.text` and `split_options` join words with a space. So "2³²-bit" becomes one word, the
     formula `2^{32}` followed by the prose "-bit", rendered `$2^{32}$-bit` with no space.
   - When the base is a prose-font word, only its trailing run of letters and digits is the formula,
     and the rest stays as glued prose. So "1M=2" with a superscript "20" becomes `1M=$2^{20}$`.
   - Prose-font italics (emphasis) are never math on their own.
7. **What isn't rebuilt is detected, never skipped.**
   - **`overbar`:** either of these, lying just above the formula's glyphs on its line:
     - a combining overline or macron (U+0305, U+0304, U+00AF) in the text before NFKC;
     - a thin filled rectangle (no thicker than `profile.bar_thickness`), shorter than
       `profile.bar_max_length`, so table borders are excluded.
   - **`fraction`:** such a rectangle between two short rows, or two short rows stacked over each
     other within the formula's horizontal extent.
   - A bar drawn as a `line` graphic is already a `figure` issue (`_is_figure`), so its question is
     held as a figure whatever the rebuild does.
8. **Characters to LaTeX**, from the text before NFKC, through the table (Decision 3):
   - **Letters in a math font:** math-italic code points become plain letters (italic in LaTeX).
     Upright runs become a known operator (`\log`, `\bmod`, `\max`, …), `\mathrm{x}` for a single
     letter, or `\text{…}` for a word.
   - **Letters in any other font** are italic or upright by their font name (`…Italic` or not).
     Italic ones become plain letters, and upright ones become `\text{…}`. So a letter script in the
     prose font comes out as `\text{}`.
   - **Greek, operators and letterlike symbols** become their commands. Symbol Private Use Area code
     points go through the Adobe Symbol encoding first.
   - **LaTeX's special characters** (`{ } # % & _ ^ ~ \ $`) are escaped by their own table entries.
   - **Spaces:** a space is emitted as `\ ` only between two tokens inside a formula, and only where
     one side is a `\text{}` or an upright name. It's never at a formula's edge. Any other space is a
     plain space.
   - A character outside the table is **`unknown_symbol`**.
9. **Output.** Each formula becomes LaTeX wrapped in two internal markers (Decision 3), inside one
   `Word`:
   - with its glued prose before or after it;
   - covering its parts' box, at its base's size;
   - with `math=True`.

   Everything else is passed through unchanged.

**The reasons** are a closed list, `REBUILD_REASONS` in `core/math_rebuild.py`. Each has a sentence
for people:

| Code | Sentence ("Math that didn't extract cleanly: …" when held) | From |
|---|---|---|
| `no_base` | the rebuild found a sub- or superscript with nothing beside it | step 3 |
| `unclear_level` | the rebuild found a script it couldn't place as clearly raised or lowered | step 4 |
| `too_deep` | the rebuild found scripts nested more than two levels | step 5 |
| `overbar` | the rebuild found an overbar, which it doesn't rebuild | step 7 |
| `fraction` | the rebuild found a fraction, which it doesn't rebuild | step 7 |
| `unknown_symbol` | the rebuild found a symbol outside its table | step 8, and a private-use glyph left after the rebuild |
| `small_type` | the rebuild left smaller type it couldn't place as a script | an inline sub- or superscript left after the rebuild |
| `not_script` | the rebuild found a row just below its line that isn't smaller type | a row of sub- or superscripts left after the rebuild |
| `stacked` | the rebuild can't read stacked lines (a case split or a matrix) | single tokens stacked on 3+ lines, after the rebuild |

**Every detector math rule maps to a reason** (the last four rows). So every rebuild that isn't
accepted names at least one.

### 2. All or nothing, for every question

The rebuild runs on **every** question, in `parse_paper` after `detect_issues`:

1. `rebuild_math(block.lines, graphics, GATE_MATH)`.
2. `detect_issues(...)` again, on the rebuilt lines.
3. **The rebuild is accepted only when** it has no reason **and** the second detector run finds no
   `math` issue.
   - When the second run does find one, the rule it found is mapped to its reason (the table
     above).
   - A rebuild that isn't accepted always has at least one reason. A test checks this.

`GateQuestion` keeps the **original** (`gate-1`) text and options next to the chosen ones
(`original_text`, `original_options`). The outcome depends on whether the detector held the question
for math:

| The question | Rebuild accepted | Rebuild not accepted |
|---|---|---|
| **Held for math** (its first detector run has a `math` issue) | **Recovered.** Its stem, options and text come from the rebuilt lines | **Still held.** It keeps the original text, unchanged from `gate-1`. Its issues are the first run's, plus one `math` issue per reason, e.g. `{code: "math", detail: "the rebuild found a fraction, which it doesn't rebuild"}` |
| **Not held for math** (clean, or held only for a figure or layout) | **Re-typeset.** Its text comes from the rebuilt lines; one with no math run comes out byte-identical | **Kept as is.** It keeps the original text, and its status doesn't change. It isn't held for math, because it reads exactly as it did before |

**Issues after an accepted rebuild:**
- The rebuild never clears a non-math issue.
- A recovered or re-typeset question's issues are the first run's non-math issues, combined with
  the second run's (deduplicated).
- So a recovered question still held for a figure or layout stays held for that alone, ready for
  Specs 14 and 15.

**What's recorded, and where.** `GateQuestion.math_outcome` and `math_reasons` exist only during the
run; they aren't stored. What persists:
- **for still-held questions:** their `math` issue details, on the intake item;
- **for every outcome:** the lines printed by `gate-import` ("Q.n kept as is: unknown_symbol"), and
  the committed counts (Decision 6).

There's no per-question record of a "kept as is" outcome. An intake issue always holds its item
(`IntakeItem.status`), and a non-blocking note needs a new column. That note is a follow-up issue
(ADR-016, Consequences).

**Why:**
- A half-rebuilt formula reads as authoritative and wrong (ADR-016, decision 3). Keeping the
  original text for anything not fully explained means Spec 15 and the reviewer see what the PDF
  really gave.
- Holding a question because its re-typeset failed would take a question that reads as well as it
  did yesterday off the site.

No new issue code is needed, so `ISSUE_CODES` and `ISSUE_LABELS` don't change.

### 3. Output conventions, consistent with Spec 12's renderer

Spec 12's renderer (`packages/api/src/lib/rich-text.ts`) reads inline math as `$…$`, with no space
just inside either `$`, on one line, and **not followed by a digit**. So the rebuild emits:

- **Inline math only:** `$…$`, never `$$`. A formula is trimmed and never contains a newline. It
  never ends right before a digit: an adjacent digit is glued, so it joins the formula (step 6).
- **Braced scripts always:** `x_{1}`, `2^{32}`, `x_{i}^{2}`, `n^{\log_{4} 5}`. Commands are
  followed by a space or a brace (`\log n`, `\Theta(n^{2})`).
- **A closed vocabulary.** `apps/pipeline/prepora_pipeline/core/latex_symbols.json` maps each
  allowed character to its LaTeX, including the escapes for LaTeX's special characters, and lists
  the operator names.
  - It covers Greek; operators, relations and arrows; set and logic symbols; letterlike symbols
    (`\mathbb{R}`); and the Symbol encoding's 0xF020–0xF0FF.
  - It excludes the Symbol encoding's large-bracket pieces (0xF0E6–0xF0EF, 0xF0F4–0xF0FE). They
    belong to a stretched bracket, so they're `unknown_symbol`.
  - The only structural constructs are `_{}`, `^{}`, `\mathrm{}`, `\mathbb{}`, `\text{}` and `\ `.
- **Rendering is tested; it isn't guaranteed by construction.**
  - The pipeline tests pin the rebuild's outputs on invented inputs to a committed fixture,
    `core/fixtures/math_rebuild.json`. A test fails when the output changes; a flag regenerates the
    fixture.
  - `packages/api/src/lib/latex-symbols.test.ts` renders every table entry and every fixture output
    with KaTeX `throwOnError: true` and `strict: "error"`. That's the same pattern as
    `dedupe/fixtures/normalization.json`, which the TypeScript port's test reads.
  - The constructs KaTeX rejects (a double superscript, a prime after a superscript) are refused
    earlier, as `unclear_level`.
- **Escaping.**
  - Inside the parser, each formula is wrapped in the Unicode noncharacters U+FDD0 and U+FDD1. They
    never occur in PDF text, and nothing between the parser and the normalizer splits a word.
  - **`escape_markdown` keeps its contract,** because `stages/publish.py` uses it on plain
    explanations. A new `core/markdown.py` `escape_markdown_with_math(text)` escapes the prose as
    `escape_markdown` does, and emits each wrapped span verbatim as `$…$`. Only the GATE normalizer
    uses it.
  - It raises an error, rather than emitting broken Markdown, on a marker that isn't balanced and
    on a marker inside a code fence.
- **The markers never leave the parser.**
  - The candidate built when normalisation fails (`run.py` `_intake_item`'s fallback: figure,
    image-option and type-mismatch holds) uses `original_text` and `original_options`.
  - `_intake_item` raises if any candidate still contains U+FDD0 or U+FDD1.
- **`text_format` stays `markdown`,** and the `NormalizedQuestion` contract doesn't change.

### 4. Re-runs and upgrades, through intake's content hash and `parser_version`

- **`PARSER_VERSION` goes from `gate-1` to `gate-2`.** It isn't part of `content_hash` (`_NOT_CONTENT`
  in `core/intake.py`), so the version alone changes nothing.
- **A recovered held question:** its text changes, so its hash does. Intake recomputes its status:
  `ready` if nothing else holds it, and the run batches it for review.
- **A still-held question:** its candidate is byte-identical, so its hash is unchanged. It stays
  `held`, and its `issues` are refreshed with the reasons (issues aren't hashed).
- **A re-typeset question:** its text changes, so its hash does. Spec 7's rule applies:
  - **`published`:** becomes `ready` again and is batched;
  - **`rejected`:** becomes `ready` again and is re-batched, under the same rule;
  - **`in_review`:** waits until its batch is decided.
- **A kept-as-is question, or one with no math run:** byte-identical, so nothing changes.
- **Approving a re-typeset published question goes through as an edit, not a failure.**
  - **The failure today:** dedupe offers "same question, use the new wording" only at 0.9 similarity
    or above. A symbol-heavy re-typeset can fall below that. `stages/publish.py`
    `_resolve_or_create_question` then finds the position-identity `stable_content_id` taken and
    raises "already published as a different question".
  - **When the check runs:** with `on_near_duplicate="hold"`, and only when `check_duplicate`
    returned `unique`.
  - **What it checks, before writing:** whether the `stable_content_id` already belongs to a
    question with other content. It runs after `find_same_question`, so identical content (same
    wording, options and answer) is reused as today and never held.
  - **What it returns:** a `HeldResult` whose `DedupeDecision` is complete, built the way
    `dedupe/check.py` `decide()` builds a near duplicate (lines 99–115). That's needed because
    `duplicate_reviews` has `similarity`, `options_match`, `answer_match` and `suggestion` as NOT
    NULL (`packages/db/src/schema/duplicates.ts`), and `holdPossibleDuplicate`
    (`admin.router.ts`) stores them:

    | Field | Value |
    |---|---|
    | `outcome` | `"near_duplicate"` |
    | `existing_question_id` | the question holding the position |
    | `existing_question_text` | that question's text |
    | `similarity_score` | `dedupe/similarity.py` `similarity()` of the new text against that text (it may be under 0.9) |
    | `options_match`, `answer_match` | compared by option key and official key (or numeric ranges), not by option text, which a re-typeset rewrites (correction below) |
    | `suggestion` | always `"same_new"` (correction below) |
    | `reason` | "This paper's question is already published with other wording (a re-parse); N% similar" |
  - **The result:** the reviewer sees it on the existing possible-duplicate screen, and "same
    question, use the new wording" updates the question in place, keeping the old wording as a
    variant (ADR-016, decision 5).
  - For an intake item, that question is the item's `question_id`. A test approves a heavily
    re-typeset published question this way.
  - The default `on_near_duplicate="refuse"` still raises, as today.
  - **Correction, during build (lead, 2026-10-17):** a position-taken hold of a re-parsed question
    always suggests "same question, use the new wording" (stored as the new value `same_new`, which the panel maps to "keep the new version"; the column is text, so no migration); option and answer matches are compared on
    plain text (here, by option key and official key, since a re-typeset rewrites every option's
    text). The "computed as `decide()` does" rule above would have suggested "keep both" or "keep
    the old version" for exactly the questions this hold exists for. The possible-duplicate panel
    also renders a Markdown side as it will publish (`DuplicateDecisions.tsx`, with the same
    `renderRichText` as the batch preview), and `listDuplicateReviews` returns each side's `format`.
- **MS Learn's plain questions** aren't a PDF source and don't change.
- **Today that's only local.** Production has no published GATE questions, so only the owner's
  local pilot batches go back to review.
- **A run is idempotent.** The second run is "0 new, all unchanged" and writes no batch: acceptance
  step 10, checked by the pipeline tests too.

### 5. No provenance label, and no review badge

This follows ADR-016:
- a rebuilt question's text is the official PDF's own glyphs, rearranged by position, with nothing
  added: parsing, recorded by `parser_version` (`gate-2`);
- **no public label**, unlike AI transcription (Spec 15);
- **no review badge** (owner, 2026-10-16).

### 6. The committed report: counts only

`gate-import --report-dir <dir>` writes one JSON file per paper and edition,
`docs/sources/reports/gate/<year>-<sitting>.<edition>.json` (for example `2026-CS-1.iitg.json`).
That's the directory Spec 8 plans to compare in CI. Each file has:

```json
{
  "paper_key": "gate/2026/cs/CS-1",
  "edition": "iitg",
  "parser_version": "gate-2",
  "questions": 0,
  "ready": 0,
  "held": 0,
  "held_by_issues": { "figure": 0, "layout+math": 0, "math": 0 },
  "math": {
    "flagged": 0,
    "flagged_math_only": 0,
    "by_detector_rule": { "a row of sub- or superscripts": 0, "an inline sub- or superscript": 0 },
    "recovered": 0,
    "recovered_now_ready": 0,
    "still_held": 0,
    "still_held_by_reason": { "fraction": 0, "overbar": 0 }
  },
  "retypeset": {
    "clean_with_math_runs": 0,
    "retypeset": 0,
    "kept": 0,
    "kept_by_reason": { "unknown_symbol": 0 }
  }
}
```

**The fields:**
- **`flagged`:** every item held with a math issue before the rebuild, math-only or not.
  `flagged_math_only` and `by_detector_rule` break it down.
- **`recovered`:** questions whose math cleared. **`recovered_now_ready`:** those with no other
  issue left.
- **`still_held`:** questions whose math didn't clear. **`still_held_by_reason`:** counts each
  reason once per question, so it can sum to more than `still_held`.
- **`retypeset`:** questions not held for math (Decision 2). `clean_with_math_runs` counts those with
  at least one math run.

**Checks** (the report writer asserts them, and step 11 restates them):
- `recovered + still_held == flagged`;
- `retypeset + kept == clean_with_math_runs`.

**Rules:**
- **Counts only.** No question numbers, text or symbols are committed (knowledge-index rule 4).
  Per-question detail stays in the CLI output and in Admin → Held questions.
- **Keys are sorted, and the output is stable,** so a re-run with no change produces no diff.
- **`docs/sources/reports/gate/README.md`** sums the files in one table and links this spec. The
  same command writes it.

## Changes

### Pipeline (`apps/pipeline/prepora_pipeline`)

| File | Change |
|---|---|
| `core/pdf_text.py` | `Word.raw_text: str \| None = None` holds the text before NFKC, set in `extract_pages`. `Word.math: bool = False`. Both have defaults. Also new: `font_family(fontname)`, and `CODE_FONTS` and `is_code_line(line, code_fonts)`, moved from `paper_parser.py` |
| `core/math_rebuild.py` (new) | `MathProfile` (`script_size`, `script_shift`, `attach_gap`, `glue_gap`, `bar_thickness`, `bar_max_length`, `math_fonts`, `code_fonts`), `GATE_MATH`, `REBUILD_REASONS`, `RebuildResult(lines, reasons)`, `rebuild_math(lines, graphics, profile)`, the markers `MATH_OPEN` / `MATH_CLOSE`, and the mapping from detector math rules to reasons. It imports nothing from `connectors/` |
| `core/latex_symbols.json` (new) | The closed character → LaTeX table, including the special-character escapes; the Symbol PUA table without the large-bracket pieces; and the operator names (Decision 3) |
| `core/fixtures/math_rebuild.json` (new) | Invented inputs and their pinned outputs, read by the pipeline tests and `latex-symbols.test.ts` |
| `core/markdown.py` | New `escape_markdown_with_math(text)`. `escape_markdown` is unchanged |
| `connectors/gate/paper_parser.py` | `parse_paper` rebuilds every question and applies Decision 2. `_join_split_labels`' `replace()` sets the joined label's `raw_text` too. It uses core's `is_code_line`. `GateQuestion` gains `original_text`, `original_options`, `math_outcome` (`recovered`, `still_held`, `retypeset`, `kept`, `none`), `math_reasons` and `detector_math` (the first run's math details); none of these is stored |
| `connectors/gate/normalizer.py` | `PARSER_VERSION = "gate-2"`; uses `escape_markdown_with_math` for the text and options |
| `connectors/gate/run.py` | `_intake_item`'s fallback candidate uses `original_text` and `original_options`, and it raises if a candidate contains U+FDD0 or U+FDD1. `ImportReport` gains the counts (Decision 6) and prints "math: …", "re-typeset: …", and a line per kept-as-is question. New `write_report(reports, directory)` |
| `stages/publish.py` | `publish_question(..., on_near_duplicate="hold")` returns a `HeldResult` instead of raising in `_resolve_or_create_question`. That happens only when `check_duplicate` returned `unique`, `find_same_question` found nothing, and the `stable_content_id` belongs to a question with other content. Its `DedupeDecision` is complete, like `decide()`'s near duplicate: `similarity_score`, `existing_question_text`, `options_match`, `answer_match` and `suggestion` (Decision 4). The `"refuse"` default is unchanged |
| `connectors/gate/testing.py` (new) | `make_pdf`, `key_pdf` and `paper_page`, moved from `test_parser.py` (which imports them from here) |
| `connectors/gate/e2e_math_paper.py` (new) | The e2e fixture (Tests) |
| `cli.py` | `gate-import --report-dir DIR` |
| `connectors/gate/README.md` | The rebuild, `GATE_MATH`'s measured values, and how to refresh the report |

### Repository data (`docs/`)
- **New `docs/sources/reports/gate/`:** four JSON reports and their README (Decision 6), from the
  pilot run in acceptance step 11.
- **`docs/sources/gate.md`:** §4 and §9 say what's rebuilt, and what's still held, by kind, with a
  link to the reports.
- **`docs/specs/README.md`:** Spec 13's status.
- **`docs/adr/016-deterministic-rebuilds-are-parsing.md`:** Accepted when the owner approves this
  spec, and its proposed change to knowledge-index §4a applied.

### API (`packages/api`)
- **New `src/lib/latex-symbols.test.ts`.** It reads
  `apps/pipeline/prepora_pipeline/core/latex_symbols.json` and `core/fixtures/math_rebuild.json`
  (the same relative-path pattern as `packages/content/src/normalize.test.ts`). It renders every
  table entry and every fixture output with KaTeX `throwOnError: true` and `strict: "error"`, and
  `renderRichText` on the fixture outputs.
- `listDuplicateReviews` returns `format` on `candidate` and `existing` (correction in Decision 4). Otherwise no change to API code. The new `HeldResult` arrives through `/publish?on_near_duplicate=hold`
  like any near duplicate, and `holdPossibleDuplicate` (`src/routers/admin.router.ts`) stores it as
  it is. That works because its `DedupeDecision` fills every NOT NULL `duplicate_reviews` column
  (Decision 4).

### Web (`apps/web`)
- `components/review/DuplicateDecisions.tsx` shows a Markdown side rendered (correction in Decision 4).

### Tests (`tests/e2e`, and the fixture under `apps/pipeline`)
- **New `tests/e2e/acceptance/13-math-recovery.spec.ts`:** steps 1–10, one `acceptanceStep` each,
  with `checkAccessibility` on every page.
- **New `apps/pipeline/prepora_pipeline/connectors/gate/e2e_math_paper.py`,** run with the
  pipeline's Python and `DATABASE_URL=E2E_DATABASE_URL`, the way `global-setup.ts` runs
  `sync-sources`:
  - it builds the invented paper and key with `testing.py`'s `make_pdf`, `key_pdf` and
    `paper_page`;
  - it calls `import_paper` with `fetch` returning them, and `store=` a `FilesystemArtifactStore` in
    a temporary directory;
  - it prints the paper key, the batch id and the import report's lines as JSON.
- **Its `--cleanup` mode** deletes only the 2099 session and what hangs off it, like
  `07-intake.spec.ts`:
  - that session's question set, questions, occurrences, options and answers;
  - duplicate reviews and `question_variants` (wording variants) of those questions;
  - the paper's review batches and intake items;
  - the run's raw-artifact rows.

  It leaves everything shared, which other runs and the real pilot use: the rows
  `ensure_gate_registered` creates (the `ncb-gate` organization and the `gate` exam), the `cs`
  variant and the `computer-science` subject.

## Migration

None. There's no schema change: issues stay `[{code, detail}]`, and the candidate's shape doesn't
change.

## Tests

**Pipeline: `core/test_math_rebuild.py`.** It uses generated PDFs (`connectors/gate/testing.py`),
plus hand-built `Word`s and `Graphic`s where reportlab can't produce the case (PUA, math-italic raw
text, ℝ). Its outputs are pinned in `core/fixtures/math_rebuild.json`. It covers:
- **Scripts:**
  - an inline superscript becomes `$n^{2}$`;
  - a subscript row below its line becomes `$L_{1}$` and `$L_{2}$`;
  - a subscript and a superscript on one base;
  - a nested script;
  - a multi-token script;
  - a glued option "(A)2" with a superscript keeps "(A)" and rebuilds `2^{17}`.
- **Math runs and letters:**
  - a math-italic run becomes plain letters;
  - raw ℝ becomes `\mathbb{R}`;
  - an upright `log` becomes `\log`, and an upright word becomes `\text{…}`;
  - `\ ` appears only between tokens, never at a formula's edge;
  - a prose-font letter script becomes `\text{}`;
  - Times Italic emphasis isn't math;
  - a Symbol PUA glyph maps through the table, and a large-bracket piece is `unknown_symbol`.
- **Glued prose:**
  - "2³²-bit" is one word whose escaped text is `$2^{32}$-bit`, with no space;
  - "1M=2" with a superscript gives `1M=$2^{20}$`;
  - a `$…$` never comes directly before a digit.
- **Reasons:** every reason in `REBUILD_REASONS` has a case. Each of the four detector math rules
  left after a rebuild maps to its reason. Every rejected rebuild has at least one reason.
- **Unrebuildable constructs:** a double superscript and a prime after a superscript are
  `unclear_level`.
- **Bars and borders:** a thin filled bar between rows is `fraction`, and one above a formula is
  `overbar`. A table border near a formula is neither.
- **Fonts:** a subset-prefixed font name ("BCDGEE+CambriaMath") matches `math_fonts`. The module
  imports nothing from `connectors/`.

**Pipeline: `core/test_markdown.py`.**
- `escape_markdown_with_math`:
  - prose is escaped exactly as `escape_markdown` escapes it, and formulas come out verbatim;
  - a line can start with a formula;
  - unbalanced markers raise.
- `escape_markdown` gives byte-identical output to today's on the existing cases.

**Pipeline: `connectors/gate/test_parser.py` and `test_run.py`.**
- `parse_paper`, on an invented paper:
  - a held question is recovered, keeping its figure issue when it has one;
  - one that needs a fraction stays held with the original text and the `fraction` reason;
  - a question with a math run is re-typeset;
  - one with an unmapped symbol, or a thin drawn overbar, is kept byte-identical to the original
    and isn't held for math;
  - a question with no math run is byte-identical.
- `_join_split_labels` keeps `raw_text` consistent.
- **No candidate built by `_intake_item` ever contains U+FDD0 or U+FDD1,** including the fallback
  candidates of figure and image-option holds whose rebuild was accepted.
- `import_paper`, against the local database:
  - a recovered held item becomes `ready` and is batched;
  - a re-typeset `published` item becomes `ready` and is batched;
  - a kept-as-is `published` item stays `published`;
  - a second run writes no batch.
- `write_report`:
  - its output is stable and contains only counts;
  - `recovered + still_held == flagged`;
  - `retypeset + kept == clean_with_math_runs`.

**Pipeline: `stages/test_publish.py`.**
- A published question is re-published with heavily re-typeset text (similarity under 0.9) and the
  same position identity, with `on_near_duplicate="hold"`.
  - It returns a `HeldResult` naming that question.
  - Every field `duplicate_reviews` needs is set and well-formed: `similarity_score` (under 0.9 in
    this case), `existing_question_text`, `options_match`, `answer_match` and `suggestion`.
  - The decision is stored through the same insert `holdPossibleDuplicate` makes into
    `duplicate_reviews`, against the local database, and the insert succeeds.
  - Identical content (same wording, options and answer) is reused as today, not held.
  - Publishing again with `link_to_question_id` and `use_new_wording=True` updates it, and the old
    wording becomes a variant.
- With the default `"refuse"`, it still raises.

**API:** `latex-symbols.test.ts` (above).

**E2E:** `tests/e2e/acceptance/13-math-recovery.spec.ts`, steps 1–10. Steps 11 and 12 are done by
hand, with evidence in the PR.

## Owner checkpoints

- **Approve this spec** (the answers of 2026-10-16 are recorded above), which also accepts ADR-016.
- **The production re-run.** Running `gate-import` against production, and approving its batches,
  are the owner's (CLAUDE.md, Production safety). The PR says how many questions each paper's
  batches will hold, recovered and re-typeset.

## Risks

- **A wrong rebuild reads as authoritative, and any question can now be re-typeset.** Mitigations:
  - all or nothing per question: anything not fully explained keeps its current text (Decision 2);
  - overbars and fractions are detected, so a bar is never silently dropped (step 7);
  - a closed vocabulary, with the outputs pinned and rendered in tests;
  - every changed question goes through review;
  - step 12 hand-checks every recovered and re-typeset pilot question.
- **Review volume.** Every pilot question with a math run that isn't held goes back to review
  locally, including rejected ones (Spec 7's rule). The report counts them before the owner approves
  anything. Production has no published GATE questions today.
- **Thresholds from four papers.** The 2025 papers (a different organiser and template) differ from
  the 2026 ones, and `GATE_MATH` is measured on both. Other years may need a new profile, and the
  report's reasons show when they do.
- **Bar detection is new geometry.** A missed thin bar would let a formula be certified without its
  bar. Mitigations:
  - tests with drawn bars and table borders;
  - step 12's check for missing bars;
  - a miss blocks the merge.
- **The first re-run after Spec 12.** Spec 12 changed every GATE candidate's `text_format` and
  escaping, and both are hashed. If no `gate-import` has run locally since #94, the `gate-2` run
  sends every published local GATE question back to review anyway. That's Spec 12's change, and the
  PR says so.
- **Search and titles show LaTeX** for rebuilt questions (#96).
- **Knock-on effects on later specs** (ADR-016, Consequences):
  - **Spec 8's text precedence becomes a single official tier**: "official extracted text, rebuilt or
    not", then a licensed source's text, then AI transcription. Spec 8 says so when it's written in
    full.
  - **Spec 15's workload grows:** it inherits every still-held question, including those held for
    fractions and overbars. Its count of about 30 grows by those, as the reports' `still_held_by_reason`
    will show.
