"""
Text with positions from PDF question papers and answer keys — the first shared PDF stage
(docs/specs/02-pdf-stages.md).

Line-by-line text isn't enough for exam papers: a long option can wrap so its label lands on a line
below its own text, math scatters over several lines, and figures come out as nothing at all (see
docs/sources/gate.md §4). So this works with words and their bounding boxes, and can render any
region of a page as an image for figures and garbled equations.

Coordinates are PDF points with the origin at the top-left of the page (`top` grows downward), as
pdfplumber reports them. Pure functions, bytes in: fetching goes through core/http_client.py and
raw files through core/artifact_store.py; storing a rendered crop is core/media_store.py's job.
"""
import io
import re
import unicodedata
from dataclasses import dataclass, field, replace
from typing import Literal

import pdfplumber
import pypdfium2


@dataclass(frozen=True)
class Word:
    text: str  # NFKC-normalized
    x0: float
    x1: float
    top: float
    bottom: float
    page: int  # 0-based
    size: float | None = None  # font size, when the PDF says
    fontname: str | None = None  # e.g. "Courier", for telling code apart from prose


@dataclass(frozen=True)
class Line:
    words: tuple[Word, ...]  # left to right
    page: int
    top: float
    bottom: float
    x0: float
    x1: float

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


@dataclass(frozen=True)
class Graphic:
    """Something drawn rather than written: an embedded image, or a vector rectangle, line or
    curve. Text extraction never sees these, so they're how a figure shows itself."""

    kind: Literal["image", "rect", "line", "curve"]
    x0: float
    top: float
    x1: float
    bottom: float
    page: int


@dataclass
class Page:
    number: int  # 0-based
    width: float
    height: float
    words: list[Word]
    graphics: list[Graphic] = field(default_factory=list)


def normalize_text(text: str) -> str:
    """NFKC, so math-italic and full-width letters ("𝑛", "ｎ") read as plain ones ("n")."""
    return unicodedata.normalize("NFKC", text)


def extract_pages(pdf_bytes: bytes) -> list[Page]:
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for number, page in enumerate(pdf.pages):
            words = [
                Word(
                    text=normalize_text(w["text"]),
                    x0=float(w["x0"]),
                    x1=float(w["x1"]),
                    top=float(w["top"]),
                    bottom=float(w["bottom"]),
                    page=number,
                    size=float(w["size"]) if w.get("size") is not None else None,
                    fontname=w.get("fontname"),
                )
                for w in page.extract_words(
                    keep_blank_chars=False, use_text_flow=False, extra_attrs=["size", "fontname"]
                )
            ]
            graphics = [
                Graphic(kind, float(g["x0"]), float(g["top"]), float(g["x1"]), float(g["bottom"]),
                        number)
                for kind, items in (
                    ("image", page.images),
                    ("rect", page.rects),
                    ("line", page.lines),
                    ("curve", page.curves),
                )
                for g in items
            ]
            pages.append(
                Page(
                    number=number,
                    width=float(page.width),
                    height=float(page.height),
                    words=words,
                    graphics=graphics,
                )
            )
    return pages


def group_lines(page: Page, *, y_tolerance: float = 3.0) -> list[Line]:
    """Words whose tops are within `y_tolerance` of a line's first word form that line."""
    lines: list[list[Word]] = []
    for word in sorted(page.words, key=lambda w: (w.top, w.x0)):
        if lines and abs(word.top - lines[-1][0].top) <= y_tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [_line(sorted(words, key=lambda w: w.x0), page.number) for words in lines]


def _line(words: list[Word], page: int) -> Line:
    return Line(
        words=tuple(words),
        page=page,
        top=min(w.top for w in words),
        bottom=max(w.bottom for w in words),
        x0=min(w.x0 for w in words),
        x1=max(w.x1 for w in words),
    )


def _running_key(text: str) -> str:
    # "Page 3 of 46" and "Page 4 of 46" are the same running text.
    return re.sub(r"\d+", "#", " ".join(text.lower().split()))


def strip_running_text(
    pages: list[Page], *, band: float = 60.0, min_share: float = 0.6
) -> list[Page]:
    """
    Removes running headers and footers: lines within `band` points of a page's top or bottom edge
    whose text (digits ignored) appears on at least `min_share` of the pages. A one-page document
    has nothing to compare against and is returned unchanged.
    """
    if len(pages) < 2:
        return pages
    candidates: dict[int, list[tuple[Line, str]]] = {}
    seen_on: dict[str, set[int]] = {}
    for page in pages:
        for line in group_lines(page):
            if line.top < band or line.bottom > page.height - band:
                key = _running_key(line.text)
                candidates.setdefault(page.number, []).append((line, key))
                seen_on.setdefault(key, set()).add(page.number)
    threshold = max(2, round(min_share * len(pages)))
    running = {key for key, on in seen_on.items() if len(on) >= threshold}

    stripped = []
    for page in pages:
        drop = {
            id(word)
            for line, key in candidates.get(page.number, [])
            if key in running
            for word in line.words
        }
        stripped.append(replace(page, words=[w for w in page.words if id(w) not in drop]))
    return stripped


def strip_running_graphics(pages: list[Page], *, min_share: float = 0.6) -> list[Page]:
    """
    Removes page furniture: graphics (a watermark, a logo, border rectangles) drawn at the same
    place, rounded to the point, on at least `min_share` of the pages. What's left is the content's
    own figures and tables. A one-page document is returned unchanged.
    """
    if len(pages) < 2:
        return pages

    def key(g: Graphic) -> tuple:
        return (g.kind, round(g.x0), round(g.top), round(g.x1), round(g.bottom))

    seen_on: dict[tuple, set[int]] = {}
    for page in pages:
        for g in page.graphics:
            seen_on.setdefault(key(g), set()).add(page.number)
    threshold = max(2, round(min_share * len(pages)))
    running = {k for k, on in seen_on.items() if len(on) >= threshold}
    return [replace(p, graphics=[g for g in p.graphics if key(g) not in running]) for p in pages]


def render_region(
    pdf_bytes: bytes,
    page: int,
    bbox: tuple[float, float, float, float],
    *,
    dpi: int = 200,
) -> bytes:
    """A PNG of `bbox` = (x0, top, x1, bottom) on `page`, at `dpi`."""
    document = pypdfium2.PdfDocument(pdf_bytes)
    try:
        pdf_page = document[page]
        width, height = pdf_page.get_size()
        x0, top, x1, bottom = bbox
        # pypdfium2 crops by how much to cut from each side: (left, bottom, right, top).
        crop = (max(0.0, x0), max(0.0, height - bottom), max(0.0, width - x1), max(0.0, top))
        bitmap = pdf_page.render(scale=dpi / 72, crop=crop)
        image = bitmap.to_pil()
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()
    finally:
        document.close()
