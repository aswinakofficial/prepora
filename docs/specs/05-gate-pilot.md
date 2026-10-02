# Spec 5 · GATE CS pilot (2025–2026, CS-1 and CS-2)

**Issues:** #27 (answer-key parser), plus new: "GATE question-paper parser", "GATE import and review
batches", "GATE pilot run"
**Epic:** #41
**Depends on:** Specs 2, 3 and 4
**Production:** publishing GATE content to production needs the **owner's permission decision**
(see below) and Spec 4's R2 setup.

## Context

Research: [docs/sources/gate.md](../sources/gate.md). GATE publishes each paper as a text PDF with
a separate answer-key table. The pilot covers **four papers**, about 260 questions:

| Paper | Question paper | Answer key |
|---|---|---|
| CS-1 2026 | `https://gate2026.iitg.ac.in/doc/download/2026/QPs/CS1.pdf` | `…/doc/download/2026/Keys/CS1_Keys.pdf` |
| CS-2 2026 | `…/doc/download/2026/QPs/CS2.pdf` | `…/doc/download/2026/Keys/CS2_Keys.pdf` |
| CS-1 2025 | `…/doc/download/2025/CS12025.pdf` | `…/doc/download/2025_Key/CS1_Keys.pdf` |
| CS-2 2025 | `…/doc/download/2025/CS22025.pdf` | `…/doc/download/2025_Key/CS2_Keys.pdf` |

Every URL is relative to `https://gate2026.iitg.ac.in/`, and all were checked live on 2026-10-02.

## Owner checkpoints

1. **Permission.** The GATE papers carry "© … All Rights Reserved", with no reuse licence. Before
   anything is **published to production**, the owner decides between two options:
   - (a) send the NCB-GATE email in [permissions.md](../sources/permissions.md) and wait for a
     reply;
   - (b) publish with full attribution under an educational-use rationale and a takedown path.

   **Building, parsing and publishing locally aren't blocked by this.**
2. **R2 is set up** (Spec 4), since figure crops are images.
3. **The production migration** for Spec 3 has been applied.

## Decisions

1. **The current model, not the S1 hierarchy:**
   - organization `ncb-gate` ("GATE (IISc and the IITs)", jurisdiction `IN`);
   - exam type `competitive`;
   - exam `gate` ("GATE", status `published`);
   - **variant** = the paper code without its sitting (`cs`);
   - **session** = the year (`year=2026`, label `"2026"`);
   - **shift** = the sitting (`CS-1`).

   That gives question-set slugs like `gate-cs-2026-computer-science-cs-1`, and stable IDs like
   `GATE-CS-2026-COMPUTER-SCIENCE-CS-1-Q011` (Spec 3 adds the shift).
2. **One subject per paper:** `computer-science` ("Computer Science and Information Technology").
   A question set holds one subject, so General Aptitude isn't split into another set. GA vs CS goes
   in `section` (`GA`, `CS`). Topic tagging from the syllabus is a follow-up.
3. **Identity is by position, numbered as in the paper.** `number` is the question number, and
   `number_label` is `"Q.11"`.
4. **The paper is labelled honestly:** `paper_kind=past_paper`, `key_status=final`,
   `answer_provenance=official_final`, `source_type=official`.
5. **Questions arrive through the existing review queue**, so a person approves every batch.
   - The GATE import writes **one review batch per paper** (a `scraped_questions` row).
   - Each element carries the familiar display fields (`questionText`, `options`, `answer`,
     `explanation`, `images`) **plus a `normalized` field**: the complete NormalizedQuestion JSON.
   - The approve flow publishes `normalized` as it is. It must not re-derive anything from the
     display fields.
6. **Figures and garbled math:**
   - **Text first.** Each question is published as text where its text is clean.
   - **A crop when it isn't:** when the garble detector fires (below), the question's region is
     cropped at 200 dpi and attached as a `question`-placement image. The text is kept as is, and
     the review UI flags the question ("check the crop").
   - **No AI transcription in the pilot.**
7. **MTA and dropped questions** are published with `answer_status=marks_to_all` and no answer
   (Spec 3). The pilot report counts them.

## Changes

### Registry
- `apps/pipeline/prepora_pipeline/connectors/gate/source.yaml`:
  ```yaml
  name: gate
  base_url: https://gate2026.iitg.ac.in
  source_type: competitive
  connector_name: gate
  requires_auth: false
  crawl_policy: { max_depth: 1, max_pages: 20 }
  rate_limit: { requests_per_minute: 10 }
  robots_review_status: reviewed   # robots.txt returns 404, so no rules (2026-10-02)
  dedupe:
    identity: position
    near_duplicate_threshold: 0.9
  ```
  Run `sync-sources` (locally, and on production with the owner's go-ahead) to register it.

### Connector (`apps/pipeline/prepora_pipeline/connectors/gate/`)

| File | Purpose |
|---|---|
| `__init__.py` | — |
| `catalog.py` | `PAPERS: list[PaperSpec]`, a dataclass of `year`, `paper` (`"CS"`), `sitting` (`"CS-1"`), `qp_url` and `key_url` for the 4 pilot papers above. It's a hand-written map: GATE's naming is too irregular to guess (dossier §3). |
| `key_parser.py` (#27) | `parse_answer_key(pages) -> list[GateKeyRow]`, using `core.answer_keys.parse_key_table` with a 2026 header profile and a 2025 one. 2025 is ReportLab output with `Q. Type`; check the real file and add its aliases. |
| `paper_parser.py` | `parse_paper(pages, pdf_bytes) -> list[GateQuestion]`, built on `core.pdf_text` and `core.pdf_segment` |
| `normalizer.py` | `to_normalized(question, key_row, paper) -> NormalizedQuestion` |
| `run.py` | `import_paper(spec) -> ImportReport`: fetch → store raw → parse → join → crops → review batch |
| `register.py` | `ensure_gate_registered(cur)`: idempotent `INSERT … ON CONFLICT DO NOTHING` for organization `ncb-gate` and exam `gate` |
| `fixtures/` | Invented PDFs generated by the tests (no real papers), plus a small README |
| `test_parser.py` | Contract tests (below) |
| `README.md` | What's here, what's special about GATE |

**`GateKeyRow` fields:**
- `number`, `session`, `section` (e.g. `GA`, `CS-1`), `marks` (1 or 2)
- `qtype`: `MCQ | MSQ | NAT`
- `answer`, one of:
  - `("keys", ["A"])` for MCQ, or `("keys", ["A","C","D"])` for MSQ. Split on `;` or `,`, strip
    spaces, and reject anything not in A–D.
  - `("ranges", [(4.24, 4.26)])` for NAT. Parse `X to Y`, with negatives allowed, split on ` OR `,
    and require lo ≤ hi.
  - `("mta", None)` for `MTA`.

**`paper_parser.py`:**
- **Running text and labels:** `strip_running_text` removes the "Organizing Institute: … Page n of
  N" footer and the paper header. Then `segment(label=re.compile(r"^Q\.(\d+)$"), label_max_x=~90)`.
  Measure the label column on the real CS1 2026 file and set it as a constant with a comment.
- **Marks by number:** read the "Q.1 – Q.5 Carry ONE mark Each" style headings, so each question
  gets a mark. Use them only as a cross-check: the key's Marks column wins.
- **Options:** `split_options` for MCQ and MSQ. A NAT question has no options, and the blank line
  "_____" is stripped from its text.
- **Code blocks:** keep lines that use a monospace font (Courier) or have large indentation as a
  fenced block in the question text. Use the word font when pdfplumber gives it; otherwise fall back
  to indentation of 20pt or more relative to the block.
- **Garble detector:** a question is flagged when any of these is true:
  - (a) a math symbol from the Mathematical Alphanumeric Symbols block remains after NFKC;
  - (b) a single token sits alone on 3 or more consecutive short lines, such as a stacked fraction;
  - (c) the body has fewer than 5 words but the block's bbox is more than 120pt tall, such as a
    figure with no text;
  - (d) a Private Use Area code point is present.

  For a flagged question, `render_region` crops the block's bbox (padded 6pt) and stores it through
  `media_store_from_env()`.

**`normalizer.py`:**
- **The NormalizedQuestion:**
  - `exam_slug="gate"`, `exam_variant_slug="cs"`, `subject_slug="computer-science"`
  - `year`, `shift=sitting`, `number`, `number_label`
  - `section` = the key's section mapped to `"GA"` or `"CS"`
  - `marks`
  - `negative_marks`: ⅓ × marks for MCQ, 0 for MSQ and NAT (dossier §4)
  - `question_type`: `mcq`, `multiple_correct` or `numerical`
  - `options` with keys A–D
  - `answer`:
    - `McqAnswer` / `MultipleCorrectAnswer` from the key letters;
    - `NumericalAnswer(answer=<raw key text>, ranges=[…])` for NAT;
    - `None` with `answer_status="marks_to_all"` for MTA.
  - `answer_provenance="official_final"`, `paper_kind="past_paper"`, `key_status="final"`
  - `source_type="official"`, `source_url=qp_url`, `source_document="GATE {year} {sitting} question
    paper"`, `question_set_title=f"GATE {year} · {sitting}"`
  - `media` = the crop, if any
  - `parser_version="gate-1"`, `raw_artifact_sha256` of the question-paper PDF
- **Explanation:** none (`None`). GATE publishes no explanations. Explanations come later, from
  contributors or confirmed AI suggestions.

**`run.py`, `import_paper`:**
1. Fetch both PDFs through `core.http_client.fetch`, which enforces the allowlist, robots.txt and
   rate limit.
2. Store both in the artifact store.
3. Parse both.
4. `join_by_number`. **If the join isn't complete, stop**: the report lists the gaps and no batch is
   written.
5. Validate every NormalizedQuestion with `stages.validate.validate_question`. Questions with errors
   are listed in the report and **left out of the batch** (never silently).
6. Write one review batch through a new `core/review_batches.py`
   `create_review_batch(source_url, elements, metadata) -> str`, the same insert as
   `apps/scraper/db.py`'s `insert_scraped_question`:
   - `metadata`: `{exam: "GATE", examTitle: "GATE", subject: "Computer Science and Information Technology", source: "GATE official question paper", format: "normalized-v1", paper: "CS-1", year: 2026}`.
   - Each element:
     - `questionText`, `options` (texts), `answer` (`"A"`, `"A | C"` or `"4.24 to 4.26"`),
       `explanation: null`, `images`;
     - `normalized`: `model_dump(mode="json")`;
     - `flags`: e.g. `["check_crop"]`.
7. CLI: `prepora-pipeline gate-import [--year 2026] [--sitting CS-1] [--all-pilot]` prints the report:
   - questions parsed;
   - joined;
   - flagged for crops;
   - MTA;
   - validation failures;
   - the batch ID.

### API (`packages/api/src/routers/admin.router.ts`)
- **`processOneReviewItem`:** when `parsedData.metadata.format === "normalized-v1"`:
  - skip exam resolution and registration;
  - for each element, publish `el.normalized` unchanged (still through `/dedupe/batch-plan` and
    `/publish?on_near_duplicate=hold`);
  - an element without `normalized` is a failure with a clear reason.
- **Review list:** pass `flags` through. The review page shows a small badge per flagged question
  ("Figure / equation: check the crop").
- **Quality checks:** add a `lib/sources/gate.ts` module with **one** check: `marks` is missing on
  any element's `normalized`. Register it in `SOURCE_QUALITY_CHECKS`, matching host
  `gate2026.iitg.ac.in`.

### Web
- **Review page** (`app/routes/admin/review.tsx`): show the `flags` badge and the crop image next to
  a flagged question. The images already render through `QuestionImages`.

## Tests (`connectors/gate/test_parser.py`)

Fixtures are generated in the test with `reportlab`, imitating GATE's layout with **invented**
questions:
- a 3-page paper with a running footer;
- `Q.N` labels in a left column;
- a "Carry ONE mark Each" heading;
- one question whose label sits below its first line;
- one NAT question with a "______" blank;
- one MSQ question.

Test cases:
1. `parse_paper` returns every question with the right numbers, stems, options A–D, and no options
   for NAT.
2. `parse_answer_key` on a generated key table covers `A`, `A;C;D`, `B, C, D`, `4.24 to 4.26`,
   `-0.61 to -0.57 OR 0.57 to 0.61` and `MTA`, each to the right `answer` variant. A bad value
   (`E`, or `5 to 4`) raises.
3. `to_normalized` produces a valid NormalizedQuestion for each type, with marks, negative marks
   and section right.
4. The garble detector flags a fixture containing `𝑛` (U+1D45B) that survives NFKC, and a tall
   block with no text. It doesn't flag a plain question.
5. `import_paper` runs with `fetch` monkeypatched to return the fixtures. It writes one batch whose
   elements carry `normalized` and `format: "normalized-v1"`. An incomplete join writes nothing.

**API:** a unit test that a `normalized-v1` element's `normalized` is what gets posted to
`/publish`. Mock `fetchPipeline`, following existing tests in `packages/api`.

## Pilot run and acceptance (local)

1. Run `gate-import --all-pilot` against the **local** database. Then approve the 4 batches in the
   local admin review page.
2. **Acceptance:**
   - **All four papers join completely:** every key row matches a question.
   - **At least 85% of questions are published without a crop.** If this fails, note which
     detector rule fired, and tune it rather than lowering the bar.
   - **Every flagged question has a crop** that visibly contains its figure or equation.
   - **A hand check of 30 questions**, spread across MCQ, MSQ, NAT and GA. Text, options, answer,
     marks, section, and NAT ranges all match the official PDF and key. Record the results in the PR.
   - **Grading works:** NAT grades correctly on the question page and in practice; MTA questions show
     the "no answer to score" note.
   - **Re-running the import and re-approving** adds 0 questions (dedupe, position identity).
3. **Production:** only after the owner checkpoints above are cleared. Set up R2 (Spec 4), apply the
   Spec 3 migration, `sync-sources`, re-run the import against production, and approve.

## Risks

- **2025 and 2026 PDFs come from different producers** (Word vs ReportLab). Expect to tune the
  label column and the key header for each year. That's exactly why each has its own profile.
- **CS-1 and CS-2 may share identical General Aptitude questions** (dossier §2, unverified). Exact
  dedupe will then publish one question with two occurrences, which is correct.
- **Math fidelity:** the crop is the safety net. A reviewer may still want to fix text by hand, so
  note that the review UI doesn't support editing yet. That's a follow-up issue if it's needed.
