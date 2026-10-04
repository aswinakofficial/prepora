"""
Quality as data (docs/specs/07-intake.md, knowledge-index §4a): the issues that keep a parsed
question from being published as text, as machine-readable codes with a detail saying which rule
found them. An intake item with any issue is held until a fix clears it (Spec 9).

The layout detector here started as the GATE connector's garble detector (#47). It works on the
shared PDF stages' output (core/pdf_text.py, core/pdf_segment.py), so any PDF source can use it;
the thresholds are a source's QualityProfile, measured on that source's real papers.
"""
from dataclasses import asdict, dataclass
from statistics import median

from .pdf_segment import OPTION_MARKER
from .pdf_text import Graphic, Line, Page

# Every issue code, with the label the admin "Held questions" page shows
# (packages/api/src/lib/intake.ts mirrors this list).
ISSUE_CODES: dict[str, str] = {
    "figure": "Figure or image",
    "math": "Math that didn't extract cleanly",
    "layout": "Table or side-by-side layout",
    "image_option": "An option that is only an image",
    "type_mismatch": "Question type disagrees with the answer key",
    "invalid": "Failed validation",
}


@dataclass(frozen=True)
class Issue:
    code: str  # one of ISSUE_CODES
    detail: str  # which rule found it, or a validation message

    def __post_init__(self):
        if self.code not in ISSUE_CODES:
            raise ValueError(f"Unknown issue code {self.code!r}.")

    def to_json(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CropRegion:
    page: int  # 0-based
    bbox: tuple[float, float, float, float]  # (x0, top, x1, bottom)


@dataclass(frozen=True)
class QualityProfile:
    """A source's detector thresholds, in points, measured on its real papers."""

    script_line_gap: float  # a line this close below the previous one is a sub/superscript row
    script_size: float  # a word this much smaller than its line is an inline sub/superscript
    wide_gap: float  # a gap this wide inside one stem line means a table or side-by-side layout
    tall_empty_block: float  # a block this tall with under 5 words is mostly figure


# Measured on the four GATE CS pilot papers (2025-2026), docs/specs/05-gate-pilot.md.
GATE_QUALITY = QualityProfile(
    script_line_gap=9.0,
    script_size=0.8,
    # Two values spaced on one line ("X : 35C00000   Y : 34A00000") reach 36pt and read fine.
    wide_gap=40.0,
    tall_empty_block=120.0,
)


def _is_figure(g: Graphic) -> bool:
    # Exam papers are often laid out in tables, so hairline rectangles (cell borders) are
    # everywhere; a figure is an image, a drawn line or curve, or a box with real area.
    return g.kind != "rect" or (g.x1 - g.x0 > 2 and g.bottom - g.top > 2)


def detect_issues(
    lines: list[Line],
    stem: list[Line],
    options: dict[str, str],
    regions: list[CropRegion],
    pages: dict[int, Page],
    profile: QualityProfile,
) -> list[Issue]:
    """
    The layout issues of one question: `lines` is all of its text lines, `stem` the ones before its
    options, `regions` what it covers on each page. Each (code, detail) is reported once.
    """
    found: dict[tuple[str, str], None] = {}

    def add(code: str, detail: str):
        found[(code, detail)] = None

    text = " ".join(line.text for line in lines)

    # A figure: something drawn in the question's regions, an option with no text (it's an
    # image), or a tall block with almost no words.
    for region in regions:
        x0, top, x1, bottom = region.bbox
        if any(
            _is_figure(g) and g.x1 > x0 and g.x0 < x1 and g.bottom > top and g.top < bottom
            for g in pages[region.page].graphics
        ):
            add("figure", "something is drawn in the question")
    if any(value == "" for value in options.values()):
        add("image_option", "an option has no text")
    first = regions[0].bbox
    if len(text.split()) < 5 and first[3] - first[1] > profile.tall_empty_block:
        add("figure", "a tall block with almost no words")

    # Math that didn't survive: math alphanumerics left after NFKC, private-use glyphs, a row of
    # sub- or superscripts just below its line, a smaller-font word, or one token alone on 3+
    # consecutive lines.
    if any(0x1D400 <= ord(c) <= 0x1D7FF or 0xE000 <= ord(c) <= 0xF8FF for c in text):
        add("math", "math or private-use glyphs")
    # An option's "(A)" sits a few points off its own text's line, so pairs with a marker don't
    # count as a script row.
    unmarked = [line for line in lines if not OPTION_MARKER.match(line.words[0].text)]
    for above, below in zip(unmarked, unmarked[1:], strict=False):
        if below.page == above.page and 0 < below.top - above.top < profile.script_line_gap:
            add("math", "a row of sub- or superscripts")
    # An inline sub- or superscript merged into its line ("Θ(n 2 )" for Θ(n²)): a smaller font. Not
    # an option marker, which sits beside larger math type.
    for line in lines:
        sizes = [w.size for w in line.words if w.size]
        if sizes and any(
            w.size
            and w.size < profile.script_size * median(sizes)
            and not OPTION_MARKER.match(w.text)
            for w in line.words
        ):
            add("math", "an inline sub- or superscript")
    run = 0
    for line in lines:
        lone = len(line.words) == 1 and len(line.text) <= 3 and not OPTION_MARKER.match(line.text)
        run = run + 1 if lone else 0
        if run >= 3:
            add("math", "single tokens stacked on 3+ lines")

    # A table, or code laid out side by side: wide gaps inside a stem line read as one jumbled line.
    for line in stem:
        gaps = [b.x0 - a.x1 for a, b in zip(line.words, line.words[1:], strict=False)]
        if gaps and max(gaps) >= profile.wide_gap:
            add("layout", "wide gaps inside a line")
    return [Issue(code, detail) for code, detail in found]
