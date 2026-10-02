"""
Splitting a question paper into questions, and a question into its stem and options — the second
shared PDF stage (docs/specs/02-pdf-stages.md), built on core/pdf_text.py's positioned words.

Questions are found by their label ("Q.31", "12.") in a label column, not by line text alone: a
long option can wrap so that a question's label sits a few points *below* the start of its own text
(GATE CS-1 2026, Q.31). Body lines just above a label that *vertically overlap* it (within
`lead_tolerance`, 0 by default: strict overlap) therefore belong to that label's question. Lines
that merely sit close above it — the previous question's last option in a dense paper — stay with
the previous question.
"""
import re
from dataclasses import dataclass, field

from .pdf_text import Line, Page, Word, group_lines


@dataclass
class Block:
    label: str  # "Q.31", "12."
    number: int  # 31, 12
    lines: list[Line]  # body lines in reading order, the label word removed
    page: int  # page of the label
    bbox: tuple[float, float, float, float]  # label + body on the label's page, for crops
    label_line: Line = field(repr=False, default=None)  # type: ignore[assignment]


def segment(
    pages: list[Page],
    *,
    label: re.Pattern,
    label_max_x: float | None = None,
    lead_tolerance: float = 0.0,
) -> list[Block]:
    """
    Every question in reading order. A line starts a question when its first word matches `label`
    (and, with `label_max_x`, starts left of it). Anything before the first label — cover pages,
    instructions — is ignored.
    """
    lines = [line for page in pages for line in group_lines(page)]
    is_label = [_is_label(line, label, label_max_x) for line in lines]
    label_indexes = [i for i, yes in enumerate(is_label) if yes]
    if not label_indexes:
        return []

    # Each line belongs to the most recent label at or before it...
    owner: list[int | None] = [None] * len(lines)
    current = None
    for i in range(len(lines)):
        if is_label[i]:
            current = i
        owner[i] = current
    # ...except lines just above a label on the same page, which lead into it.
    for k, li in enumerate(label_indexes):
        previous_label = label_indexes[k - 1] if k > 0 else -1
        j = li - 1
        while (
            j > previous_label
            and lines[j].page == lines[li].page
            and lines[j].bottom > lines[li].top - lead_tolerance
        ):
            owner[j] = li
            j -= 1

    blocks = []
    for li in label_indexes:
        label_line = lines[li]
        first = label_line.words[0]
        digits = re.search(r"\d+", label.match(first.text).group(0))
        if digits is None:
            raise ValueError(f"Label {first.text!r} matched {label.pattern!r} but has no number.")
        number = int(digits.group(0))
        rest = label_line.words[1:]
        body: list[Line] = []
        for i, line in enumerate(lines):
            if owner[i] != li:
                continue
            if i == li:
                if rest:
                    body.append(_line_from(rest, line.page))
            else:
                body.append(line)
        body.sort(key=lambda line: (line.page, line.top, line.x0))
        on_page = [label_line] + [line for line in body if line.page == label_line.page]
        bbox = (
            min(line.x0 for line in on_page),
            min(line.top for line in on_page),
            max(line.x1 for line in on_page),
            max(line.bottom for line in on_page),
        )
        blocks.append(
            Block(
                label=first.text,
                number=number,
                lines=body,
                page=label_line.page,
                bbox=bbox,
                label_line=label_line,
            )
        )
    return blocks


def _is_label(line: Line, label: re.Pattern, label_max_x: float | None) -> bool:
    first = line.words[0]
    if not label.match(first.text):
        return False
    return label_max_x is None or first.x0 <= label_max_x


def _line_from(words: tuple[Word, ...] | list[Word], page: int) -> Line:
    return Line(
        words=tuple(words),
        page=page,
        top=min(w.top for w in words),
        bottom=max(w.bottom for w in words),
        x0=min(w.x0 for w in words),
        x1=max(w.x1 for w in words),
    )


OPTION_MARKER = re.compile(r"^\(([A-D])\)(.*)$")


def split_options(
    block: Block, *, option: re.Pattern = OPTION_MARKER, column_gap: float = 12.0
) -> tuple[list[str], dict[str, str]]:
    """
    (stem lines, {"A": text, …}). Option markers are words like "(A)"; text glued to a marker
    ("(A)127") is kept. A marker counts only at the start of a line, or after a gap of at least
    `column_gap` points (options laid out side by side in 2 or 4 columns) — so "Which of (A) and
    (B) is correct?" in a stem stays stem text. Lines after an option's marker continue that option
    until the next marker.
    """
    stem: list[str] = []
    options: dict[str, list[str]] = {}
    current: str | None = None
    for line in block.lines:
        pieces: list[tuple[str | None, list[str]]] = [(current, [])]
        previous: Word | None = None
        for word in line.words:
            marker = option.match(word.text)
            starts_column = previous is None or word.x0 - previous.x1 >= column_gap
            previous = word
            if marker and starts_column:
                current = marker.group(1)
                has_glued_text = marker.lastindex is not None and marker.lastindex >= 2
                glued = marker.group(2).strip() if has_glued_text else ""
                pieces.append((current, [glued] if glued else []))
            else:
                pieces[-1][1].append(word.text)
        for key, words in pieces:
            text = " ".join(words).strip()
            if key is None:
                if text:
                    stem.append(text)
            else:
                options.setdefault(key, [])
                if text:
                    options[key].append(text)
    return stem, {key: " ".join(parts).strip() for key, parts in options.items()}
