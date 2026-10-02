"""
Reading answer-key tables, and joining them to a paper's questions — the third shared PDF stage
(docs/specs/02-pdf-stages.md). GATE, Kerala PSC, NEET and UPSC all publish their keys as tables
whose headers change from year to year, so a key is read through a *header profile*: the
canonical columns a source's tables have, each with the header spellings seen for it.

Cells are assigned by position: a row's words are grouped into cells by the gaps between them (so
"4.24 to 4.26" stays one cell), and each cell goes to the column whose header is horizontally
nearest.
Nothing is guessed — a table whose header can't be found raises, and a join reports every question
or key row left unmatched.
"""
import re
from dataclasses import dataclass, field

from .pdf_segment import Block
from .pdf_text import Line, Page, Word, group_lines


@dataclass(frozen=True)
class HeaderProfile:
    name: str
    # canonical column → header spellings, compared case-, space- and punctuation-insensitively
    columns: dict[str, tuple[str, ...]]
    number_column: str = "number"


@dataclass(frozen=True)
class KeyRow:
    number: int
    values: dict[str, str]  # canonical column → cell text
    page: int = 0


@dataclass
class JoinReport:
    matched: list[tuple[Block, KeyRow]] = field(default_factory=list)
    missing_in_key: list[int] = field(default_factory=list)  # questions with no key row
    missing_in_paper: list[int] = field(default_factory=list)  # key rows with no question

    @property
    def ok(self) -> bool:
        return not self.missing_in_key and not self.missing_in_paper


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


@dataclass(frozen=True)
class _Token:
    """A header word, or a stack of words from a header wrapped over two lines."""

    text: str
    x0: float
    x1: float

    @property
    def center(self) -> float:
        return (self.x0 + self.x1) / 2


def _match_columns(tokens: list[_Token], profile: HeaderProfile) -> dict[str, _Token] | None:
    """Finds every profile column among runs of up to 4 adjacent tokens; None if any is missing."""
    found: dict[str, _Token] = {}
    for column, aliases in profile.columns.items():
        wanted = {_norm(a) for a in aliases}
        hit = None
        for start in range(len(tokens)):
            for length in range(1, 5):
                run = tokens[start : start + length]
                if len(run) < length:
                    break
                if _norm("".join(t.text for t in run)) in wanted:
                    hit = _Token(" ".join(t.text for t in run), run[0].x0, run[-1].x1)
                    break
            if hit:
                break
        if hit is None:
            return None
        found[column] = hit
    return found


def _tokens(words: list[Word]) -> list[_Token]:
    return [_Token(w.text, w.x0, w.x1) for w in sorted(words, key=lambda w: w.x0)]


def _stacked_tokens(upper: Line, lower: Line) -> list[_Token]:
    """Words from two header lines, with words that overlap horizontally merged top-to-bottom."""
    stacks: list[list[Word]] = []
    for word in sorted(list(upper.words) + list(lower.words), key=lambda w: (w.x0, w.top)):
        for stack in stacks:
            if word.x0 < max(w.x1 for w in stack) and word.x1 > min(w.x0 for w in stack):
                stack.append(word)
                break
        else:
            stacks.append([word])
    tokens = []
    for stack in stacks:
        stack.sort(key=lambda w: (w.top, w.x0))
        text = " ".join(w.text for w in stack)
        tokens.append(_Token(text, min(w.x0 for w in stack), max(w.x1 for w in stack)))
    return sorted(tokens, key=lambda t: t.x0)


def _find_header(lines: list[Line], profile: HeaderProfile) -> tuple[int, dict[str, _Token]] | None:
    """(index of the last header line, columns) for the first header on these lines."""
    for i, line in enumerate(lines):
        columns = _match_columns(_tokens(list(line.words)), profile)
        if columns:
            return i, columns
        if i + 1 < len(lines):
            columns = _match_columns(_stacked_tokens(line, lines[i + 1]), profile)
            if columns:
                return i + 1, columns
    return None


def _cells(line: Line, gap: float) -> list[list[Word]]:
    cells: list[list[Word]] = []
    for word in line.words:
        if cells and word.x0 - cells[-1][-1].x1 <= gap:
            cells[-1].append(word)
        else:
            cells.append([word])
    return cells


def parse_key_table(
    pages: list[Page], profile: HeaderProfile, *, cell_gap: float = 8.0
) -> list[KeyRow]:
    """
    Every row of the key table, in page order. Each page's own header is used when it repeats;
    a continuation page without one reuses the previous page's columns.
    """
    rows: list[KeyRow] = []
    columns: dict[str, _Token] | None = None
    for page in pages:
        lines = group_lines(page)
        header = _find_header(lines, profile)
        if header:
            header_index, columns = header
            body = lines[header_index + 1 :]
        elif columns is not None:
            body = lines
        else:
            continue
        for line in body:
            cells: dict[str, list[str]] = {}
            for cell in _cells(line, cell_gap):
                mid = (cell[0].x0 + cell[-1].x1) / 2
                column = min(columns, key=lambda c: abs(columns[c].center - mid))
                cells.setdefault(column, []).extend(w.text for w in cell)
            number_text = " ".join(cells.get(profile.number_column, []))
            if not re.fullmatch(r"\d+", number_text):
                continue
            rows.append(
                KeyRow(
                    number=int(number_text),
                    values={c: " ".join(v) for c, v in cells.items()},
                    page=page.number,
                )
            )
    if columns is None:
        raise ValueError(f"No answer-key header matching profile {profile.name!r} was found.")
    return rows


def join_by_number(blocks: list[Block], rows: list[KeyRow]) -> JoinReport:
    """Pairs questions with key rows by question number; anything unmatched is reported, never
    guessed."""
    by_number = {row.number: row for row in rows}
    report = JoinReport()
    question_numbers = set()
    for block in blocks:
        question_numbers.add(block.number)
        row = by_number.get(block.number)
        if row is None:
            report.missing_in_key.append(block.number)
        else:
            report.matched.append((block, row))
    report.missing_in_paper = sorted(n for n in by_number if n not in question_numbers)
    return report
