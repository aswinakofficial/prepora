# Spec 14 · Figures and image options from the PDF

**Issue:** #79
**Milestone:** Finish GATE
**Depends on:**
- Spec 4 (R2 media storage; Done). The owner's bucket is live on its `r2.dev` address, and
  `MEDIA_PUBLIC_BASE_URL` is set on Cloudflare Pages. The custom domain is #82, a one-setting change
  that this spec doesn't need.
- Spec 12 (Markdown and LaTeX display; Done, #94).
- Spec 13 (math rebuild, parser `gate-2`; Done, #100).

**Design:**
- [ADR-016](../adr/016-deterministic-rebuilds-are-parsing.md): a crop of the official page is
  parsing, not a revision (its Consequences say so for this spec).
- [ADR-017](../adr/017-images-in-question-identity.md) (Proposed with this spec): a question's images
  are part of what it is, for dedupe (Decision 9).

**Production database:** no migration. The `media` table (`packages/db/src/schema/questions.ts`)
already has every column a crop needs: `storage_key`, `mime_type`, `size_bytes`, `alt_text`,
`placement`, `option_key` and `position`. A question's `media` rows cascade when it's deleted.
Production has no published GATE questions, and 0 `media` rows (the lead, 2026-10-18). Figure
questions reach production only when the owner re-runs `gate-import` against production and approves
the batches, with `MEDIA_STORE=r2`, so that publishing uploads each crop to R2 first (Spec 4). That's
the owner's go-ahead, as for every import.
**Status:** Draft, for the owner's approval

## Owner decisions (2026-10-18)

The owner answered the spec's four questions on 2026-10-18:

1. **Alt text is a template.** For example "Figure for Q.5 of GATE 2026 CS-1, as printed in the
   official paper", and "Option A of Q.2 of GATE 2026 CS-1, as printed in the official paper". There's
   no AI in this spec. Spec 15 may add AI-written descriptions later, under ADR-015 (optional, flagged
   and confirmed). See Decision 6.
2. **Image options: hide the placeholder on the page.**
   - The stored option text is "(see image)".
   - It's hidden wherever the option shows its picture.
   - It's still shown in the correct-answer line and in search.

   See Decision 7.
3. **Figure labels go in the image only.** Words printed inside a vector figure are taken out of the
   question's text, because they're visible in the crop. See Decision 2.
4. **Go live now, on `r2.dev`.** The owner re-runs the import against production and approves the
   batches after release. #82 (the custom domain) is done before the site is promoted. See
   Decision 11.

## Context

Design: [knowledge-index §4a](../architecture/knowledge-index.md), the remediation ladder's steps 2
and 3 ("a page crop", "figures cut out of the page"), read through ADR-016.

The GATE parser already knows two things:
- **each question's region** on each page (`paper_parser.py` `_regions`, stored as
  `intake_items.regions`, with 0-based page numbers);
- **everything drawn on the page** (`core/pdf_text.py` `Graphic`: images, rects, lines, curves).
  Page furniture repeated on most pages, such as the watermark and the logo, is removed by
  `strip_running_graphics`.

**What's already in place:**
- `core/pdf_text.py` `render_region` renders any box of a page as a PNG through pypdfium2. Nothing
  calls it yet.
- Publishing records `NormalizedQuestion.media` as `media` rows, and copies them to R2 when
  `MEDIA_STORE=r2` (`stages/publish.py` `upload_missing_media`, `_record_media`).
- The question page and practice show `question` and `option` images
  (`apps/web/app/components/question/QuestionImages.tsx`), below the text they belong to.

So the missing piece is the pipeline: finding the figure, cropping it cleanly, and attaching it to the
candidate.

### Measured on the pilot (the lead, fresh local scratch database, current code, 2026-10-17)

`gate-import --all-pilot` recorded **260 questions: 184 ready and 76 held.**

**Held questions by issue combination:**

| Issues | Questions |
|---|---|
| figure | 21 |
| layout | 20 |
| math | 11 |
| layout + math | 11 |
| figure + layout + math | 5 |
| figure + layout | 3 |
| figure + math | 2 |
| figure + image_option | 2 |
| figure + image_option + layout | 1 |

**Detector rules on held questions** (a question can have more than one):

| Rule (`core/quality.py`) | Questions |
|---|---|
| "something is drawn in the question" (`figure`) | 34 |
| "wide gaps inside a line" (`layout`, mostly tables) | 40 |
| "an option has no text" (`image_option`) | 3 |

**The 34 figure holds, by what's drawn inside the question's stored region:**

| Drawn | Questions |
|---|---|
| raster images only | 22 |
| vector only (lines, curves, rects) | 7 |
| mixed | 5 |

Two of the 22 "raster only" have **zero objects inside the stored region**: 2025 CS-1 Q.21 and Q.55.
The lead investigated them on 2026-10-18 (below).

**The 3 image-option questions:**
- 2025 CS-1 Q.9 (mixed vector);
- 2025 CS-2 Q.4 (mixed vector);
- 2026 CS-1 Q.2 (6 raster images).

**Every page carries furniture:** a large watermark and a logo (about x 72–114, top 17–77). The
watermark sits behind most question regions, and **its place differs by paper**:

| Papers | Watermark, about (x0, top) to (x1, bottom) |
|---|---|
| 2026 | (104, 149) to (491, 693) |
| 2025 | (72, 207) to (523, 658) |

So furniture can't be fixed coordinates. It's detected per PDF (Decision 1, step 1). Crops and
figure detection must both exclude it. Detection already does (`strip_running_graphics`), but
rendering draws the whole page today.

### How the furniture is drawn (the lead, pypdfium2 5.13.0, 2026-10-18)

| Object | 2025 papers | 2026 papers |
|---|---|---|
| Watermark | a top-level image | a top-level **form XObject**, at about (104, 149) to (491, 693). It's faint (at most 10/255 from white), but covers about 24% of its box |
| Logo | a top-level image | a top-level image |

- Removing the object is honoured when rendering, in both papers. For the 2025 watermark, 22,178
  pixels change, all inside its box.
- Nothing is nested deeper than top level.
- pypdfium2 5.x reads an object's box with `get_bounds`, not `get_pos`.

### The two questions with zero objects inside their region (the lead, 2026-10-18)

2025 CS-1 Q.21 and Q.55:
- **The figure is wider than the text column.**

  | Question | Image spans x | Region's right edge |
  |---|---|---|
  | Q.21 | 112–551 | 526 |
  | Q.55 | 118–531 | 526 |

  Detection already sees each figure, because it overlaps the region. But a crop clipped to the
  region would cut it off. So a crop uses the graphic's own box, and isn't clipped to the region
  (Decision 1, step 8).
- **The 2025 papers draw each question inside a frame of thin rules.** These are rects about 1pt
  wide or high at the region's edges: x 72–73, x 107, and the row at y ≈ 161, for example. They're
  layout, not figures. `_is_figure` already ignores them, because it only counts a rect wider and
  taller than 2pt. But figure grouping and crop boxes must ignore them too, or one rule along a
  frame would join a figure to the frame (Decision 1, step 3).

### What the code does today, and what that means here

- **Detection overlaps; it doesn't contain.** `detect_issues` (`core/quality.py`) and
  `paper_parser.py` `_inside` count a graphic when it **overlaps** a region.
- **Furniture is matched by rounding.** `strip_running_graphics` keys a graphic by
  `(kind, round(x0), round(top), round(x1), round(bottom))`, per PDF. So it already copes with each
  paper's watermark being in its own place. But a graphic at 104.4 on one page and 104.6 on another
  rounds to two different keys, so it isn't furniture on either page.
- **Regions are the text column.** Their right edge is `page.width − MARGIN_X + CROP_PADDING`
  (526pt on the pilot papers), and some figures are wider than that.
- **Continuation-page regions start at 54pt** (`RUNNING_BAND` − `CROP_PADDING`), above the logo's
  bottom edge (about 77pt).
- **Vector figures carry text.** Labels in a drawing (node names, axis values) are extracted as
  words, so they're in the question's text today. They can also trigger `layout` (wide gaps) and
  `math` (single tokens stacked on 3+ lines) on their own.
- **A drawn `line` is a figure** for `_is_figure`. So a fraction bar or an overbar drawn as a line
  holds its question as a figure (Spec 13, Decision 1, step 7). It isn't a figure to crop.
- **Image options have no text,** and `NormalizedOption.text` requires at least one character
  (`contracts/normalized_question.py`). So `to_normalized` raises today, and the candidate is the
  fallback built in `run.py` `_intake_item`.
- **Spec 13's `_rebuild` re-reads the question on its own.**
  - It calls `_read(rebuilt)` and `detect_issues` again, on the block it was given, with no notion
    of crops.
  - Given the original block, it would bring back the label words, read image options as "" again,
    and flag the cropped figure again.
  - So it must get the figure stage's output (Decision 5).
- **Dedupe compares options by text** (`dedupe/fingerprint.py` `AnswerShape`). Four image options
  with the same placeholder text collapse into one entry, which always "matches" the answer. So two
  different image-option questions with the same stem would be published as one question
  (ADR-017).
- **Re-publishing doesn't replace images.** `_record_media` only adds rows, and
  `_link_to_existing_question` never removes old ones. So "same question, use the new wording" with a
  new crop would show both crops, and "keep the published version" would still add the new one.
- **R2 isn't fenced off from local runs.** `media_store_from_env()` returns the R2 store whenever
  `MEDIA_STORE=r2`, whichever environment is running. The lead checked on 2026-10-18: the local
  `.env` has `MEDIA_STORE` empty, but two `STORAGE_*` values set. Local and e2e runs must never
  reach the production bucket (Decision 8).

## Deliverable and UI acceptance

When this is done:
- **A GATE question held only for its figure** is published with that figure: cropped from the
  official page, without the watermark or logo, below its text, crisp on phones and desktops.
- **A question whose options are pictures** shows each option's own picture, A–D. Choosing and
  revealing work by the official key.
- **A question also held for something else** (math, a table) gets its crop, but stays held for
  that issue.
- **A figure the parser can't crop cleanly** keeps its text and stays held, with a named reason.
  Nothing half-cropped reaches the site, and nothing carries a label (ADR-016).

**The e2e test and its fixture.** Steps 1–10 are checked by `tests/e2e/acceptance/14-figures.spec.ts`.
- **Setup:** it runs `python -m prepora_pipeline.connectors.gate.e2e_figures_paper` (Changes). That
  module generates an invented 7-question paper laid out like GATE, three pages long, and its key, with
  reportlab. Then it runs the real `import_paper` on them.
- **Its own names:** the paper is `GATE 2098`, sitting `E2E-<random>`. Its URLs are under
  `https://gate-figures.example.test`. Spec 13's fixture uses 2099 and `https://gate.example.test`,
  and its cleanup deletes by that year and that URL prefix. So each fixture's cleanup only touches its
  own rows.
- **Crops** go to a media directory of the test run's own (Changes, `playwright.config.ts`).
- **What it prints:** the JSON output includes each invented question's stem, so the test can find
  its questions.
- **Cleanup:** the test removes everything it created.

**Every page of the invented paper** carries the same two furniture objects, at the same place:
- a large, light watermark in one distinctive colour (the "watermark colour"), drawn as a reportlab
  form (`beginForm`/`doForm`), like the 2026 papers;
- a small raster logo near the top left, in another (the "logo colour").

No figure in the fixture uses either colour.

| # | What it contains | What the parser should do |
|---|---|---|
| Q.1 | a vector drawing (a circle, two lines and a rectangle outline), about 300pt wide, with two invented label words inside it | crop it as one figure; the labels leave the text |
| Q.2 (NAT) | an embedded invented raster (generated in memory with Pillow), drawn 240 × 160pt | crop it as one figure, with its 3:2 shape |
| Q.3 | options (A)–(D) with no text, each followed by its own small invented raster | crop four option images; the key is C |
| Q.4 | a vector drawing with one invented label word, at least 40pt above a stacked fraction (a thin filled bar between two short rows, as in Spec 13's Q.4) | crop the figure, and take the label out of the text; the question stays held for the fraction |
| Q.5 | a filled box drawn across a line of prose | keep it held: the text runs into the drawing |
| Q.6 | plain prose, nothing drawn | leave it alone |
| Q.7 | a word underlined by a drawn 0.5pt line, nothing else drawn | keep it held: a rule isn't a figure |

| # | Step | Expected |
|---|---|---|
| 1 | Import the invented paper, then open Admin → Held questions | The paper's row reads Ready 0, In review 4, Published 0, Held 3, Rejected 0, with "1 · Math that didn't extract cleanly" and "2 · Figure or image" |
| 2 | Click "Show held questions" on that paper | Q.4, Q.5 and Q.7 are listed. Q.4's reasons include "Math that didn't extract cleanly: the rebuild found a fraction, which it doesn't rebuild", and no "Figure or image" reason, and its text preview doesn't contain its label word. Q.5's include "Figure or image: a line of the question's text runs into the drawing". Q.7's include "Figure or image: the drawing is only a rule (a fraction bar, an overbar or an underline)". None of the three previews contains Q.1's label words |
| 3 | Open Admin → Review and find the paper's batch | It holds Q.1, Q.2, Q.3 and Q.6, with no badge on any. Q.1's preview shows its text, then one image. Q.3's preview shows one image under each of A, B, C and D, and no option reads "(see image)". Every image has loaded (`naturalWidth > 0`). Q.1's preview text contains neither of its label words |
| 4 | Approve the batch, then open Q.1's question page | The readable text is the invented stem, without the label words. The question area has exactly one image, after the text. Its `alt` is Q.1's alt text (Decision 6). Its URL answers 200, `image/png`, with `Cache-Control: public, max-age=31536000, immutable`. Drawn onto a canvas, it has no pixel of the watermark colour or the logo colour |
| 5 | View Q.1's page at 390 × 844 (device scale 3), then at 1280 × 800 | On both, the image fits its column and the page doesn't scroll sideways. On the phone, its natural width is at least twice its displayed width. On the desktop, it's never shown wider than its natural width |
| 6 | Open Q.2's question page | One image, after the text. Its natural width ÷ natural height is 1.5, within 2% |
| 7 | Open Q.3's question page; choose C and reveal the answer. Reload, choose A and reveal | Each option A–D shows one image, and the four images have four different URLs. No option shows the text "(see image)". C is marked correct, and the correct-answer line reads "C · (see image)". After reloading, A is marked wrong and the same line shows C as the answer |
| 8 | Open `/practice?examSlug=gate&viewMode=learn`, and move through the questions until the readable text matches the invented Q.1's stem, then Q.3's | Q.1's figure and Q.3's four option images show as on their question pages. Answering Q.3 with C is marked correct |
| 9 | Open Q.6's question page | Its text reads as printed, and the page shows no question or option image |
| 10 | Import the same invented paper again, then reopen Admin → Held questions, Admin → Review and Q.1's page | The row reads 0 / 0 / 4 / 3 / 0 (the four were published in step 4), there's no new batch for the paper, and Q.1's page still shows exactly one image |
| 11 | **Pilot, by hand:** on a fresh local database (`scripts/dev-db.sh`), run `gate-import --all-pilot --report-dir docs/sources/reports/gate` | The four committed reports gain a `figures` section (Decision 10). For each paper, `recovered + still_held == flagged`. Admin → Held questions' "Figure or image" total equals the reports' `figures.still_held` sum. 2025 CS-1 Q.21 and Q.55 are recovered, unless a reason other than their width holds them. The PR states how Spec 13's math counts changed (Decision 10) |
| 12 | **Pilot, by hand:** compare **every** pilot crop with its page in the official PDF. Recovered questions are in Admin → Review. For questions still held for something else, use the local crop paths `gate-import` prints (Decision 10) | Each crop shows the whole figure: nothing cut off, no watermark or logo, and no other question's text. Each recovered question's text has no stray label words, and every word removed from it is visible in the crop. Each image option shows the right picture under the right letter. The PR lists each question by paper and number, with pass or fail |

**How the hand-checked steps are run:**
- Steps 11 and 12 need the real papers, which CI never fetches. The builder runs them locally and
  puts the report diff and the per-question pass/fail list in the PR. The screenshots of each crop
  next to its PDF page show official question text, so like the pilot PDFs and the crops they stay
  out of the repository and the PR (CLAUDE.md, Content policy): the builder keeps them locally and
  the lead checks them, as in Spec 13.
- Any crop that's wrong in step 12 is a bug that blocks the merge.
- **The production check is the owner's,** after release (Owner checkpoints).

**How step 8 finds the invented questions.** The database may also hold other GATE questions, such as
the pilot's. So the test doesn't assume an order.
- It reads Q.1's and Q.3's stems from the fixture's JSON output.
- It steps through practice with Next until the readable text matches.
- It fails if it reaches the end without finding them.

## Scope

**In scope:**
- **A shared figure stage, `core/figures.py`,** on `core/pdf_text.py` words and graphics, with no
  connector dependency. It finds each question's figures, decides what they own, and gives crop
  boxes (Decisions 1–3).
- **Furniture-free rendering:** `render_region` leaves out the page's furniture objects
  (Decision 4).
- **Image options:** one `option` image per option (Decision 7).
- **All or nothing per question** for figures, before Spec 13's rebuild (Decision 5).
- **GATE using it** (`paper_parser.py`, `run.py`, `normalizer.py`), with the parser version going to
  `gate-3`.
- **Crops stored locally at import, and uploaded to R2 at publish.** R2 is reachable only in the
  production environment. Plus `media-sync --check` (Decision 8).
- **Dedupe and publishing made image-aware** (Decision 9, ADR-017).
- **Images in the review preview** (Admin → Review) and on the possible-duplicate screen.
- **The release check:** `/api/health` names one published image, and the post-deploy smoke test
  loads it (Decision 11).
- **The counts-only report** gains a `figures` section (Decision 10).
- **The e2e acceptance test,** with generated PDFs.

**Out of scope** (follow-up issues, opened with this spec's PR):
- **Tables and side-by-side layouts** (the 40 `layout` holds), including tables drawn with lines.
  They aren't figures: a table cropped as an image would hide text the PDF has. They stay held for
  Spec 15 (AI transcription), which inherits every question this spec leaves held.
- **Inline figure placement.** Images show below the text they belong to, as `QuestionImages`
  already does. Placing a figure at its exact spot in the text needs a renderer change (Spec 12
  shows Markdown images as their alt text).
- **The image's display size in the database** (`width` and `height` on `media`, to avoid layout
  shift while images load). It needs a migration, and nothing here depends on it.
- **WebP, or several sizes per image** (`srcset`).
- **AI-written image descriptions.** Spec 15 may add them, under ADR-015 (owner, 2026-10-18).
- **Removing crops no question uses any more** from the local store and R2. Keys are
  content-addressed, so an old crop is harmless.
- **The custom media domain** (#82, already open).
- **Other GATE papers and years.** They reuse the stage with the same profile, checked again when
  they're added.

## Decisions

### 1. What a question's figure is, and what it owns

`find_figures(lines, regions, pages, all_words, markers, profile) -> FigureResult`
(`core/figures.py`) works on one question.
- **Its thresholds** come from a `FigureProfile`, like `QualityProfile` and `MathProfile`.
  `GATE_FIGURES` holds `cluster_gap`, `padding`, `label_gap`, `label_max_words`, `rule_thickness`,
  `furniture_tolerance` and `wide_gap`. `wide_gap` is set from `GATE_QUALITY.wide_gap` (40pt) in
  `GATE_FIGURES`, so the shared `core/figures.py` never reads a source's quality profile. Their
  values are measured on the four pilot papers while building, and
  recorded with a comment, as `GATE_QUALITY` was.
- **`all_words`** is every word `extract_pages` returned, by page, before `strip_running_text` and
  `_take_margin`: margin headings, section titles, every "Q.n" label. The foreign-word checks
  (steps 7 and 8) use these, so nothing printed on the page can slip into a crop unnoticed.

**The steps:**

1. **Furniture is detected per PDF, with a tolerance, never by fixed coordinates.** The watermark is
   in a different place in 2025 and 2026 (Context). `running_graphics(pages, *, min_share=0.6,
   tolerance=2.0)` (`core/pdf_text.py`) works on one PDF's pages:
   1. **Group the graphics.** Take the PDF's graphics in page order. Put each into the first group
      of the same kind whose representative box matches it: all four edges within `tolerance`
      points. If none matches, start a new group with it as the representative. Kinds are image,
      rect, line and curve, so a watermark drawn as vector paths is found too.
   2. **Count pages.** A group is furniture when its graphics are on at least `min_share` of the
      PDF's pages, and on at least 2.
   3. **Return** the furniture graphics by page.

   `strip_running_graphics` uses it in place of its rounding. The parser keeps the list, for
   rendering (Decision 4). The 2025 frame rules that repeat at the same place on most pages become
   furniture too, which is harmless: they're never figures (step 3).
2. **Ownership is by centre.** A graphic belongs to the question whose region contains its centre.
   A graphic that only overlaps a region's edge belongs to the question its centre is in.
   - `detect_issues` uses the same rule for "something is drawn in the question", through a shared
     `owns(region, graphic)` in `core/quality.py`. So detection and cropping always agree, and
     `paper_parser.py` `_inside` is replaced by it.
   - **A figure wider than the text column** (2025 CS-1 Q.21 and Q.55) has its centre inside its
     question's region, so it belongs to that question. Its crop is its own box (step 8).
   - **Continuation pages are fine.** A continuation page's region starts at 54pt, above the logo's
     bottom edge (about 77pt). The logo's centre is at y ≈ 47, outside that region, so no question
     owns it. It's furniture anyway, and any furniture that intersects a crop is removed before
     rendering (Decision 4).
3. **Figure graphics.** A figure's graphics are the question's owned graphics for which `_is_figure`
   is true.
   - **Thin rules are never part of a figure.** These are rects 2pt or less in width or height, such
     as the 2025 frames around each question (x 72–73, x 107, the row at y ≈ 161). `_is_figure`
     already rejects them, and it's also the filter for grouping (step 4) and crop boxes (step 8). So
     a frame rule can't join a figure to the frame or widen a crop.
   - A figure's own thin strokes inside its crop box are still drawn, because the crop renders the
     page box.
4. **Clusters.** Figure graphics whose boxes come within `cluster_gap` of each other, on one page,
   form one cluster. Each cluster is one image.
5. **Labels.** A word of the question is a label of a cluster when its line qualifies:
   - **Where it is:** the word's box is inside the cluster's box. Or it's within `label_gap` of the
     box, and its whole line lies within the box widened by `label_gap`.
   - **Its line:** has at most `label_max_words` words, and isn't monospace (`is_code_line`). That
     applies inside the box too.

   The cluster's box grows to include its labels, and this repeats until nothing changes.
6. **Text inside a drawing that isn't labels: `text_inside`.** A line inside the cluster's box that
   fails the line test in step 5 is prose, a table or code, framed or ruled. Cropping it would publish
   text as a picture. That covers:
   - a line with more than `label_max_words` words;
   - a monospace line (code in a box);
   - two or more lines inside the box with a gap of at least `profile.wide_gap` between two of their
     words (a table drawn with lines).

   Tables stay out of scope (Scope).
7. **What else isn't a figure:**
   - **`rule_only`:** a cluster that is only rules. That's either of these:
     - all its graphics are horizontal, and no thicker than `rule_thickness` (2pt, `_is_figure`'s
       and `GATE_MATH`'s limit);
     - all its graphics are straight thin strokes (lines, or rects no thicker than `rule_thickness`),
       and its box holds a math-font word (`font_family` in `GATE_MATH.math_fonts`).

     That's a fraction bar, an overbar, a root or an underline. It's math or text, which Spec 13 or
     Spec 15 owns.
   - **`text_overlap`:** either of these.
     - **A line split by the box:** some of its words are inside the cluster's box and some are
       outside. That's prose running into a drawing, or a frame around text. Cropping it would cut a
       sentence in two.
     - **A foreign word inside the box:** a word from `all_words` that isn't this question's, such as
       a margin heading, a section title or another question's "Q.n" label.
8. **Crop box: the graphics' own box, not the region.** It's the cluster's box (its figure graphics
   and labels), plus `padding` (6pt, `CROP_PADDING`) on each side.
   - It **isn't clipped to the question's region**, so a figure wider than the text column (Q.21
     spans x 112–551 against a region edge of 526) is cropped whole.
   - The padding shrinks on any side where it would take in a word from `all_words` that isn't the
     cluster's.
   - The padding is clamped to the page.

**Placement:**
- **`question`:** a cluster above the first option marker's line, or any cluster of a question with
  no options. Positions run in reading order: page, then top, then left.
- **`option`:** a cluster in the options (Decision 7).

**Whole question or figure only: figure only.** A crop of the whole question would publish its text
as a picture, which can't be searched, read aloud or rendered as math. The owner's plan for the rest
is the PDF rebuild and AI transcription (README, "Finish GATE"; ADR-015, 2026-10-04 amendment).

### 2. Words that belong to a figure leave the text

**Owner, 2026-10-18: image only.** A cluster's labels (Decision 1, step 5) are removed from the
question's lines before its text is read, so they're shown only in the image.
- They're printed inside the figure, so the crop shows them where they belong. In the text they'd
  read as stray tokens ("P Q 3 5").
- Only short, non-monospace lines are labels. A line that would be split by the crop, or that reads
  as prose, a table or code, holds the question instead (`text_overlap`, `text_inside`).
- Step 12 checks that every removed word is visible in its crop.

### 3. Raster and vector figures are both rendered, never extracted

Every crop is a render of the page box (Decision 4), whatever's inside it.
- **Why not extract embedded images:** a figure is often a raster with vector arrows or labels drawn
  on top (5 of the pilot's figures are mixed). Extracting the raster would lose them. Rendering also
  avoids colour-space, mask and rotation handling.
- **The cost:** a raster's own resolution above the render's DPI is lost, which doesn't show at the
  sizes the site displays.

### 4. Rendering: 200 dpi PNG, without the furniture

`render_region(pdf_bytes, page, bbox, *, dpi=200, exclude=())` (`core/pdf_text.py`):
- **What's excluded:** only the page's furniture graphics (Decision 1, step 1) whose box
  **intersects the crop box**. Furniture elsewhere on the page doesn't matter to the crop.
- **How:**
  1. Read the page's top-level objects (`PdfPage.get_objects`), whatever their type: image, form
     XObject or path.
  2. Convert each object's bounds to the parser's coordinates. pypdfium2 5.x `get_bounds` gives
     (left, bottom, right, top) in PDF space, with the origin at the bottom left. The parser's boxes
     have it at the top left. So, with the page's media box (x0, y0, x1, y1):
     `x0' = left − x0`, `top' = y1 − top`, `x1' = right − x0`, `bottom' = y1 − bottom`.
  3. Remove each object whose converted box matches an excluded graphic's within
     `furniture_tolerance`, with `remove_obj`, then `gen_content()`.
  4. Render.

  This finds the 2025 image watermark and the 2026 form-XObject watermark alike, and both removals
  are honoured (the lead, pypdfium2 5.13.0, 2026-10-18). The document is opened fresh for every
  render, so nothing leaks between crops.
- **`furniture` is only a fallback:** an excluded graphic with no matching top-level object makes
  the crop fail with `furniture`, and the question keeps its figure issue (Decision 5). On the pilot,
  nothing is nested, so it shouldn't happen there.
- **Attribution survives.** Removing the watermark and logo from a crop removes no attribution. The
  page names the official paper, and so does the image's alt text (Decision 6). The paper's URL is on
  each crop's `NormalizedMedia.source_url` in the candidate. The `media` table has no source column,
  and `_record_media` doesn't store it. The published question records its source through its
  occurrence and its provenance.
- **200 dpi,** as `docs/sources/gate.md` §8 planned. A 300pt-wide figure becomes 833 pixels, enough
  for a 390-pixel phone column at device scale 2 and a desktop column at its natural size. There's
  one file per image, shown by `QuestionImages` with `max-w-full h-auto`, so phones scale it down and
  desktops never scale it up.
- **PNG, lossless.** Figures are line art and text, which lossy formats blur. PNG is what
  `render_region` writes, every browser shows it, and `MediaStore` already accepts it. WebP is a
  follow-up.
- **Deterministic bytes.** The same PDF, through the same code, gives the same PNG, and PNG through
  Pillow has no timestamp. `requirements.txt` pins `pypdfium2==5.13.0` and `Pillow==12.3.0`, the
  versions installed in `apps/pipeline/venv` on 2026-10-18. A renderer upgrade changes every crop's bytes,
  so its key and the candidate's content hash, and sends every figure question back to review (Risks).
- **Size limit:** a crop over `MAX_BYTES` (5 MB, `core/media_store.py`) fails with **`too_large`**.

### 5. All or nothing, per question, before the math rebuild

`parse_paper(pages, *, no_figures=frozenset())` runs the figure stage for every question whose first
detector run has a `figure` or `image_option` issue, unless its number is in `no_figures`. Then the
question either has every figure explained, or nothing changes.

1. **`find_figures`.** It's **accepted** when it has no reason, every owned figure graphic is in a
   cluster, and every option with no words of its own has exactly one image (Decision 7).
2. **Accepted:**
   - the clusters' labels are removed from the block's lines (Decision 2), which gives the **figure
     block**;
   - `_read(block, image_options=…)` reads the text and options. An option with no words and an
     assigned cluster gets `IMAGE_OPTION_TEXT` there, inside `_read`, so every read of the question
     agrees, the rebuild's included;
   - `detect_issues` runs again on the figure block, with the crop boxes as `covered`. In "something
     is drawn" it ignores graphics inside a covered box. In "a tall block with almost no words" it
     subtracts the covered height from the block's. That run is the question's **first run** for
     Spec 13. So a `layout` or `math` issue that only the label words caused clears, and any other
     issue stays.
   - **Spec 13's `_rebuild` gets the figure block, `covered` and the image options.** Its own
     `_read` and its second `detect_issues` run see the same lines, placeholders and crops. So it
     can't bring back a label word, an empty option or a figure issue. Its `graphics` leave out the
     clusters' graphics.
3. **Not accepted:**
   - the question keeps its lines, text and options unchanged;
   - it keeps its first run's issues, plus one `figure` issue per reason, e.g. `{code: "figure",
     detail: "a line of the question's text runs into the drawing"}`;
   - it has no crop.

   Spec 13's rebuild then runs on it as today.
4. **Rendering happens in `run.py`,** which has the PDF's bytes (Decision 8), and only after the
   paper's key joins completely. An incomplete join writes nothing, as today, and renders nothing.
   - A crop that fails to render (`furniture`, `too_large`) makes the question "not accepted".
   - `run.py` calls `parse_paper(pages, no_figures={those numbers})` once more, and adds each
     question's reason.
   - So no question ever has only some of its crops.

**A figure doesn't clear other issues.** A question with an accepted figure and a math, layout or
type issue left stays held for that issue, with its crops in its candidate. When Spec 13 or 15
clears it later, the crops are already there. That's intake's rule (any issue holds, Spec 7), and
Spec 13's ("a rebuild never clears a non-math issue").

**The reasons** are a closed list, `FIGURE_REASONS` in `core/figures.py`. Each has a sentence, shown
as "Figure or image: …" in Admin → Held questions:

| Code | Sentence | From |
|---|---|---|
| `text_overlap` | a line of the question's text runs into the drawing | Decision 1, step 7 |
| `text_inside` | the drawing contains text that reads as prose, a table or code | Decision 1, step 6 |
| `rule_only` | the drawing is only a rule (a fraction bar, an overbar or an underline) | Decision 1, step 7 |
| `option_unassigned` | a drawing in the options doesn't belong to exactly one option | Decision 7 |
| `option_missing_image` | an option with no text has no drawing | Decision 7 |
| `furniture` | the page's watermark or logo couldn't be left out of the crop | Decision 4 |
| `too_large` | the crop is larger than the media store accepts | Decision 4 |
| `nothing_drawn` | the question is a tall block with almost no words, and nothing drawn to crop | a "tall block" hold with no figure graphics |

No new issue code is needed, so `ISSUE_CODES` and `ISSUE_LABELS` don't change.

**Why:** a crop that's missing part of a figure, or text that's lost a line to the crop, reads as
authoritative and wrong (ADR-016, decision 3). Leaving the question as it was means Spec 15 and the
reviewer see what the PDF really gave.

### 6. Alt text: a template, no AI

**Owner, 2026-10-18: a template.** There's no AI in this spec, so the alt text comes from what the
parser knows. Spec 15 may add AI-written descriptions later, under ADR-015 (optional, flagged and
confirmed).
- **`question` images:** "Figure for Q.5 of GATE 2026 CS-1, as printed in the official paper". With
  more than one figure: "Figure 2 of 3 for Q.5 of …".
- **`option` images:** "Option A of Q.2 of GATE 2026 CS-1, as printed in the official paper".

The text is built by `figure_alt_text(paper_title, label, placement, option_key, index, count)` in
`connectors/gate/normalizer.py`, because it names the paper the way the connector does. It stays under
`NormalizedMedia.alt_text`'s 500 characters.

### 7. Image options

**Finding the options.** A new `option_markers(block, ...)` (`core/pdf_segment.py`) returns each
option's marker word, using the same scan as `split_options`. Both are refactored to share it, so
they can never disagree. A cluster in the options belongs to option K when both hold:
- **K's marker** is the nearest marker at or left of the cluster's centre, with no other marker
  between them on that row;
- **the cluster is on K's row:** it overlaps K's marker line vertically, or K's row is the last
  marker row above it.

**It fails closed.** A cluster can be an option's image only for an option that has **no words of its
own**: none left after the cluster's labels are removed. Any of these is **`option_unassigned`**:
- a cluster that matches no option, or more than one;
- a cluster matched to an option that has words;
- an option with more than one cluster;
- clusters whose reading order isn't the options' A–D order.

An option with no words and no cluster is **`option_missing_image`**. So a picture is never attached
to an option that's printed as text.

**What's stored:**
- each image option's cluster becomes an `option` image with `option_key` K;
- a cluster above the options is a `question` image (Decision 1);
- each option keeps its key, so **grading is by the official key**, as for every question (the
  answer is `correct_key`, and publishing links it to the option row with that key).

**The option's text.** `NormalizedOption.text` requires at least one character, and the database
row needs text for search and the answer line. `_read` sets an image option's text to the
placeholder `IMAGE_OPTION_TEXT` (Decision 5). **Owner, 2026-10-18: hide it on the page.**
- The stored text is "(see image)".
- The question page, practice and the review preview hide it when that option shows an image. So the
  option reads like the printed paper: the letter, then the picture.
- It's still shown in the correct-answer line ("C · (see image)") and in search, and as text
  wherever no image is shown (JSON-LD).

The constant and the check, `IMAGE_OPTION_TEXT` and `isImageOptionPlaceholder(text)`, live in
`packages/api/src/shared.ts`, which the pages already import. A test checks that the TypeScript and
Python constants match.

### 8. Storage: local at import, R2 at publish, and R2 only in production

- **At import,** `run.py` renders each accepted question's crops (Decision 4) and stores them in the
  **local** media store, `FilesystemMediaStore` (`MEDIA_STORAGE_DIR`, default `<repo>/.data/media`).
  `import_paper` gains `media_store: MediaStore | None`, defaulting to the filesystem store. Tests and
  the e2e fixture pass a temporary one. Import never writes to R2.
- **R2 is reachable only in production.**
  - **`media_store_from_env()`** (`core/media_store.py`) returns the R2 store only when
    `MEDIA_STORE=r2` **and** `PREPORA_ENV=production`. `PREPORA_ENV` is set only by
    `scripts/env.sh production`, and the guardrails already block agents from setting it.
  - **`MEDIA_STORE=r2` anywhere else is refused** with a `MediaError` naming the problem. The
    filesystem store isn't returned silently instead. Without `MEDIA_STORE=r2`, it returns the
    filesystem store, as today.
  - **`.env.example`** says the `MEDIA_STORE=r2` and `STORAGE_*` variables belong in
    `.env.production`, not `.env`.
  - **The local `.env`** has two `STORAGE_*` values set (the lead, 2026-10-18), and moving them is
    the owner's (Owner checkpoints).
  - **`playwright.config.ts`** sets `MEDIA_STORE=""`, `MEDIA_PUBLIC_BASE_URL=""` and a per-run
    `MEDIA_STORAGE_DIR` (under `test-results/`), in both web servers' environments and in the test
    process's `process.env`. So the fixture writes where the test web app reads, never into the
    developer's `.data/media`, and never to R2.
- **Keys are content hashes:** `<sha256[:2]>/<sha256>.png` (`media_store.py` `_checked`). The same
  bytes always get the same key, and an object never changes once written. So R2 serves it with
  `public, max-age=31536000, immutable` (Spec 4).
- **The candidate carries the crops** as `NormalizedQuestion.media`: placement, `option_key`,
  `storage_key`, `mime_type`, `alt_text` and `size_bytes`, with `source_url` set to the paper's URL.
  The contract doesn't change.
- **At publish, unchanged from Spec 4:** with the R2 store, `publish_question` uploads every crop R2
  doesn't have, from the local store, before writing any row. A crop missing locally fails the
  publish (`PublishError`), so a published question never points at a missing image.
- **`media-sync --check`** (new, `cli.py`) is the read-only form. It uploads nothing. It reports each
  `media` key missing from R2, and each one missing locally, and exits 1 if there's any. `media-sync`
  without the flag stays the back-fill. Both need the production environment, like every R2 use.
- **The review preview** gets the crops through each batch element's `images` (`run.py` `_element`,
  today always `[]`): `{placement, optionIndex, storageKey, alt, mimeType}`, the shape
  `admin/review.tsx` already reads.
  - `optionIndex` is `ord(option_key) − 65` (A is 0), and `null` for `question` images.
    `admin/review.tsx` maps it back to the letter (`String.fromCharCode(65 + optionIndex)`), as it
    does today.
  - The admin runs locally, so `/api/media/<key>` serves the crops.

### 9. Dedupe and publishing know about images (ADR-017)

This spec adopts [ADR-017](../adr/017-images-in-question-identity.md). There's no TypeScript port of
`AnswerShape`, so only the pipeline changes.

- **Question and option images are part of the answer shape; explanation images aren't.**
  - `dedupe/fingerprint.py`: each option's shape entry is its normalized text plus the sorted storage
    keys of that option's images. So four "(see image)" options stay four entries, and the correct
    answer is identified by its picture as well as its text.
  - `AnswerShape` gains `images`: the sorted storage keys of the question's `question` images.
  - `shape_of_published` reads both from `media`, leaving out `explanation` rows.
  - Explanation images stay out because MS Learn drops them when a fetch fails
    (`apps/scraper/ms_learn_media.py`), which would make re-scrapes look like conflicts.
  - A question with no question or option images has exactly today's shape.
- **The same position isn't decided by images.** `_position_decision` (`stages/publish.py`, Spec 13)
  compares option keys and the official key, never option text or images.
  - **The gap:** a re-crop whose wording hasn't changed never reaches `_position_decision`.
    `check_duplicate`'s exact-text lookup catches it first, and `_decide_exact` holds it as a
    `conflicting_duplicate` suggesting "same", which keeps the old crop.
  - **The fix:** `_decide_exact` (`dedupe/check.py`) checks the position first. When both hold, it
    returns `_position_decision`'s decision, which suggests `same_new` ("same question, use the new
    version"):
    - the candidate has position identity;
    - the exact match's `stable_content_id` equals the candidate's own derived id, with no `-D`
      suffix.
  - So a re-crop of a published question, with or without new wording, leans "use the new version",
    and a renderer upgrade never pushes reviewers towards "publish as a different question".
- **Identities don't move.** `derive_stable_content_id(distinct=True)` (`stages/stable_id.py`) adds
  image keys to its signature **only** for options whose text is `IMAGE_OPTION_TEXT`. Every existing
  `-D` id stays the same, because no published question has that text yet. Without the keys, two
  different image-only questions would get the same id.
- **A conflict caused only by images says so.**
  - `options_match` and `answer_match` keep their meaning: text and correct answer, as stored in
    `duplicate_reviews`.
  - A hold whose texts and answers match, but whose images differ, gets the reason "same wording,
    options and answer, but different images".
  - `DuplicateDecisions.tsx` shows both versions' question and option images, and
    `listDuplicateReviews` returns them:
    - **the held candidate's** come from `duplicate_reviews.candidate.media`. That column (jsonb, NOT
      NULL) stores the full normalized question. The admin re-sends it as-is as the body of
      `/publish` (`admin.router.ts`, about line 587), and `listDuplicateReviews` already reads its
      text, options and answer from it (about lines 1341–1362). Its `NormalizedMedia` entries carry
      their storage keys, and their URLs come through `mediaUrl`. The `media` table has no rows for an
      unpublished candidate, so it isn't used for this side;
    - **the published question's** come from the `media` table, through `loadQuestionImages`.
- **"Same question, use the new version" replaces question and option images.** With
  `use_new_wording=True`, `_link_to_existing_question` deletes the question's `question` and `option`
  `media` rows that aren't in the new version, and `_record_media` adds the new ones. **Explanation
  images are kept,** unless the new version has explanation images of its own, in which case those
  replace them.
- **"Keep the published version" adds none.** When a reviewer links a question and keeps the
  published version, `_record_media` doesn't run. Exact-duplicate reuse is unchanged: with equal
  shapes, the images are already equal, so it adds nothing.
- **MS Learn regression.** `stages/test_publish.py::test_link_with_exhibit_keep_and_use_new` publishes
  an MS Learn-shaped question with a `question` exhibit and an explanation image, then links a
  re-scrape to it both ways:
  - keeping the published version leaves both images unchanged;
  - using the new version, with a new exhibit and no explanation image, gives exactly the new exhibit
    and keeps the explanation image.

### 10. Re-runs and upgrades, through intake's content hash and `parser_version`

- **`PARSER_VERSION` goes from `gate-2` to `gate-3`.** It isn't part of `content_hash`, so the
  version alone changes nothing.
- **A recovered figure question:** its candidate gains `media`, loses its label words, and is now a
  valid `NormalizedQuestion` (an image option no longer fails normalisation). So its hash changes.
  Intake recomputes its status: `ready` if nothing else holds it, and the run batches it.
- **A question whose figure isn't accepted:** its candidate is byte-identical, so its hash doesn't
  change. It stays `held`, with its `issues` refreshed with the reasons.
- **A question with no figure issue:** its candidate is byte-identical (its `media` was already
  `[]`), so nothing changes. Tolerant furniture matching (Decision 1, step 1) could clear a figure
  issue that was furniture missed by rounding. Any such question is named in the PR.
- **The same PDF and code give the same crops,** so a second run is "0 new, all unchanged" and
  writes no batch (step 10). A changed crop is a changed hash, and goes back through review (Spec 7's
  rule).
- **Provenance: none added** (ADR-016, decision 1). A crop is the official page's own drawing,
  rendered with nothing added. It's parsing, recorded by `parser_version` (`gate-3`). There's no
  `question_revisions` row, no public label and no review badge, as for Spec 13's rebuild.

**The committed report** (Spec 13, Decision 6) gains a `figures` section, counts only:

```json
"figures": {
  "flagged": 0,
  "flagged_figure_only": 0,
  "recovered": 0,
  "recovered_now_ready": 0,
  "still_held": 0,
  "still_held_by_reason": { "rule_only": 0, "text_overlap": 0 },
  "question_images": 0,
  "option_images": 0
}
```

**The fields:**
- **`flagged`:** questions whose **true first** detector run, before the figure stage, had a
  `figure` or `image_option` issue.
- **`recovered` / `still_held`:** accepted or not (Decision 5). `recovered_now_ready` counts those
  with no issue left.
- **The report writer asserts** `recovered + still_held == flagged`.

**Spec 13's numbers change.** The `math` and `retypeset` sections now count from the first run
**after** the figure stage, which is the run Spec 13's rebuild sees. So:
- a math flag that only figure labels caused disappears from `math.flagged`;
- the four reports' math numbers move.

Step 11's PR states the old and new values. The checks of Spec 13's Decision 6 still hold.

**What `gate-import` prints:**
- "figures: N held for a figure before; R recovered, S still held";
- a line per still-held question ("Q.n still held for a figure: text_overlap");
- **a line per crop with its local path,** "Q.n crop: question 1 → .data/media/ab/ab….png", printed
  for every question with an accepted figure, even one still held for something else. It's for the
  hand check in step 12, it's printed locally only, and the paths are never committed.

**The README** (`docs/sources/reports/gate/README.md`) is retitled "GATE parse reports", because it
now covers more than math. Its table gains "Held for a figure before", "Figures recovered" and
"Figures still held".

### 11. The release gate, and who uploads

The agents never touch production or R2 (CLAUDE.md, Production safety). So:
- **The PR's release doesn't depend on R2.** There's no migration, and production has no GATE
  questions and no `media` rows, so merging changes nothing a reader sees.
- **Before release:** the lead counts production's `media` rows through `scripts/team/prod-read.sh`.
  If there are any, the owner runs `media-sync --check` first, and the release waits for it to
  report nothing missing. Today there are none.
- **Production gets figures only from the owner,** after release:
  1. run `gate-import` against production;
  2. approve the batches in the admin, in the production environment with `MEDIA_STORE=r2` and the
     `STORAGE_*` variables from `.env.production`, so each crop reaches R2 before its rows are
     written;
  3. run `media-sync --check`, which must report nothing missing;
  4. open one figure question on the live site.

  **Owner, 2026-10-18: now, on `r2.dev`.** The owner does this after the release, and #82 (the custom
  domain) is done before the site is promoted. URLs aren't stored, so the move is one setting.
- **The release check reads one image.**
  - `/api/health` gains `mediaSample`: the URL (through `mediaUrl`) of the most recently created
    `media` row whose question is **published**, or `null`. Health is public, and the image is public
    already, so this exposes nothing new.
  - `app/ssr.tsx` deep-imports `mediaUrl` from `@prepora/api/src/lib/question-media`.
  - The post-deploy smoke test (`tests/smoke/site.spec.ts`) gains "a published image loads". When
    `mediaSample` isn't null:
    - it must be an absolute `https://` URL. That proves `MEDIA_PUBLIC_BASE_URL` is set, since
      `/api/media` 404s on Cloudflare;
    - it must answer 200, with an `image/*` type and an `immutable` cache header.

    When it's null, the test is skipped ("no images published yet").
  - Every release after the owner publishes figures checks that images still load.

## Changes

### Pipeline (`apps/pipeline/prepora_pipeline`)

| File | Change |
|---|---|
| `core/pdf_text.py` | New `running_graphics(pages, *, min_share=0.6, tolerance=2.0) -> dict[int, list[Graphic]]` (Decision 1, step 1); `strip_running_graphics` uses it in place of rounding. `render_region` gains `exclude: Sequence[Graphic] = ()`: it removes the top-level page objects, of any type, whose converted `get_bounds` box matches an excluded graphic that intersects the crop, and raises `RenderError` when one has no match (Decision 4) |
| `core/figures.py` (new) | `FigureProfile` (with `wide_gap`), `GATE_FIGURES` (its `wide_gap` from `GATE_QUALITY.wide_gap`), `FIGURE_REASONS`, `FigureCrop(page, bbox, placement, option_key, position, graphics)`, `FigureResult(crops, label_words, image_options, reasons)`, and `find_figures(lines, regions, pages, all_words, markers, profile)` (Decisions 1, 2 and 7). It imports nothing from `connectors/` |
| `core/pdf_segment.py` | New `option_markers(block, *, option=OPTION_MARKER, column_gap=12.0) -> dict[str, Word]`; `split_options` shares its marker scan |
| `core/quality.py` | New `owns(region, graphic)` (centre in region), used by the "something is drawn" rule. `detect_issues` gains `covered: Sequence[CropRegion] = ()` (Decision 5) |
| `core/media_store.py` | `media_store_from_env()` returns the R2 store only when `PREPORA_ENV=production`, and raises `MediaError` for `MEDIA_STORE=r2` otherwise (Decision 8) |
| `connectors/gate/paper_parser.py` | `parse_paper(pages, *, no_figures=frozenset())` keeps the unstripped words and `running_graphics`' furniture, and runs the figure stage before `_rebuild` (Decision 5). `_read(block, image_options=frozenset())` applies `IMAGE_OPTION_TEXT = "(see image)"`. `_rebuild` takes the figure block, `covered` and the image options. `_inside` is replaced by `owns`. `GateQuestion` gains `figures`, `figure_outcome` (`recovered`, `still_held`, `none`), `figure_reasons`, `first_figure_codes` and `furniture` (by page); none is stored |
| `connectors/gate/run.py` | `import_paper(..., media_store=None)` renders and stores crops after a complete join (Decisions 4 and 8). A failed render re-parses with `no_figures`, plus the reason. Builds `NormalizedMedia` for `to_normalized`. `_element` fills `images`, with `optionIndex = ord(option_key) − 65`. `ImportReport` gains the figure counts and lines, including each crop's local path (Decision 10) |
| `connectors/gate/normalizer.py` | `PARSER_VERSION = "gate-3"`. `to_normalized(..., media=[])` sets `media`. New `figure_alt_text(...)` (Decision 6) |
| `dedupe/fingerprint.py` | Option entries carry their image keys, and `AnswerShape.images` holds the question images. `shape_of` and `shape_of_published` fill them, leaving out explanation images, and `matches` compares them (Decision 9, ADR-017) |
| `dedupe/check.py` | The images-only conflict reason. `_decide_exact` checks the position first: for a position-identity candidate whose exact match has the candidate's own derived `stable_content_id` (no `-D`), it returns `_position_decision`'s decision, which suggests `same_new` (Decision 9) |
| `stages/stable_id.py` | `derive_stable_content_id(distinct=True)` adds image keys only for placeholder options (Decision 9) |
| `stages/publish.py` | `_link_to_existing_question(use_new_wording=True)` replaces question and option images, and keeps explanation images unless the new version has its own. `_record_media` is skipped when a reviewer links a question and keeps the published version. `_position_decision` ignores images (Decision 9) |
| `cli.py` | `media-sync --check` (read-only). `gate-import` prints the figure lines |
| `connectors/gate/testing.py` | `make_pdf` gains `drawings` (lines, circles, outlined rects per page), `images` (an in-memory PIL image at a box per page) and `forms` (content drawn once with `beginForm` and placed with `doForm` on each page). So tests and the fixture can draw vector and raster figures, and both kinds of furniture |
| `connectors/gate/e2e_figures_paper.py` (new) | The e2e fixture: 3 pages, year 2098, base URL `https://gate-figures.example.test`. Its `--cleanup` deletes by that year and that prefix only |
| `connectors/gate/README.md` | The figure stage, and `GATE_FIGURES`' measured values |
| `requirements.txt` | `pypdfium2==5.13.0` and `Pillow==12.3.0` (Decision 4) |

### API (`packages/api`)
- **`src/shared.ts`:** `IMAGE_OPTION_TEXT` and `isImageOptionPlaceholder(text)` (Decision 7).
- **`src/routers/admin.router.ts`:** `listDuplicateReviews` returns each side's question and option
  images (Decision 9):
  - the held candidate's from `duplicate_reviews.candidate.media`, the stored normalized question,
    through `mediaUrl`;
  - the published question's through `loadQuestionImages`.

### Web (`apps/web`)
- **The question page** (`app/routes/questions/$questionSlug.tsx`), **practice**
  (`app/routes/practice.tsx`, Learn and Simulation) and **the review preview**
  (`app/routes/admin/review.tsx`): an option whose text is the placeholder, and which shows an image,
  doesn't render the placeholder. The correct-answer line still shows it (Decision 7).
  `QuestionImages` doesn't change.
- **`components/review/DuplicateDecisions.tsx`:** shows both versions' question and option images
  (Decision 9).
- **`lib/health.ts` and `app/ssr.tsx`:** `mediaSample` in `/api/health`, from published questions'
  media (Decision 11).

### Config and tests
- **`.env.example`:** says `MEDIA_STORE=r2` and the `STORAGE_*` variables belong in `.env.production`
  (Decision 8).
- **`playwright.config.ts`:** `MEDIA_STORE=""`, `MEDIA_PUBLIC_BASE_URL=""` and a per-run
  `MEDIA_STORAGE_DIR`, in both web servers' environments and in `process.env` (Decision 8).
- **New `tests/e2e/acceptance/14-figures.spec.ts`:** steps 1–10, one `acceptanceStep` each, with
  `checkAccessibility` on every page.
- **`tests/smoke/site.spec.ts`:** "a published image loads" (Decision 11).

### Repository data (`docs/`)
- **`docs/sources/reports/gate/`:** the four reports, and the README retitled and regenerated by
  step 11.
- **`docs/sources/gate.md`:** §4 "Figures" and §8 say what's cropped and what's still held, with a
  link to the reports.
- **`docs/architecture/dedupe.md`:** ADR-017's proposed change, applied when the owner approves this
  spec.
- **`docs/adr/017-images-in-question-identity.md`:** Accepted when the owner approves this spec.
- **`docs/specs/README.md`:** Spec 14's status.

## Migration

None (header).

## Tests

**Pipeline: `core/test_figures.py`.** It uses generated PDFs (`connectors/gate/testing.py`), plus
hand-built `Word`s and `Graphic`s where reportlab can't produce the case.

- **Clusters and crops:**
  - a vector drawing gives one crop of its box plus 6pt;
  - two drawings far apart give two crops, in reading order;
  - padding shrinks rather than take in any word from `all_words` that isn't the cluster's,
    including a margin heading, and it's clamped to the page;
  - a figure wider than the text column (an image from x 112 to 551, with the region's right edge at
    526) is cropped whole: the crop isn't clipped to the region;
  - a frame of thin rules around the question (rects 1pt wide or high at the region's edges, as in
    the 2025 papers) is neither a figure nor part of one. It doesn't join a cluster or widen a crop,
    and a question with only the frame has no figure issue.
- **Labels:**
  - a short word inside a drawing, and a short label line just outside it, are labels and leave the
    text;
  - a full prose line beside the drawing isn't a label.
- **Reasons:** every reason in `FIGURE_REASONS` has a case.
  - `text_overlap`: a box drawn across a line; another question's "Q.n" label inside the box.
  - `text_inside`: a line-drawn table, with words in its cells; code in a monospace font inside a
    drawn box; a long prose line inside a frame.
  - `rule_only`: an underline; a thin filled bar; thin straight strokes around a math-font word.
  - `option_unassigned`: one drawing spanning two options; a drawing next to an option that has
    words; two drawings for one option; drawings out of A–D order.
  - `option_missing_image`.
  - `furniture`: an exclusion with no matching object.
  - `too_large`: a stubbed size.
  - `nothing_drawn`.
- **Ownership:** a graphic overlapping a region's edge, with its centre outside, isn't that
  question's, and `detect_issues` and `find_figures` agree on it. A continuation page's region
  doesn't own the logo.
- **Image options:** options laid out one per line, two per row and four per row each get their own
  image.
- **Imports:** the module imports nothing from `connectors/`.

**Pipeline: `test_pdf_stages.py`.**
- **`running_graphics`:**
  - it finds furniture drawn 0.4pt apart on different pages, which rounding wouldn't have matched;
  - two generated PDFs with their watermarks in different places (the 2026 and 2025 boxes of
    Context) each find their own watermark. Nothing is fixed coordinates;
  - a graphic on fewer than 60% of the pages isn't furniture.
- **`render_region(..., exclude=…)`:**
  - on a page with a coloured raster watermark and logo, the PNG has no pixel of either colour, and
    the same box without `exclude` has them;
  - the same holds for a watermark wrapped in a reportlab form (`beginForm`/`doForm`), which reaches
    pdfium as a form XObject, like the 2026 papers;
  - furniture outside the crop box isn't touched;
  - the bounds conversion is right on a page whose media box doesn't start at (0, 0);
  - an exclusion with no matching object raises `RenderError`;
  - the same input twice gives byte-identical PNGs.

**Pipeline: `core/test_media_store.py`.**
- `media_store_from_env()` returns the R2 store with `MEDIA_STORE=r2` and `PREPORA_ENV=production`.
- It raises `MediaError` with `MEDIA_STORE=r2` and no `PREPORA_ENV`, or any other value.
- It returns the filesystem store without `MEDIA_STORE`.

**Pipeline: `connectors/gate/test_parser.py` and `test_run.py`.**
- **`parse_paper`, on an invented paper:**
  - a figure-only question is recovered, with its labels gone from the text;
  - a figure plus a fraction keeps its crop and its label removal, and stays held for math only.
    Spec 13's rebuild doesn't bring back the label or the figure issue;
  - an image-option question is recovered with four placeholders. Spec 13's rebuild doesn't read
    the options as "" or report `options_changed`;
  - a figure whose labels alone caused `layout` loses that issue too;
  - `text_overlap`, `text_inside` and `rule_only` questions keep their text byte-identical to
    `gate-2`, and their figure issue gains the reason;
  - a question with nothing drawn is byte-identical to `gate-2`;
  - `no_figures` turns the stage off for the numbers it names.
- **`import_paper`, against the local database, with a temporary media store:**
  - crops are stored, and the candidate's `media` names them, with the alt text of Decision 6;
  - image options validate, with the placeholder and four `option` images;
  - a recovered held item becomes `ready` and is batched, and its batch element's `images` are
    filled, with the right `optionIndex`;
  - a render failure leaves the question held, with the reason, and no crop;
  - an incomplete join renders and stores nothing;
  - a second run writes no batch and stores nothing new;
  - `write_report`'s figure counts add up (`recovered + still_held == flagged`), and `flagged` counts
    from the run before the figure stage.

**Pipeline: `dedupe/test_fingerprint.py`, `dedupe/test_check.py`, `stages/test_stable_id.py` and
`stages/test_publish.py`.**
- **Dedupe:**
  - two image-option questions with the same stem and different images aren't the same question.
    With equal images, they are;
  - an images-only difference gives the "different images" reason, with `options_match` and
    `answer_match` true;
  - a different explanation image doesn't change the shape;
  - a question with no question or option images compares as before.
- **Identities:**
  - a re-crop at the same position gets `_position_decision`'s `same_new` suggestion, both with
    changed wording and with **unchanged wording**. The unchanged case goes through `_decide_exact`'s
    position check, not a `conflicting_duplicate` suggesting "same";
  - an exact match under a `-D` id, or another position's id, is still decided by `_decide_exact` as
    today;
  - `derive_stable_content_id(distinct=True)` is unchanged for every question without a placeholder
    option, and differs for two image-only questions with different images.
- **Publishing:**
  - `use_new_wording=True` with a different crop leaves exactly the new crop, and keeps the
    explanation image;
  - keeping the published version adds no image;
  - `test_link_with_exhibit_keep_and_use_new` covers MS Learn (Decision 9).
- **`media-sync --check`** uploads nothing, and exits 1 when a key is missing, against a fake S3
  client with `PREPORA_ENV=production` set in the test. No test talks to real R2.

**API and web.**
- `isImageOptionPlaceholder`, and a test that the TypeScript and Python placeholder constants match.
- `healthBody` with and without `mediaSample`, and the query returning only published questions'
  media.
- `listDuplicateReviews` returns both sides' images.

**E2E:** `tests/e2e/acceptance/14-figures.spec.ts`, steps 1–10. Steps 11 and 12 are done by hand,
with evidence in the PR.
- **Cleanup:** the fixture's `--cleanup` deletes only year 2098's session and what hangs off it, and
  the rows under its own URL prefix. Its `media` rows cascade with the questions. It leaves the shared
  GATE registration alone.
- **Media:** the run's media directory is deleted with `test-results/`.

## Owner checkpoints

- **Approve this spec,** which also accepts ADR-017. The owner's answers of 2026-10-18 are recorded
  above.
- **Move the R2 variables** from the local `.env` to `.env.production`: `MEDIA_STORE=r2` and every
  `STORAGE_*` value, two of which are set locally today (the lead, 2026-10-18). Agents never read or
  edit either file's secrets. After this, `.env` has no R2 credentials, and `media_store_from_env()`
  refuses R2 outside production anyway (Decision 8).
- **Before release,** if the lead's `prod-read.sh` count of production's `media` rows isn't 0: run
  `media-sync --check` (Decision 11).
- **The production run** (Decision 11), after release:
  - `gate-import` against production;
  - approving the batches in the production environment, with `MEDIA_STORE=r2`;
  - `media-sync --check`;
  - checking one live figure question.

  These are the owner's (CLAUDE.md, Production safety). The PR says how many questions each paper's
  batches will hold, and how many images will be uploaded.

## Risks

- **A wrong crop reads as authoritative.** Mitigations:
  - all or nothing per question (Decision 5);
  - furniture is removed, not hidden, and tests check it pixel by pixel, for images and forms;
  - every changed question goes through review;
  - step 12 hand-checks every pilot crop.
- **Removing label words could remove real text.** Mitigations:
  - only short, non-monospace lines are labels;
  - a split line, or text that reads as prose, a table or code, holds the question (Decision 1);
  - step 12 checks every removed word is in its crop.
- **A local run reaching production storage.** `media_store_from_env()` refuses R2 outside
  `PREPORA_ENV=production`, and the e2e config blanks every media variable (Decision 8).
- **Renderer upgrades change every crop's bytes,** so every figure question goes back to review.
  `pypdfium2` and `Pillow` are pinned, and an upgrade is its own PR, which says so.
  `_position_decision` suggests "same question" for a re-crop, so review stays quick.
- **MS Learn re-scrapes with changed images** are held for a person, instead of being reused
  silently (ADR-017, Consequences). `pnpm check:duplicates` may report new pairs, which are correct
  findings.
- **Thresholds from four papers.** The 2025 and 2026 papers come from different organisers and
  templates, and `GATE_FIGURES` is measured on both. Other years may need a new profile, and the
  report's reasons show when they do.
- **`r2.dev` is rate-limited and not cached at Cloudflare's edge** (Spec 4). Figures shouldn't serve
  real traffic from it for long, so #82 is done before the site is promoted (owner, 2026-10-18).
  URLs aren't stored, so moving later is one setting.
- **Layout shift.** Images load with no reserved height until the `width` and `height` follow-up.
  That's cosmetic, and lazy loading keeps it below the fold on most pages.
- **Knock-on effects on later specs:**
  - **Spec 15** inherits every question still held, including `rule_only`, `text_inside` and
    `text_overlap`. Its crops are already in the candidate for any question held only for math or
    layout.
  - **Spec 8's "Figure: the official page"** is this spec's crop, versioned by `parser_version`.
  - **Spec 13's report numbers** move once, with this spec (Decision 10).
