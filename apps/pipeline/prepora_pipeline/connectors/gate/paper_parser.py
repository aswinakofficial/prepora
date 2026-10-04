"""
GATE question papers (#47): the paper's PDF → one GateQuestion per question, with its stem, its
options (none for NAT), and the reasons, if any, its text alone can't be trusted.

Built on the shared PDF stages (core/pdf_text.py, core/pdf_segment.py). What's GATE-specific, all
measured on the four pilot papers (CS-1/CS-2, 2025 and 2026, 2026-10-02):

- Question labels ("Q.11") sit at x ≈ 78pt. The left margin at x ≈ 72pt holds only the section
  title ("General Aptitude (GA)") and the marks headings ("Q.11 – Q.35 Carry ONE mark Each"),
  which also start with "Q.n", so margin lines are read for marks and then dropped.
- Code is set in a monospace font (Courier New, Consolas); it's kept as a fenced block.
- Math is set in Cambria Math. Inline symbols survive extraction, but subscripts, superscripts and
  stacked fractions come out as separate short lines, and tables or side-by-side code merge into
  lines with wide gaps. Figures are embedded images or vector drawings, which text extraction
  never sees. Any of these flags the question, and the importer attaches a crop of it.
"""
import re
from dataclasses import dataclass, field, replace

from ...core.pdf_segment import OPTION_MARKER, Block, segment, split_options
from ...core.pdf_text import (
    Line,
    Page,
    group_lines,
    strip_running_graphics,
    strip_running_text,
)
from ...core.quality import GATE_QUALITY, CropRegion, Issue, detect_issues

LABEL = re.compile(r"^Q\.(\d+)$")
LABEL_MAX_X = 90.0  # labels at x ≈ 78pt in every pilot paper
MARGIN_X = 75.0  # section and marks headings at x ≈ 72pt, left of the labels
MARKS_HEADING = re.compile(
    r"^Q\.(\d+)\s*[–—-]\s*Q\.(\d+)\s+Carry\s+(ONE|TWO)\s+marks?\s+Each", re.IGNORECASE
)
CODE_FONTS = ("courier", "consolas", "mono")

# Crop geometry, in points.
CROP_PADDING = 6.0
RUNNING_BAND = 60.0  # the running header's band; a continuation page's content starts below it
TITLE_MAX_WORDS = 8  # a margin line longer than this isn't a section title


class GatePaperError(ValueError):
    pass


@dataclass
class GateQuestion:
    number: int
    label: str  # "Q.11"
    text: str  # paragraphs separated by blank lines; code as ``` fenced blocks
    options: dict[str, str]  # {"A": …, …}; {} for a NAT question. "" = an image-only option
    marks_heading: int | None  # from the paper's "Carry ONE mark Each" headings: a cross-check
    page: int  # where the label is (0-based)
    regions: list[CropRegion]  # what to crop: one per page the question is on, label page first
    # Why its text alone can't be trusted (core/quality.py); none means clean.
    issues: list[Issue] = field(default_factory=list)

    @property
    def flags(self) -> list[str]:
        return sorted({issue.code for issue in self.issues})

    @property
    def spans_pages(self) -> bool:
        return len(self.regions) > 1


def parse_paper(pages: list[Page]) -> list[GateQuestion]:
    pages = strip_running_graphics(strip_running_text(pages))
    pages = [_join_split_labels(page) for page in pages]
    marks_by_number, pages = _take_margin(pages)
    blocks = segment(pages, label=LABEL, label_max_x=LABEL_MAX_X)
    page_by_number = {p.number: p for p in pages}
    tops_by_page: dict[int, list[float]] = {}
    for block in blocks:
        tops_by_page.setdefault(block.page, []).append(block.label_line.top)

    questions = []
    for block in blocks:
        _, options = split_options(block)
        stem_lines = _stem_lines(block) if options else block.lines
        stem_lines = [line for line in stem_lines if not _is_answer_blank(line, bool(options))]
        regions = _regions(block, page_by_number, tops_by_page)
        questions.append(
            GateQuestion(
                number=block.number,
                label=block.label,
                text=_text(stem_lines),
                options=options,
                marks_heading=marks_by_number.get(block.number),
                page=block.page,
                regions=regions,
                issues=detect_issues(
                    block.lines, stem_lines, options, regions, page_by_number, GATE_QUALITY
                ),
            )
        )
    return questions


def _join_split_labels(page: Page) -> Page:
    """Some labels are extracted as two words, "Q." and "4" (2026 CS-2, Q.4 and Q.9)."""
    words = []
    for line in group_lines(page):
        merged = list(line.words)
        if (
            len(merged) >= 2
            and merged[0].text == "Q."
            and merged[1].text.isdigit()
            and merged[1].x0 - merged[0].x1 < 15
        ):
            first, number = merged[0], merged[1]
            merged[:2] = [replace(first, text=f"Q.{number.text}", x1=number.x1)]
        words.extend(merged)
    return replace(page, words=words)


def _take_margin(pages: list[Page]) -> tuple[dict[int, int], list[Page]]:
    """Marks per question number from the margin's headings, and the pages without the margin."""
    marks: dict[int, int] = {}
    kept = []
    for page in pages:
        drop = set()
        for line in group_lines(page):
            if line.x0 >= MARGIN_X:
                continue
            heading = MARKS_HEADING.match(line.text)
            # Only headings live in the margin. Anything else there would be content this parser
            # doesn't expect; it's never dropped silently.
            if not heading and len(line.words) > TITLE_MAX_WORDS:
                raise GatePaperError(
                    f"Unexpected text in the margin on page {page.number + 1}: {line.text!r}"
                )
            drop.update(id(w) for w in line.words)
            if heading:
                first, last = int(heading.group(1)), int(heading.group(2))
                value = 1 if heading.group(3).upper() == "ONE" else 2
                marks.update({n: value for n in range(first, last + 1)})
        kept.append(replace(page, words=[w for w in page.words if id(w) not in drop]))
    return marks, kept


def _stem_lines(block: Block) -> list[Line]:
    """The lines before the first option marker that starts a line."""
    for i, line in enumerate(block.lines):
        if OPTION_MARKER.match(line.words[0].text):
            return block.lines[:i]
    return block.lines


def _is_answer_blank(line: Line, has_options: bool) -> bool:
    # A NAT question ends with a "________" line to write the answer on; it isn't content. (A
    # blank inside a sentence, "is ________.", is kept: it's part of the question.)
    return (
        not has_options
        and "_" in line.text
        and all(set(w.text) <= set("_.") for w in line.words)
    )


def _is_code(line: Line) -> bool:
    fonts = [(w.fontname or "").lower() for w in line.words]
    return sum(any(c in f for c in CODE_FONTS) for f in fonts) * 2 > len(fonts)


def _text(lines: list[Line]) -> str:
    """Prose lines joined into paragraphs; monospace lines kept as fenced code, indented."""
    parts: list[str] = []
    paragraph: list[str] = []
    code: list[Line] = []
    previous: Line | None = None

    def flush_paragraph():
        if paragraph:
            parts.append(" ".join(paragraph))
            paragraph.clear()

    def flush_code():
        if code:
            left = min(line.x0 for line in code)
            width = _char_width(code)
            body = "\n".join(
                " " * round((line.x0 - left) / width) + _spaced(line, width) for line in code
            )
            parts.append(f"```\n{body}\n```")
            code.clear()

    for line in lines:
        if _is_code(line):
            flush_paragraph()
            code.append(line)
        else:
            flush_code()
            if previous is not None and line.top - previous.bottom > _line_height(previous):
                flush_paragraph()
            paragraph.append(line.text)
        previous = line
    flush_paragraph()
    flush_code()
    return "\n\n".join(parts).strip()


def _line_height(line: Line) -> float:
    return line.bottom - line.top


def _char_width(lines: list[Line]) -> float:
    widths = [(w.x1 - w.x0) / len(w.text) for line in lines for w in line.words if w.text]
    return max(min(widths), 1.0) if widths else 6.0


def _spaced(line: Line, width: float) -> str:
    """A code line with its inner spacing kept (monospace: gaps are whole characters)."""
    out = line.words[0].text
    for left, right in zip(line.words, line.words[1:], strict=False):
        out += " " * max(1, round((right.x0 - left.x1) / width)) + right.text
    return out


def _regions(
    block: Block, pages: dict[int, Page], tops_by_page: dict[int, list[float]]
) -> list[CropRegion]:
    """What to crop, on each page the question is on: the full text width, from the label (or the
    top of a continuation page) down to the next question on the page, or else to whatever the
    question has there, figures included."""
    on_pages = sorted({block.page} | {line.page for line in block.lines})
    regions = []
    for number in on_pages:
        page = pages[number]
        top = block.label_line.top if number == block.page else RUNNING_BAND
        later = [t for t in tops_by_page.get(number, []) if t > top]
        if later:
            bottom = min(later)
        else:
            lines = [line.bottom for line in block.lines if line.page == number]
            if number == block.page:
                lines.append(block.label_line.bottom)
            drawn = [g.bottom for g in page.graphics if g.top >= top - 1]
            bottom = max(lines + drawn) + CROP_PADDING
        regions.append(
            CropRegion(
                number,
                (
                    MARGIN_X - CROP_PADDING,
                    max(0.0, top - CROP_PADDING),
                    page.width - MARGIN_X + CROP_PADDING,
                    min(page.height, bottom),
                ),
            )
        )
    return regions
