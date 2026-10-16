"""
Math rebuilt from a PDF's own glyphs (docs/specs/13-math-recovery.md, ADR-016): the shared stage
that turns the positioned words of one question (core/pdf_text.py) into words in which every
formula is LaTeX, deterministically and with no AI.

Text extraction flattens notation: a subscript comes out as a separate smaller word on a line of its
own ("L 1" for L1), and NFKC erases the difference between an italic variable and a plain
letter. The PDF still has what's needed to put it back, because pdfplumber splits a word wherever
the font or its size changes, and gives every word its box:

- a script is a word smaller than its line, raised or lowered against the glyph it follows;
- a math run is a word in a math font, or one whose text before NFKC holds a math italic letter, a
  letterlike symbol (ℝ) or a Symbol-font private-use glyph.

rebuild_math() is pure (words in, words out) and depends on no connector: a source passes its
thresholds as a MathProfile. A formula leaves as one `Word` whose text is the LaTeX between two
internal markers (MATH_OPEN, MATH_CLOSE), so nothing downstream splits it, and
core/markdown.py `escape_markdown_with_math` turns it into `$…$`.

What the rebuild can't explain, it names (REBUILD_REASONS) and never certifies: the caller keeps the
question's original text unless the rebuild has no reason at all (all or nothing, Decision 2).
Overbars and fractions aren't rebuilt, but they are always detected, so a formula is never
certified without a bar it can't see. Everything it emits comes from core/latex_symbols.json, which
packages/api/src/lib/latex-symbols.test.ts renders with KaTeX set to throw.
"""
import json
import re
from dataclasses import dataclass, field, replace
from pathlib import Path
from statistics import median

from .markdown import MATH_CLOSE, MATH_OPEN
from .pdf_segment import OPTION_MARKER
from .pdf_text import Graphic, Line, Word, font_family, is_code_line

__all__ = [
    "DETECTOR_REASONS",
    "GATE_MATH",
    "MATH_CLOSE",
    "MATH_OPEN",
    "REBUILD_REASONS",
    "MathProfile",
    "RebuildResult",
    "rebuild_math",
]

# Why a rebuild isn't accepted. The sentence completes "Math that didn't extract cleanly: …" when
# the question is held for it.
REBUILD_REASONS: dict[str, str] = {
    "no_base": "the rebuild found a sub- or superscript with nothing beside it",
    "unclear_level": "the rebuild found a script it couldn't place as clearly raised or lowered",
    "too_deep": "the rebuild found scripts nested more than two levels",
    "overbar": "the rebuild found an overbar, which it doesn't rebuild",
    "fraction": "the rebuild found a fraction, which it doesn't rebuild",
    "unknown_symbol": "the rebuild found a symbol outside its table",
    "small_type": "the rebuild left smaller type it couldn't place as a script",
    "not_script": "the rebuild found a row just below its line that isn't smaller type",
    "stacked": "the rebuild can't read stacked lines (a case split or a matrix)",
}

# core/quality.py's math rules (their `detail`), read after a rebuild, and the reason each is.
DETECTOR_REASONS: dict[str, str] = {
    "math or private-use glyphs": "unknown_symbol",
    "an inline sub- or superscript": "small_type",
    "a row of sub- or superscripts": "not_script",
    "single tokens stacked on 3+ lines": "stacked",
}


@dataclass(frozen=True)
class MathProfile:
    """A source's rebuild thresholds, in points, measured on its real papers."""

    script_size: float  # a word under this × its neighbours' size is a script (and a nested one)
    script_shift: float  # a script's centre this far (× its base's size) off its base's is placed
    attach_gap: float  # a script starts within this of its base's right edge (or overlaps by it)
    glue_gap: float  # words closer than this are written together; a space is wider
    bar_thickness: float  # a filled rectangle this thin or thinner is a bar, not a figure
    bar_max_length: float  # a bar this long or longer is a table border
    math_fonts: tuple[str, ...]  # `font_family` names
    code_fonts: tuple[str, ...]  # passed to `is_code_line`


# Measured on the four GATE CS pilot papers (2025-2026), 2026-10-16, docs/specs/13-math-recovery.md.
GATE_MATH = MathProfile(
    script_size=0.8,  # as GATE_QUALITY; Word's scripts are 8.5pt in 12pt type (0.71)
    script_shift=0.12,  # Cambria Math raises/lowers a script's centre by 0.25-0.30 of the base
    attach_gap=2.5,
    glue_gap=1.2,
    bar_thickness=2.0,  # the same limit as quality._is_figure; fraction bars are 0.7-1.1pt
    bar_max_length=90.0,  # fraction bars are 7-35pt; table borders 42pt and up
    math_fonts=("cambriamath", "symbol", "symbolmt"),
    code_fonts=("courier", "consolas", "mono"),
)


@dataclass
class RebuildResult:
    lines: list[Line]
    reasons: list[str] = field(default_factory=list)  # codes from REBUILD_REASONS, in order found
    formulas: int = 0  # how many formulas were written


_TABLE = json.loads((Path(__file__).parent / "latex_symbols.json").read_text(encoding="utf-8"))
_CHARS: dict[str, str] = _TABLE["chars"]
_OPERATORS: dict[str, str] = _TABLE["operators"]
_SYMBOL_PUA: dict[str, str] = _TABLE["symbol_pua"]
# A Symbol font without a ToUnicode map extracts its codes as Adobe Standard encoding characters
# ("a" for alpha, a dieresis for the union sign); in a Symbol-font word they mean the Symbol glyph.
_SYMBOL_LATIN: dict[str, str] = _TABLE["symbol_latin"]

_OVERBAR_MARKS = {"̅", "̄", "¯"}  # combining overline, combining macron, macron
_PRIMES = {"′", "″", "'", "’"}
# A glued word made only of these is part of a formula in any font (brackets, operators, digits).
_MATH_SAFE = set("0123456789()[]+-=<>*/|,.;:!?'−")
_PUNCTUATION = set(",.;:!?")
_ASCII_LETTER = re.compile(r"[A-Za-z]+")
_COMMAND_END = re.compile(r"\\[A-Za-z]+$")


def _raw(word: Word) -> str:
    return word.raw_text if word.raw_text is not None else word.text


def _has_math_char(raw: str) -> bool:
    return any(
        0x1D400 <= ord(c) <= 0x1D7FF or 0x2100 <= ord(c) <= 0x214F or 0xF020 <= ord(c) <= 0xF0FF
        for c in raw
    )


def _cat(left: str, right: str) -> str:
    """Joins two pieces of LaTeX, keeping a command apart from the letter that follows it."""
    if left and right and _COMMAND_END.search(left) and right[0].isascii() and right[0].isalpha():
        return f"{left} {right}"
    return left + right


@dataclass
class _Piece:
    """LaTeX for a stretch of a formula, and whether its ends are upright text or an upright name
    (a space between two pieces is written `\\ ` only next to one of those)."""

    latex: str
    first_upright: bool = False
    last_upright: bool = False


class _Context:
    def __init__(self, profile: MathProfile):
        self.profile = profile
        self.reasons: dict[str, None] = {}

    def fail(self, code: str) -> None:
        self.reasons[code] = None

    def convert(self, raw: str, family: str, math_font: bool) -> _Piece:
        """A word's characters as LaTeX, from its text before NFKC."""
        italic_font = "italic" in family or "oblique" in family
        symbol_font = family.startswith("symbol")
        parts: list[tuple[str, bool]] = []
        i = 0
        while i < len(raw):
            if symbol_font and raw[i] in _SYMBOL_LATIN:
                parts.append((_SYMBOL_LATIN[raw[i]], False))
                i += 1
                continue
            letters = _ASCII_LETTER.match(raw, i)
            if letters:
                run = letters.group(0)
                i = letters.end()
                if italic_font and not math_font:
                    parts.append((run, False))  # an emphasised variable
                elif math_font and run in _OPERATORS:
                    parts.append((_OPERATORS[run], True))
                elif math_font and len(run) == 1:
                    parts.append((f"\\mathrm{{{run}}}", False))
                else:
                    parts.append((f"\\text{{{run}}}", True))
                continue
            c = raw[i]
            i += 1
            if c in _CHARS:
                parts.append((_CHARS[c], False))
            elif c in _SYMBOL_PUA:
                parts.append((_SYMBOL_PUA[c], False))
            elif c in _OVERBAR_MARKS:
                self.fail("overbar")
            else:
                self.fail("unknown_symbol")
        latex = ""
        for text, _ in parts:
            latex = _cat(latex, text)
        return _Piece(latex, bool(parts and parts[0][1]), bool(parts and parts[-1][1]))


def _join(left: _Piece, right: _Piece, gap: float, glue_gap: float) -> _Piece:
    if gap < glue_gap:
        sep = ""
    elif left.last_upright or right.first_upright:
        sep = "\\ "
    else:
        sep = " "
    latex = _cat(left.latex + sep, right.latex) if sep else _cat(left.latex, right.latex)
    return _Piece(latex, left.first_upright, right.last_upright)


@dataclass
class _E:
    """A word the rebuild reads: not code, not an option's "(A)"."""

    word: Word
    line: int  # index into the lines passed in
    script: bool = False

    @property
    def size(self) -> float:
        return self.word.size or 0.0

    @property
    def cy(self) -> float:
        return (self.word.top + self.word.bottom) / 2

    @property
    def h(self) -> float:
        return self.word.bottom - self.word.top


@dataclass
class _Group:
    """The words of one script (`k+1`), hanging off one parent as a sub- or superscript."""

    parent: int  # index into the eligible words
    members: list[int]
    level: str = ""  # "sub" or "sup"
    depth: int = 1


@dataclass
class _Unit:
    """A main-text word (with its scripts) as the formula builder sees it."""

    e: _E
    idx: int  # into the eligible words
    piece: _Piece | None  # None for plain prose
    prefix: str = ""  # prose in the same word before the formula (a prose-font base's leading text)
    math: bool = False
    safe: bool = False  # the whole word is brackets, operators, digits or punctuation
    box: tuple[float, float, float, float] = (0, 0, 0, 0)  # the word and its scripts

    @property
    def x0(self) -> float:
        return self.box[0]

    @property
    def x1(self) -> float:
        return self.box[2]


def rebuild_math(
    lines: list[Line], graphics: list[Graphic], profile: MathProfile
) -> RebuildResult:
    """
    The question's lines with every formula rebuilt as LaTeX, and the reasons for anything the
    rebuild couldn't explain. `graphics` is what's drawn on the question's pages. A line with no
    math in it comes back as the same `Line`.
    """
    ctx = _Context(profile)
    marker_splits: dict[int, tuple[Word, Word]] = {}  # id(remainder) -> (original, marker)
    work: list[list[Word]] = []
    fixed: set[int] = set()  # id() of words the rebuild leaves alone
    for line in lines:
        if is_code_line(line, profile.code_fonts):
            work.append(list(line.words))
            fixed.update(id(w) for w in line.words)
            continue
        words = _split_markers(line.words, marker_splits)
        for w in words:
            marker = OPTION_MARKER.match(w.text)
            if marker and marker.group(2) == "":
                fixed.add(id(w))
        work.append(words)

    eligible = [
        _E(w, li) for li, words in enumerate(work) for w in words if id(w) not in fixed
    ]
    sizes = [e.size for e in eligible if e.size]
    if not sizes:
        return RebuildResult(list(lines))
    body = median(sizes)
    for e in eligible:
        e.script = bool(e.size) and e.size < profile.script_size * body

    parent, groups, group_of = _attach(eligible, profile, ctx)
    consumed = {m for g in groups for m in g.members}
    children: dict[int, list[_Group]] = {}
    for g in groups:
        children.setdefault(g.parent, []).append(g)

    # Units: the main words of each line, with their scripts written into them.
    units_by_line: dict[int, list[_Unit]] = {}
    for idx, e in enumerate(eligible):
        if idx in consumed or e.script:
            continue
        units_by_line.setdefault(e.line, []).append(_unit(idx, eligible, children, profile, ctx))

    replacements: dict[int, Word] = {}  # id(first word of a formula) -> its Word
    dropped: set[int] = set()  # id() of words folded into a formula
    formula_boxes: list[tuple[int, tuple[float, float, float, float], int]] = []
    count = 0
    for li, units in units_by_line.items():
        units.sort(key=lambda u: u.x0)
        for built, members, box in _formulas(units, profile, ctx):
            count += 1
            replacements[id(members[0].e.word)] = built
            for u in members:
                dropped.add(id(u.e.word))
            formula_boxes.append((li, box, len(members)))
        # Prime glued after a superscript: x^2' is a double superscript in TeX.
        for u, nxt in zip(units, units[1:], strict=False):
            if (
                nxt.e.word.text[:1] in _PRIMES
                and nxt.x0 - u.x1 < profile.glue_gap
                and any(g.level == "sup" for g in children.get(u.idx, []))
            ):
                ctx.fail("unclear_level")

    for idx, e in enumerate(eligible):
        if idx in consumed:
            dropped.add(id(e.word))

    _find_bars(eligible, units_by_line, graphics, profile, ctx)
    _find_stacked_fractions(eligible, units_by_line, formula_boxes, work, fixed, ctx)
    for idx, e in enumerate(eligible):
        if e.script and idx not in consumed:
            ctx.fail("no_base")

    out: list[Line] = []
    for li, line in enumerate(lines):
        words: list[Word] = []
        for w in work[li]:
            if id(w) in replacements:
                words.append(replacements[id(w)])
            elif id(w) not in dropped:
                words.append(w)
        words = _unsplit(words, marker_splits)
        if not words:
            continue
        if [id(w) for w in words] == [id(w) for w in line.words]:
            out.append(line)
        else:
            out.append(
                Line(
                    words=tuple(words),
                    page=line.page,
                    top=min(w.top for w in words),
                    bottom=max(w.bottom for w in words),
                    x0=min(w.x0 for w in words),
                    x1=max(w.x1 for w in words),
                )
            )
    return RebuildResult(out, list(ctx.reasons), count)


def _split_markers(words: tuple[Word, ...], splits: dict[int, tuple[Word, Word]]) -> list[Word]:
    """An option's "(A)" glued to its text ("(A)2") becomes two words, so the text can be a base.
    Where nothing comes of it, `_unsplit` puts the original back."""
    out: list[Word] = []
    previous: Word | None = None
    for w in words:
        match = OPTION_MARKER.match(w.text)
        starts_column = previous is None or w.x0 - previous.x1 >= 12.0
        previous = w
        if not (match and starts_column and match.group(2) and w.text.startswith("(")):
            out.append(w)
            continue
        marker_text = w.text[: 3]
        rest = w.text[3:]
        raw = _raw(w)
        raw_rest = raw[3:] if raw.startswith(marker_text) else rest
        cut = w.x0 + (w.x1 - w.x0) * 3 / len(w.text)
        marker = replace(w, text=marker_text, raw_text=marker_text, x1=cut)
        remainder = replace(w, text=rest, raw_text=raw_rest, x0=cut)
        splits[id(remainder)] = (w, marker)
        out += [marker, remainder]
    return out


def _unsplit(words: list[Word], splits: dict[int, tuple[Word, Word]]) -> list[Word]:
    out: list[Word] = []
    i = 0
    while i < len(words):
        w = words[i]
        if i + 1 < len(words) and id(words[i + 1]) in splits:
            original, marker = splits[id(words[i + 1])]
            if w is marker:
                out.append(original)
                i += 2
                continue
        out.append(w)
        i += 1
    return out


def _attach(
    eligible: list[_E], profile: MathProfile, ctx: _Context
) -> tuple[dict[int, tuple[int, str]], list[_Group], dict[int, _Group]]:
    """Each script word's parent: the word it hangs off (a base, or a larger script for nesting),
    or the previous word of its own script (`k+1`)."""
    scripts = sorted(
        (i for i, e in enumerate(eligible) if e.script),
        key=lambda i: (eligible[i].word.page, eligible[i].word.x0, eligible[i].word.top),
    )
    parent: dict[int, tuple[int, str]] = {}
    # How far right a script reaches, nested scripts included: `k+1` continues past a subscript.
    reach = {i: e.word.x1 for i, e in enumerate(eligible)}
    for s in scripts:
        e = eligible[s]
        best: tuple[float, int, str] | None = None
        for p, other in enumerate(eligible):
            if p == s or other.word.page != e.word.page or other.word.x0 > e.word.x0:
                continue
            if other.script and p not in parent:
                continue  # a script with nothing under it can't hold another
            relation = "script"
            limit = profile.attach_gap
            edge = other.word.x1
            # A script's centre sits inside its base's box (a little under it for a row of
            # subscripts); a word on the next line is never its base.
            slack = 0.3 * other.h
            if not other.word.top - slack <= e.cy <= other.word.bottom + slack:
                continue
            vertical = abs(e.cy - other.cy)
            if other.script:
                similar = (
                    e.size >= profile.script_size * other.size
                    and other.size >= profile.script_size * e.size
                )
                if similar:  # the next word of the same script, past any nested script
                    relation, limit, edge = "cont", profile.glue_gap, reach[p]
                    if abs(e.cy - other.cy) > 0.35 * other.size:
                        continue
                elif e.size >= other.size:
                    continue  # only a smaller script nests
            gap = e.word.x0 - edge
            if not -profile.attach_gap <= gap <= limit:
                continue
            score = abs(gap) + 0.05 * vertical
            if best is None or score < best[0]:
                best = (score, p, relation)
        if best is not None:
            parent[s] = (best[1], best[2])
            # The reach of every script above it grows with it.
            node = s
            while node in parent and eligible[parent[node][0]].script:
                node = parent[node][0]
                reach[node] = max(reach[node], e.word.x1)
            reach[s] = max(reach[s], e.word.x1)

    leader: dict[int, int] = {}

    def lead(s: int) -> int:
        if s not in leader:
            p, relation = parent[s]
            leader[s] = s if relation == "script" else lead(p)
        return leader[s]

    by_leader: dict[int, list[int]] = {}
    for s in parent:
        by_leader.setdefault(lead(s), []).append(s)
    groups: list[_Group] = []
    group_of: dict[int, _Group] = {}
    for first, members in by_leader.items():
        members.sort(key=lambda i: eligible[i].word.x0)
        base = parent[first][0]
        g = _Group(parent=base, members=members)
        for m in members:
            group_of[m] = g
        groups.append(g)

    for g in groups:
        base = eligible[g.parent]
        first = eligible[g.members[0]]
        shift = (base.cy - first.cy) / (base.size or 1.0)
        if shift >= profile.script_shift:
            g.level = "sup"
        elif shift <= -profile.script_shift:
            g.level = "sub"
        else:
            ctx.fail("unclear_level")
            g.level = "sub"
        g.depth = 1
        node = g
        while eligible[node.parent].script:
            above = group_of.get(node.parent)
            if above is None:
                break
            node = above
            g.depth += 1
        if g.depth > 2:
            ctx.fail("too_deep")
    # Two scripts of one level on one word are a double superscript (or subscript).
    seen: set[tuple[int, str]] = set()
    for g in groups:
        key = (g.parent, g.level)
        if key in seen:
            ctx.fail("unclear_level")
        seen.add(key)
    return parent, groups, group_of


def _piece_of(
    idx: int,
    eligible: list[_E],
    children: dict[int, list[_Group]],
    profile: MathProfile,
    ctx: _Context,
    *,
    prose_core: str | None = None,
) -> _Piece:
    """LaTeX for one word and the scripts hanging off it."""
    e = eligible[idx]
    family = font_family(e.word.fontname)
    math_font = family in profile.math_fonts
    raw = prose_core if prose_core is not None else _raw(e.word)
    piece = ctx.convert(raw, family, math_font)
    latex = piece.latex
    mine = children.get(idx, [])
    for level, mark in (("sub", "_"), ("sup", "^")):
        for g in mine:
            if g.level != level:
                continue
            inner: _Piece | None = None
            for m in g.members:
                member = _piece_of(m, eligible, children, profile, ctx)
                if inner is None:
                    inner = member
                else:
                    gap = eligible[m].word.x0 - _right_edge(g, m, eligible)
                    inner = _join(inner, member, gap, profile.glue_gap)
            if inner is not None:
                latex = f"{latex}{mark}{{{inner.latex}}}"
    last_upright = piece.last_upright and not mine
    return _Piece(latex, piece.first_upright, last_upright)


def _right_edge(g: _Group, member: int, eligible: list[_E]) -> float:
    """Where the script ends just before `member`: its previous word's right edge."""
    at = g.members.index(member)
    return eligible[g.members[at - 1]].word.x1


def _unit(
    idx: int,
    eligible: list[_E],
    children: dict[int, list[_Group]],
    profile: MathProfile,
    ctx: _Context,
) -> _Unit:
    e = eligible[idx]
    word = e.word
    family = font_family(word.fontname)
    scripted = idx in children
    is_math = family in profile.math_fonts or _has_math_char(_raw(word))
    left, top, right, bottom = word.x0, word.top, word.x1, word.bottom
    for g in children.get(idx, []):
        stack = list(g.members)
        while stack:
            m = stack.pop()
            w = eligible[m].word
            left, top = min(left, w.x0), min(top, w.top)
            right, bottom = max(right, w.x1), max(bottom, w.bottom)
            for sub in children.get(m, []):
                stack.extend(sub.members)
    box = (left, top, right, bottom)
    if is_math:
        return _Unit(
            e, idx, _piece_of(idx, eligible, children, profile, ctx), math=True, box=box
        )
    if scripted:
        # A prose-font base: only its trailing letters and digits (or a closing bracket) carry
        # the script; the rest of the word stays prose.
        text = word.text
        match = re.search(r"[A-Za-z0-9]+$", text)
        if match is None and text[-1:] in ")]":
            match = re.search(r"[)\]]$", text)
        if match is None:
            ctx.fail("no_base")
            return _Unit(e, idx, None, box=box)
        piece = _piece_of(idx, eligible, children, profile, ctx, prose_core=match.group(0))
        return _Unit(e, idx, piece, prefix=text[: match.start()], math=True, box=box)
    safe = bool(word.text) and all(c in _MATH_SAFE for c in word.text)
    return _Unit(e, idx, None, safe=safe, box=box)


def _formulas(units: list[_Unit], profile: MathProfile, ctx: _Context):
    """Yields (the Word replacing a formula, the units it folds in, its box) along one line."""
    i, n = 0, len(units)
    taken = [False] * n

    def glued(a: _Unit, b: _Unit) -> bool:
        return -profile.attach_gap <= b.x0 - a.x1 < profile.glue_gap

    while i < n:
        u = units[i]
        leading = u.safe and not set(u.e.word.text) <= _PUNCTUATION
        starts = u.math or (leading and i + 1 < n and units[i + 1].math and glued(u, units[i + 1]))
        if taken[i] or not starts:
            i += 1
            continue
        group = [u]
        j = i
        while j + 1 < n:
            v = units[j + 1]
            if v.math and not v.prefix:
                pass
            elif v.safe and glued(units[j], v):
                pass
            else:
                break
            group.append(v)
            j += 1
        for k in range(i, j + 1):
            taken[k] = True

        prefix = u.prefix
        suffix = ""
        # Prose written right against the formula stays in its word, outside the markers.
        if i > 0 and not taken[i - 1] and not u.prefix:
            before = units[i - 1]
            if before.piece is None and not before.safe and glued(before, u):
                prefix = before.e.word.text
                taken[i - 1] = True
                group.insert(0, before)
        if j + 1 < n and not taken[j + 1]:
            after = units[j + 1]
            if after.piece is None and not after.safe and glued(units[j], after):
                suffix = after.e.word.text
                taken[j + 1] = True
                group.append(after)
        i = j + 1

        pieces: list[tuple[_Unit, _Piece]] = []
        for v in group:
            if v.piece is not None:
                pieces.append((v, v.piece))
            elif v.safe:
                pieces.append((v, ctx.convert(v.e.word.text, "", False)))
        latex: _Piece | None = None
        previous: _Unit | None = None
        for v, piece in pieces:
            if latex is None:
                latex = piece
            else:
                latex = _join(latex, piece, v.x0 - previous.x1, profile.glue_gap)
            previous = v
        assert latex is not None
        body = latex.latex.strip()
        if body.endswith("\\{"):
            ctx.fail("stacked")  # the brace of a case split, which isn't rebuilt
        if suffix[:1].isdigit():  # a digit can't follow the closing marker
            digits = re.match(r"\d+", suffix).group(0)
            body += digits
            suffix = suffix[len(digits):]
        box = (
            min(v.box[0] for v in group),
            min(v.box[1] for v in group),
            max(v.box[2] for v in group),
            max(v.box[3] for v in group),
        )
        base = next(v for v in group if v.math or v.piece is not None).e.word
        built = Word(
            text=f"{prefix}{MATH_OPEN}{body}{MATH_CLOSE}{suffix}",
            x0=box[0],
            x1=box[2],
            top=box[1],
            bottom=box[3],
            page=base.page,
            size=base.size,
            fontname=base.fontname,
            raw_text=None,
            math=True,
        )
        yield built, group, box


def _find_bars(
    eligible: list[_E],
    units_by_line: dict[int, list[_Unit]],
    graphics: list[Graphic],
    profile: MathProfile,
    ctx: _Context,
) -> None:
    """A thin filled rectangle just above a formula's glyphs is an overbar, or a fraction's bar when
    there's a row above it too. Neither is rebuilt; both are named."""
    bars = [
        g
        for g in graphics
        if g.kind == "rect"
        and g.bottom - g.top <= profile.bar_thickness
        and g.x1 - g.x0 > g.bottom - g.top
        and g.x1 - g.x0 < profile.bar_max_length
    ]
    if not bars:
        return
    for units in units_by_line.values():
        for u in units:
            if not u.math:
                continue
            w = u.e.word
            for bar in bars:
                if bar.page != w.page:
                    continue
                overlap = min(bar.x1, w.x1) - max(bar.x0, w.x0)
                if overlap < 0.5 * min(bar.x1 - bar.x0, w.x1 - w.x0):
                    continue
                if not -2.0 <= w.top - bar.bottom <= 6.0:
                    continue
                above = any(
                    o.word is not w
                    and o.word.page == bar.page
                    and min(bar.x1, o.word.x1) - max(bar.x0, o.word.x0)
                    >= 0.3 * min(bar.x1 - bar.x0, o.word.x1 - o.word.x0)
                    and -4.0 <= bar.top - o.word.bottom <= 8.0
                    for o in eligible
                )
                ctx.fail("fraction" if above else "overbar")


def _find_stacked_fractions(
    eligible: list[_E],
    units_by_line: dict[int, list[_Unit]],
    formula_boxes: list[tuple[int, tuple[float, float, float, float], int]],
    work: list[list[Word]],
    fixed: set[int],
    ctx: _Context,
) -> None:
    """A short row of math sitting above or below a formula, within its width, is a fraction drawn
    without a bar the rebuild can see (or a binomial)."""
    for li, box, _ in formula_boxes:
        page = next(w.page for w in work[li])
        height = box[3] - box[1]
        for lj, other in units_by_line.items():
            if lj == li or any(id(w) in fixed for w in work[lj]):
                continue
            if len(other) > 2 or not all(u.math for u in other):
                continue
            if work[lj][0].page != page:
                continue
            x0 = min(u.x0 for u in other)
            x1 = max(u.x1 for u in other)
            overlap = min(box[2], x1) - max(box[0], x0)
            if overlap < 0.6 * (x1 - x0):
                continue
            cy_other = sum((u.box[1] + u.box[3]) / 2 for u in other) / len(other)
            offset = abs(cy_other - (box[1] + box[3]) / 2)
            if 0.4 * height < offset < 2.2 * height:
                ctx.fail("fraction")
