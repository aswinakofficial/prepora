"""
Tests for the math rebuild (docs/specs/13-math-recovery.md, core/math_rebuild.py). PDFs are
generated with reportlab (connectors/gate/testing.py); where reportlab can't make the case (math
italics, ℝ, private-use glyphs, subset-prefixed font names) the words are built by hand. Every
input here is invented. The outputs are pinned in fixtures/math_rebuild.json, which
packages/api/src/lib/latex-symbols.test.ts renders with KaTeX set to throw:
`REGENERATE_MATH_FIXTURE=1 pytest core/test_math_rebuild.py` rewrites it.
"""
import json
import os
import re
from pathlib import Path

import pytest

from prepora_pipeline.connectors.gate.testing import make_pdf
from prepora_pipeline.core.markdown import escape_markdown_with_math
from prepora_pipeline.core.math_rebuild import (
    DETECTOR_REASONS,
    GATE_MATH,
    MATH_CLOSE,
    MATH_OPEN,
    REBUILD_REASONS,
    rebuild_math,
)
from prepora_pipeline.core.pdf_text import Graphic, Line, Word, extract_pages, group_lines

FIXTURE = Path(__file__).parent / "fixtures" / "math_rebuild.json"
CAMBRIA = "BCDGEE+CambriaMath"
TIMES = "ABCDEF+TimesNewRoman"
TIMES_ITALIC = "ABCDEF+TimesNewRoman,Italic"
SYMBOL = "ABCDEF+SymbolMT"


def pdf_lines(items, boxes=None) -> tuple[list[Line], list[Graphic]]:
    page = extract_pages(make_pdf([items], boxes={0: boxes} if boxes else None))[0]
    return [FILLER, *group_lines(page)], page.graphics


def line_of(words: list[Word]) -> Line:
    return Line(
        tuple(sorted(words, key=lambda w: w.x0)),
        0,
        min(w.top for w in words),
        max(w.bottom for w in words),
        min(w.x0 for w in words),
        max(w.x1 for w in words),
    )


def W(text, x0, top=100.0, size=12.0, font=CAMBRIA, raw=None, width=None) -> Word:
    width = len(text) * size * 0.55 if width is None else width
    return Word(
        text=text, x0=x0, x1=x0 + width, top=top, bottom=top + size * 1.17, page=0, size=size,
        fontname=font, raw_text=raw if raw is not None else text,
    )


FILLER = line_of([W(f"word{i}", 40 + 40 * i, top=40, font=TIMES) for i in range(8)])


def hand(*rows: list[Word]) -> list[Line]:
    """Each row is one input line (its words need not be in x order). A line of body text comes
    first, as a real question has one: the body size is the median of the words' sizes."""
    return [FILLER, *(line_of(row) for row in rows)]


def text_of(result) -> str:
    return "\n".join(line.text for line in result.lines)


def marked(result) -> str:
    return escape_markdown_with_math(text_of(result))


def formulas(result) -> list[str]:
    return re.findall(f"{MATH_OPEN}(.*?){MATH_CLOSE}", text_of(result))


def rebuilt(lines, graphics=()) -> object:
    result = rebuild_math(lines, list(graphics), GATE_MATH)
    if lines and lines[0] is FILLER:
        assert result.lines[0] is FILLER
        result.lines = result.lines[1:]
    return result


# ─── The cases pinned in the fixture: name -> (lines, graphics)

def case_inline_superscript():
    # "n" with a smaller raised "2" in the same line: n squared.
    return pdf_lines(
        [
            (100, 100, "The invented cost is ", "Helvetica", 12),
            (100 + 108, 100, "n", "Helvetica-Oblique", 12),
            (100 + 108 + 7, 97, "2", "Helvetica", 8),
            (100 + 108 + 7 + 6, 100, " per item.", "Helvetica", 12),
        ]
    )


def case_subscript_row_below():
    return pdf_lines(
        [
            (100, 100, "Let ", "Helvetica", 12),
            (126, 100, "L", "Helvetica-Oblique", 12),
            (134, 108, "1", "Helvetica", 8),
            (141, 100, " and ", "Helvetica", 12),
            (170, 100, "L", "Helvetica-Oblique", 12),
            (178, 108, "2", "Helvetica", 8),
            (185, 100, " be languages.", "Helvetica", 12),
        ]
    )


def case_sub_and_super_on_one_base():
    return hand(
        [W("x", 100, raw="\U0001d465"), W("i", 107, top=104, size=8.5, raw="\U0001d456"), W("2", 107, top=96, size=8.5),
         W("here", 120, font=TIMES)]
    )


def case_nested_script():
    return hand(
        [
            W("n", 100, raw="\U0001d45b"),
            W("log", 107, top=96, size=8.5),
            W("4", 107 + 14, top=100, size=6),
            W("5", 107 + 14 + 3.4, top=96, size=8.5),
        ]
    )


def case_multi_token_script():
    return hand(
        [
            W("d", 100, raw="\U0001d451"),
            W("k", 107, top=104, size=8.5, raw="\U0001d458"),
            W("+", 111.5, top=104, size=8.5),
            W("1", 117, top=104, size=8.5),
        ]
    )


def case_glued_option_marker():
    return pdf_lines(
        [
            (78, 100, "(A)2", "Helvetica", 12),
            (78 + 21.4, 97, "17", "Helvetica", 8),
        ]
    )


def case_math_italic_run():
    return hand([W("Let", 100, font=TIMES), W("n", 130, raw="\U0001d45b"),
                 W(">", 140), W("1.", 152)])


def case_letterlike_double_struck():
    return hand([W("R", 100, raw="ℝ"), W("n", 107, top=96, size=8.5, raw="\U0001d45b")])


def case_upright_names():
    return hand(
        [W("log", 100), W("n", 120, raw="\U0001d45b"), W("matrix", 135), W("M", 178, raw="\U0001d440")]
    )


def case_space_only_next_to_text():
    return hand([W("x", 100, raw="\U0001d465"), W("=", 112), W("y", 124, raw="\U0001d466")])


def case_prose_font_script():
    return hand([W("R", 100, font=TIMES), W("X", 107.5, top=104, size=8.5, font=TIMES)])


def case_emphasis_isnt_math():
    return hand([W("this", 100, font=TIMES), W("matters", 125, font=TIMES_ITALIC)])


def case_symbol_private_use_glyph():
    return hand([W("", 100, font=SYMBOL, raw=""), W("x", 112, raw="\U0001d465")])


def case_glued_prose_bit():
    return pdf_lines(
        [
            (100, 100, "2", "Helvetica", 12),
            (106.7, 97, "32", "Helvetica", 8),
            (106.7 + 9, 100, "-bit", "Helvetica", 12),
        ]
    )


def case_trailing_run_of_a_prose_word():
    return hand([W("1M=2", 100, font=TIMES), W("20", 100 + 26.4, top=96, size=8.5, font=TIMES)])


def case_digit_after_formula():
    return hand([W("n", 100, raw="\U0001d45b"), W("2", 106.6, top=96, size=8.5),
                 W("5th", 111.5, font=TIMES)])


def case_greek_and_operators():
    return hand([W("Θ(n)", 100, raw="Θ(\U0001d45b)"), W("≤", 130), W("α", 142)])


def case_special_characters_are_escaped():
    return hand([W("a_{b}%", 100, raw="\U0001d44e_{\U0001d44f}%")])


CASES = {
    name.removeprefix("case_"): fn for name, fn in sorted(globals().items())
    if name.startswith("case_")
}


def built(name: str) -> tuple[list[Line], list[Graphic]]:
    case = CASES[name]()
    return case if isinstance(case, tuple) else (case, [])


def output_of(name: str) -> dict:
    lines, graphics = built(name)
    result = rebuilt(lines, graphics)
    assert result.reasons == [], (name, result.reasons)
    return {"name": name, "markdown": marked(result), "formulas": formulas(result)}


def test_the_pinned_outputs_are_current():
    outputs = [output_of(name) for name in CASES]
    if os.environ.get("REGENERATE_MATH_FIXTURE"):
        FIXTURE.write_text(
            json.dumps({"cases": outputs}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    pinned = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]
    assert pinned == outputs


# ─── What each case should say

class TestScripts:
    def test_an_inline_superscript(self):
        assert formulas(rebuilt(*case_inline_superscript())) == ["n^{2}"]
        assert "$n^{2}$ per item." in marked(rebuilt(*case_inline_superscript()))

    def test_a_subscript_row_below_its_line(self):
        result = rebuilt(*case_subscript_row_below())
        assert formulas(result) == ["L_{1}", "L_{2}"]
        assert len(result.lines) == 1  # the row is folded in
        assert "Let $L_{1}$ and $L_{2}$ be languages." == marked(result)

    def test_a_subscript_and_a_superscript_on_one_base(self):
        assert formulas(rebuilt(case_sub_and_super_on_one_base(), [])) == ["x_{i}^{2}"]

    def test_a_nested_script(self):
        assert formulas(rebuilt(case_nested_script(), [])) == ["n^{\\log_{4} 5}"]

    def test_a_multi_token_script(self):
        assert formulas(rebuilt(case_multi_token_script(), [])) == ["d_{k+1}"]

    def test_a_glued_option_marker_keeps_its_marker_and_rebuilds_the_base(self):
        result = rebuilt(*case_glued_option_marker())
        assert [w.text for w in result.lines[0].words][0] == "(A)"
        assert formulas(result) == ["2^{17}"]
        assert marked(result) == "(A) $2^{17}$"


class TestRunsAndLetters:
    def test_a_math_italic_run_becomes_plain_letters(self):
        result = rebuilt(case_math_italic_run(), [])
        assert formulas(result) == ["n > 1."]
        assert marked(result).startswith("Let $n > 1.$")

    def test_double_struck_r(self):
        assert formulas(rebuilt(case_letterlike_double_struck(), [])) == ["\\mathbb{R}^{n}"]

    def test_upright_names_and_words(self):
        assert formulas(rebuilt(case_upright_names(), [])) == [
            "\\log n\\ \\text{matrix}\\ M"
        ]

    def test_a_space_is_escaped_only_next_to_text_or_a_name(self):
        assert formulas(rebuilt(case_space_only_next_to_text(), [])) == ["x = y"]
        for tex in formulas(rebuilt(case_upright_names(), [])):
            assert not tex.endswith("\\ ") and not tex.startswith("\\ ")

    def test_a_prose_font_letter_script_is_text(self):
        assert formulas(rebuilt(case_prose_font_script(), [])) == ["\\text{R}_{\\text{X}}"]

    def test_times_italic_emphasis_is_not_math(self):
        result = rebuilt(case_emphasis_isnt_math(), [])
        assert result.formulas == 0 and text_of(result) == "this matters"

    def test_a_symbol_private_use_glyph_goes_through_the_table(self):
        assert formulas(rebuilt(case_symbol_private_use_glyph(), [])) == ["\\to x"]

    def test_a_large_bracket_piece_is_an_unknown_symbol(self):
        words = [W("", 100, font=SYMBOL, raw="")]
        assert rebuilt(hand(words), []).reasons == ["unknown_symbol"]

    def test_greek_operators_and_relations(self):
        assert formulas(rebuilt(case_greek_and_operators(), [])) == ["\\Theta(n) \\le \\alpha"]

    def test_latex_special_characters_are_escaped(self):
        assert formulas(rebuilt(case_special_characters_are_escaped(), [])) == [
            "a\\_\\{b\\}\\%"
        ]

    def test_a_symbol_font_without_unicode_reads_as_symbol_codes(self):
        # reportlab's Symbol font extracts alpha as "a" and the union sign as a dieresis.
        words = [W("a", 100, font=SYMBOL), W("¨", 112, font=SYMBOL), W("b", 124, font=SYMBOL)]
        assert formulas(rebuilt(hand(words), [])) == ["\\alpha \\cup \\beta"]


class TestGluedProse:
    def test_prose_glued_after_a_formula_stays_in_the_word_with_no_space(self):
        result = rebuilt(*case_glued_prose_bit())
        assert len(result.lines[0].words) == 1
        assert marked(result) == "$2^{32}$-bit"

    def test_only_a_prose_words_trailing_run_is_the_formula(self):
        assert marked(rebuilt(case_trailing_run_of_a_prose_word(), [])) == "1M=$2^{20}$"

    def test_a_formula_is_never_followed_by_a_digit(self):
        result = rebuilt(case_digit_after_formula(), [])
        assert formulas(result) == ["n^{2}5"]
        assert marked(result) == "$n^{2}5$th"
        for text in re.findall(f"{MATH_CLOSE}(.)", text_of(result)):
            assert not text.isdigit()


class TestReasons:
    """Every reason the rebuild itself names has a case."""

    def test_no_base(self):
        assert rebuilt(hand([W("2", 100, size=8.5), W("a", 140, font=TIMES)]), []).reasons == [
            "no_base"
        ]

    def test_a_script_level_between_raised_and_lowered(self):
        words = [W("x", 100), W("2", 107, top=101.5, size=8.5)]
        assert rebuilt(hand(words), []).reasons == ["unclear_level"]

    def test_a_double_superscript(self):
        words = [W("x", 100), W("2", 107, top=96, size=8.5), W("3", 107, top=96, size=8.5)]
        assert "unclear_level" in rebuilt(hand(words), []).reasons

    def test_a_prime_glued_after_a_superscript(self):
        words = [W("x", 100), W("2", 107, top=96, size=8.5), W("′", 112)]
        assert "unclear_level" in rebuilt(hand(words), []).reasons

    def test_scripts_nested_more_than_two_levels(self):
        words = [
            W("x", 100),
            W("a", 107, top=96, size=8.5),
            W("b", 113, top=100, size=6),
            W("c", 118, top=98, size=4),
        ]
        assert "too_deep" in rebuilt(hand(words), []).reasons

    def test_an_overbar_mark(self):
        assert rebuilt(hand([W("P̅", 100, raw="P̅")]), []).reasons == ["overbar"]

    def test_a_thin_bar_above_a_formula_is_an_overbar(self):
        bar = Graphic("rect", 100.0, 98.0, 108.0, 98.8, 0)
        result = rebuilt(hand([W("x", 100, top=100, raw="\U0001d465")]), [bar])
        assert result.reasons == ["overbar"]

    def test_a_thin_bar_between_two_rows_is_a_fraction(self):
        bar = Graphic("rect", 100.0, 113.0, 108.0, 113.8, 0)
        rows = hand([W("1", 100, top=100)], [W("n", 100, top=115, raw="\U0001d45b")])
        assert rebuilt(rows, [bar]).reasons == ["fraction"]

    def test_two_short_rows_over_each_other_are_a_fraction_without_a_bar(self):
        rows = hand(
            [W("T(n) =", 100, top=100, width=40), W("1", 145, top=100)],
            [W("2", 145, top=114)],
        )
        assert "fraction" in rebuilt(rows, []).reasons

    def test_a_table_border_near_a_formula_is_neither(self):
        border = Graphic("rect", 90.0, 98.0, 300.0, 98.5, 0)  # as long as a table's
        result = rebuilt(hand([W("x", 100, top=100, raw="\U0001d465")]), [border])
        assert result.reasons == []

    def test_a_case_split_brace_is_stacked(self):
        words = [W("f(x)", 100, width=20), W("=", 125), W("{", 137)]
        assert rebuilt(hand(words), []).reasons == ["stacked"]

    def test_an_unknown_symbol(self):
        assert rebuilt(hand([W("♣", 100, font=SYMBOL)]), []).reasons == ["unknown_symbol"]

    def test_the_detector_rules_each_map_to_a_reason(self):
        assert set(DETECTOR_REASONS.values()) | {
            "no_base", "unclear_level", "too_deep", "overbar", "fraction", "unknown_symbol",
            "stacked",
        } == set(REBUILD_REASONS)
        assert set(DETECTOR_REASONS) == {
            "math or private-use glyphs",
            "an inline sub- or superscript",
            "a row of sub- or superscripts",
            "single tokens stacked on 3+ lines",
        }


class TestUntouched:
    def test_code_and_markers_are_left_alone(self):
        code = line_of([W("x", 100, font="ABC+CourierNew", raw="\U0001d465"),
                        W("2", 107, top=96, size=8.5, font="ABC+CourierNew")])
        marker = line_of([W("(A)", 78, font=TIMES), W("text", 120, font=TIMES)])
        result = rebuilt([code, marker], [])
        assert result.lines == [code, marker] and result.formulas == 0

    def test_a_line_with_no_math_comes_back_as_the_same_line(self):
        lines = hand([W("plain", 100, font=TIMES), W("words", 130, font=TIMES)])
        result = rebuilt(lines, [])
        assert result.lines[0] is lines[1]


class TestFonts:
    def test_a_subset_prefixed_math_font_matches(self):
        word = W("x", 100, font="BCDGEE+CambriaMath", raw="x")
        assert formulas(rebuilt(hand([word]), [])) == ["\\mathrm{x}"]

    def test_the_stage_imports_nothing_from_a_connector(self):
        source = (Path(__file__).parent / "math_rebuild.py").read_text(encoding="utf-8")
        assert "connectors" not in re.sub(r'""".*?"""', "", source, flags=re.S)

    def test_markers_never_appear_in_the_input_words(self):
        for name in CASES:
            for line in built(name)[0]:
                assert MATH_OPEN not in line.text and MATH_CLOSE not in line.text
