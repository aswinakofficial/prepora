# Spec 2 · P: Shared PDF stages

**Issues:** #29 (text with word positions), #30 (answer-key tables)
**Milestone:** P · PDF stages
**Depends on:** nothing
**Production database:** no

## Context

GATE, Kerala PSC, ISTQB, AWS sample papers and MGU all publish PDFs, so the parsing pieces they
share are built once, in `apps/pipeline/prepora_pipeline/core/`. The [GATE dossier](../sources/gate.md)
§4 shows why plain line-by-line text isn't enough:
- **Wrapped text breaks label lines:** in GATE CS-1 2026, Q.31's long option text pushes "Q.31" and
  "(A)" onto a line *below* where their text starts.
- **Math scatters:** fractions and superscripts break apart over several lines.
- **Figures come out as nothing:** vector figures produce no text at all.

So these stages work with **word positions**, and can crop a region of a page as an image.

## Decisions

1. **Libraries:**
   - `pdfplumber` (MIT; pure Python, built on pdfminer.six) for words with bounding boxes;
   - `pypdfium2` (Apache-2.0/BSD) for rendering page regions to PNG;
   - `reportlab` (BSD) for **tests only**, to generate fixture PDFs with invented text.

   Add all three to [`apps/pipeline/requirements.txt`](../../apps/pipeline/requirements.txt), with no
   version pins (matching the file's style). None of them needs system packages, so CI stays as it is.
2. **Units:** PDF points, with the origin at the top left (`top` grows downward), as pdfplumber
   reports them.
3. **No real exam PDFs in the repo.** Tests build their PDFs in code with `reportlab`, reproducing
   the *layouts* that matter (a label column, wrapped options, repeated headers and footers, key
   tables) with invented text.
4. **Pure functions, bytes in.** Nothing here fetches or writes to the database. Connectors fetch
   through `core/http_client.py`, keep raw files in `core/artifact_store.py`, and pass the bytes in.

## Changes

### `apps/pipeline/prepora_pipeline/core/pdf_text.py` (#29)

```python
@dataclass(frozen=True)
class Word:
    text: str          # NFKC-normalized
    x0: float; x1: float; top: float; bottom: float
    page: int          # 0-based
    size: float | None # font size, if known

@dataclass(frozen=True)
class Line:
    words: tuple[Word, ...]   # sorted by x0
    page: int
    top: float; bottom: float; x0: float; x1: float
    @property
    def text(self) -> str: ...  # words joined with single spaces

@dataclass
class Page:
    number: int; width: float; height: float
    words: list[Word]

def extract_pages(pdf_bytes: bytes) -> list[Page]
def group_lines(page: Page, *, y_tolerance: float = 3.0) -> list[Line]
def strip_running_text(pages: list[Page], *, band: float = 60.0, min_share: float = 0.6) -> list[Page]
def render_region(pdf_bytes: bytes, page: int, bbox: tuple[float, float, float, float], *, dpi: int = 200) -> bytes
```

- **`extract_pages`:** `pdfplumber.open(io.BytesIO(pdf_bytes))` and
  `page.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=["size"])`, with each
  word's text normalized by `unicodedata.normalize("NFKC", …)`. That turns math italic `𝑛` into `n`.
- **`group_lines`:** clusters words whose `top` values are within `y_tolerance` into a line, sorted
  by x.
- **`strip_running_text`** removes running headers and footers:
  - a candidate is a line within `band` points of a page's top or bottom edge;
  - compare candidates by their text with every run of digits replaced by `#`, so "Page 3 of 46" and
    "Page 4 of 46" match;
  - remove a line when that same text appears on at least `min_share` of pages.
- **`render_region`:** renders the region with `pypdfium2` at `dpi` and returns PNG bytes. It's for
  figures and garbled equations; callers store the bytes through `core/media_store.py`.

### `apps/pipeline/prepora_pipeline/core/pdf_segment.py` (#29)

```python
@dataclass
class Block:
    label: str              # "Q.31", "12."
    number: int             # 31, 12
    lines: list[Line]       # body lines in reading order, label text removed
    page: int               # page of the label
    bbox: tuple[float, float, float, float]  # union of label + body on that page, for crops

def segment(pages: list[Page], *, label: re.Pattern, label_max_x: float | None = None,
            lead_tolerance: float = 12.0) -> list[Block]
def split_options(block: Block, *, option: re.Pattern = re.compile(r"^\(([A-D])\)\s*")) -> tuple[list[str], dict[str, str]]
```

- **`segment`:** walks all lines in reading order (page, then top).
  - **Starting a block:** a line starts one when its **first word** matches `label` and, if
    `label_max_x` is set, that word's `x0 <= label_max_x`. This is the label column.
  - **Lines that lead their label:** body lines up to `lead_tolerance` points **above** a label line,
    and after the previous block's last line, belong to the new block. That handles the GATE Q.31
    case.
  - **Numbers:** `number` comes from the label's first integer.
  - **Ignored text:** anything before the first label (instructions, cover pages).
- **`split_options`:** returns the stem lines, plus `{"A": text, …}` when option labels are found at
  the start of lines, including options laid out side by side in 2 or 4 columns. In that case a
  single line holds several `(X)` markers: split it at each marker's `x0`.

### `apps/pipeline/prepora_pipeline/core/answer_keys.py` (#30)

```python
@dataclass(frozen=True)
class HeaderProfile:
    name: str
    columns: dict[str, tuple[str, ...]]   # canonical column → header aliases (case/space-insensitive)
    number_column: str = "number"

@dataclass(frozen=True)
class KeyRow:
    number: int
    values: dict[str, str]                # canonical column → cell text

def parse_key_table(pages: list[Page], profile: HeaderProfile) -> list[KeyRow]

@dataclass
class JoinReport:
    matched: list[tuple[Block, KeyRow]]
    missing_in_key: list[int]       # question numbers with no key row
    missing_in_paper: list[int]     # key rows with no question
    @property
    def ok(self) -> bool: ...       # both lists empty

def join_by_number(blocks: list[Block], rows: list[KeyRow]) -> JoinReport
```

- **`parse_key_table`:**
  - **Finding the header:** on each page, find the header line whose words match every alias set in
    `profile.columns`. Multi-word headers ("Q. No.", "Key/Range") are matched on the joined text of
    adjacent words. A header that wraps onto two lines (GATE 2024's "Question / Type") must also be
    found, so allow it to span up to 2 lines.
  - **Column bands:** each column's x-band runs from its header's `x0` to the next header's `x0`.
  - **Rows:** every line below the header whose `number_column` cell is an integer. Words go into
    cells by their x-midpoint.
  - **No header found:** raise `ValueError` naming the profile.
- **`join_by_number`:** matches blocks to key rows by question number and reports gaps. It never
  guesses.

## Tests (`apps/pipeline/test_pdf_stages.py`)

Build each PDF in the test with `reportlab.pdfgen.canvas`, using invented text only:
1. **Running text:** a 3-page paper with a running header, a "Page N of 3" footer, and 3 questions
   labelled `Q.1`–`Q.3` in a left column. `strip_running_text` removes the header and footer, and
   `segment` returns 3 blocks with the right numbers.
2. **A label below its text:** a question whose first body line sits 8pt *above* its `Q.2` label. It
   belongs to block 2, not block 1.
3. **Option layouts:** options in one column, 2 columns and 4 columns all split into A–D.
4. **NFKC:** a math italic `𝑛` in the text comes out as `n`.
5. **A key table** with headers `Q. No. | Type | Key/Range | Marks` and 5 rows, including `A;C`,
   `4.24 to 4.26` and `MTA`. All rows parse, with values in the right columns.
6. **A wrapped header:** the same key table with its header wrapped over 2 lines still parses.
7. **Joining:** `join_by_number` reports a missing key row and an extra key row.
8. **Cropping:** `render_region` returns a PNG (starts with `\x89PNG`) of the expected pixel size at
   200 dpi.

Then run `cd apps/pipeline && venv/bin/ruff check . && venv/bin/pytest -q`.

## Acceptance
- All tests pass in CI. The pipeline CI job installs `requirements.txt`, so the new dependencies are
  picked up automatically.
- [docs/connectors/README.md](../connectors/README.md) gains a short "Parsing PDFs" section pointing
  at these three modules, with a 10-line example.

## Risks
- **pdfminer word grouping varies with PDF producers**, so tolerances are parameters, not constants.
  Real GATE papers are exercised in [Spec 5](05-gate-pilot.md), on local files only.
- **`pypdfium2` wheels:** they exist for Linux, macOS and Windows on CPython 3.12. If CI's wheel
  resolution fails, pin to the latest version that has a 3.12 wheel.
