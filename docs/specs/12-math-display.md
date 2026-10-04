# Spec 12 · Math display: Markdown and LaTeX on every question surface

**Issue:** #77
**Milestone:** Finish GATE
**Depends on:** Spec 7
**Production database:** yes. One additive migration (a `text_format` column with a default).
**Status:** Ready

## Context

GATE questions are full of mathematics: subscripts (L₁), superscripts (2³²), set and logic symbols
(∪, ∀, ⇒), fractions, Θ-notation, and code. Today every question surface shows text as plain text
(`whitespace-pre-line`). So even perfectly extracted math would read badly, and the GATE parser's
fenced code blocks (```` ``` ````) show as literal backticks.

This spec adds a **rich text format**: Markdown with LaTeX math (`$…$` inline, `$$…$$` display),
rendered on the server into HTML wherever a question, option or explanation appears. It's the
foundation of the "Finish GATE" milestone. Math recovery (Spec 13) and AI transcription (Spec 15)
produce this format, and figures (Spec 14) sit beside it.

## Deliverable and UI acceptance

When this is done, a question written in Markdown with LaTeX reads like the printed paper on every
page, and nothing about existing MS Learn questions changes. Checked by
`tests/e2e/math-display.spec.ts`, using an invented question seeded with `text_format = markdown`.

| # | Step | Expected |
|---|---|---|
| 1 | Open the question page of a Markdown question whose text contains `$L_1 \cup L_2$` | It shows L₁ ∪ L₂ as rendered math, with real subscripts, not the dollar-sign source |
| 2 | The same question has a display formula `$$\frac{n(n-1)}{2}$$` | It shows as a centred fraction on its own line |
| 3 | The same question has a fenced C code block | It shows as a monospace block with its indentation, not backticks |
| 4 | Its options contain math (`$\Theta(n^2)$`) | The options render Θ(n²) |
| 5 | Choose an answer and reveal it; the explanation contains math | The explanation renders its math too |
| 6 | Open the exam in Practice, both Learn and Simulation modes | The question, options and explanation render the same way |
| 7 | Open an MS Learn (plain) question that contains `*`, `_` or `$` characters | It looks exactly as before: the characters are shown literally, nothing is formatted |
| 8 | A Markdown question whose text contains `<img src=x onerror=alert(1)>` | It's shown as text; no image element or script is created |
| 9 | Open Admin → Review on a batch with Markdown questions | The batch preview renders the math and code the same way |
| 10 | Re-import a GATE paper (`gate-import`) and open its C-program question | The program shows as a code block, not as backticks |

## Scope

**In scope:**
- the `text_format` field: database, contract and publishing;
- a shared renderer;
- server-side rendering in every public question payload;
- client-side rendering on the admin review page;
- the GATE connector emitting `markdown`.

**Out of scope:**
- recovering math from PDFs (Spec 13);
- figures (Spec 14);
- transcription (Spec 15);
- stripping LaTeX from the search index (follow-up).

## Decisions

1. **Format, per question:** `questions.text_format`, either `plain | markdown`, default `plain`.
   - It applies to the question text, its options and its explanation together.
   - Everything published today stays `plain` and renders exactly as before (escaped text, line
     breaks kept).
2. **Markdown dialect:** CommonMark through `marked` (already a web dependency), with **raw HTML
   disabled**. Any HTML in the source is escaped and shown as text. Math is `$…$` and `$$…$$`,
   rendered by **KaTeX** (MIT) with `throwOnError: false` and `trust: false`. A formula KaTeX can't
   parse shows as its source in a red-outlined span, never as broken HTML.
3. **Rendering happens on the server** for public pages. The API returns `html` alongside the raw
   text in every question payload: question, options, explanation. Pages inject that HTML, so
   phones download no Markdown or KaTeX JavaScript. Only `katex.min.css` and its fonts load, and
   fonts load only when math is on the page.
   - The admin review page renders on the client with the same function, since admins are on
     desktops and batches are previewed before they're published.
4. **One renderer, shared:** `packages/api/src/lib/rich-text.ts` exports
   `renderRichText(text, format) → html`. It imports only `marked` and `katex`, so the web app can
   use it through `@prepora/api/src/shared`.
   - **Plain:** escape the text, and turn newlines into `<br>`.
   - **Markdown:**
     - math spans are protected before Markdown parsing, so `_` and `*` inside math aren't read
       as emphasis;
     - then Markdown, with HTML escaped;
     - then KaTeX renders the protected spans.
5. **The connector decides the format.**
   - GATE emits `markdown`. Its prose is escaped for Markdown (`*`, `_`, `` ` ``, `$`, `#` at a
     line start, `[`), so only intended formatting renders.
   - Its code is already fenced (#47).
   - MS Learn stays `plain`.
6. **Trust boundary:** the HTML injected into pages comes only from `renderRichText`, with raw HTML
   disabled and KaTeX `trust: false`. Step 8 of the acceptance checks this.

## Changes

### Database (`packages/db`)
- **`src/schema/shared.ts`:** a new enum `text_format` (`plain`, `markdown`).
- **`src/schema/questions.ts`:** `questions.textFormat`, not null, default `plain`.
- **Migration `0020_text_format.sql`:** additive, with a default and no back-fill. Production is
  migrated before merging, with the owner's go-ahead.

### Pipeline (`apps/pipeline/prepora_pipeline`)
- **`contracts/normalized_question.py`:** `text_format: Literal["plain", "markdown"] = "plain"`.
  The contract version goes to `"6"`.
- **`stages/publish.py`:** writes `text_format` on insert. When a reviewer keeps the new wording,
  it's updated too.
- **`connectors/gate/normalizer.py`:** `text_format="markdown"`, with prose escaped through a new
  `core/markdown.py` `escape_markdown(text)`. Code fences are left alone.

### API (`packages/api`)
- **New `src/lib/rich-text.ts`:** `renderRichText`, plus tests covering:
  - plain;
  - inline and display math;
  - code;
  - emphasis kept out of math;
  - escaped HTML;
  - a KaTeX error.

  It's re-exported from `src/shared.ts`.
- **Payloads gain `html` fields:**
  - `questions.getBySlug`: `textHtml`, and `html` on each option;
  - `submitAnswer`: `explanationHtml`;
  - `loadQuestionsWithAnswers`, used by exams/practice and topics/subjects: `textHtml`, option
    `html`, `explanationHtml`.

  Raw text fields stay for search, JSON-LD and the page title.
- **`package.json`:** add `katex`.

### Web (`apps/web`)
- **New `app/components/question/RichText.tsx`:** renders a payload's HTML in a `div` with the
  existing typography classes; it's the only place that injects HTML.
- **Pages:** the question page (stem, options, explanation), practice (Learn and Simulation), and
  the topic and subject lists use `RichText`.
- **Admin review** renders the elements' `normalized.question_text` with `renderRichText` when
  `normalized.text_format` is `markdown`.
- **Global CSS:** import `katex/dist/katex.min.css` and style code blocks.

## Tests
- **API:** renderer unit tests, and payload tests asserting `textHtml` and option `html`.
- **Pipeline:** `escape_markdown`; GATE candidates are `markdown`; publishing writes `text_format`.
- **E2E:** `tests/e2e/math-display.spec.ts` covers acceptance steps 1–9. Step 10 is checked by the
  pipeline test, plus a manual re-import noted in the PR.

## Owner checkpoints
- The production migration (`0020`).
- A `ui-change` PR: the owner checks the acceptance steps in the UI and adds `owner-verified`.

## Risks
- **KaTeX coverage:** some LaTeX won't parse. Errors render visibly as source rather than breaking
  the page, and Spec 13's measurement report counts them.
- **Search:** the full-text index now contains `$` and LaTeX commands. Matching on words still
  works; stripping LaTeX for the index is a follow-up.
- **Escaping:** prose that genuinely contains Markdown syntax (a `*` in a C pointer outside a code
  block) must be escaped, or it renders as emphasis. `escape_markdown` is tested on real GATE
  lines.
