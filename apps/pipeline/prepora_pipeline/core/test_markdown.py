import pytest

from prepora_pipeline.core.markdown import (
    MATH_CLOSE,
    MATH_OPEN,
    escape_markdown,
    escape_markdown_with_math,
)


def f(tex: str) -> str:
    return f"{MATH_OPEN}{tex}{MATH_CLOSE}"


def test_prose_markdown_characters_are_escaped():
    assert escape_markdown("a * b, my_var and $5 [x] `y`") == (
        "a \\* b, my\\_var and \\$5 \\[x\\] \\`y\\`"
    )


def test_a_backslash_is_escaped_first():
    assert escape_markdown("a\\b *") == "a\\\\b \\*"


def test_line_start_markers_are_escaped_only_at_line_start():
    assert escape_markdown("# heading\n> quote\n- item\n1. first\nnot # one") == (
        "\\# heading\n\\> quote\n\\- item\n1\\. first\nnot # one"
    )


def test_fenced_code_is_left_exactly_as_it_is():
    text = "Given:\n\n```\nint *p = &x;  // a_b $\n    *p = 1;\n```\n\nWhat is *p?"
    assert escape_markdown(text) == (
        "Given:\n\n```\nint *p = &x;  // a_b $\n    *p = 1;\n```\n\nWhat is \\*p?"
    )


def test_an_unclosed_fence_leaves_the_rest_alone():
    assert escape_markdown("```\na * b") == "```\na * b"


def test_plain_text_is_unchanged():
    assert escape_markdown("What is the value of x?") == "What is the value of x?"


def test_setext_underlines_do_not_turn_a_line_into_a_heading_or_rule():
    assert escape_markdown("Title\n---\nOther\n===") == "Title\n\\---\nOther\n\\==="


def test_indentation_of_four_spaces_does_not_start_a_code_block():
    assert escape_markdown("Text:\n\n    indented") == "Text:\n\n&#32;   indented"
    assert escape_markdown("a\n  two spaces") == "a\n  two spaces"


def test_autolinks_bare_urls_and_emails_stay_text():
    assert escape_markdown("see <https://a.com/x> or https://b.org and www.c.io") == (
        "see \\<https\\://a.com/x> or https\\://b.org and www\\.c.io"
    )
    assert escape_markdown("mail a@b.com") == "mail a\\@b.com"


class TestEscapeWithMath:
    def test_prose_is_escaped_as_escape_markdown_does_and_formulas_are_verbatim(self):
        text = f"a * b and my_var cost {f('n^{2} * x_{1}')} each, $5"
        assert escape_markdown_with_math(text) == (
            "a \\* b and my\\_var cost $n^{2} * x_{1}$ each, \\$5"
        )

    def test_a_line_can_start_with_a_formula(self):
        assert escape_markdown_with_math(f"{f('L_{1}')} - is it?") == "$L_{1}$ - is it?"

    def test_prose_next_to_a_formula_with_no_space(self):
        assert escape_markdown_with_math(f"{f('2^{32}')}-bit") == "$2^{32}$-bit"

    def test_text_without_markers_is_escape_markdown(self):
        for text in ["plain", "a * b _c_", "# h\n- x", "```\nint *p;\n```\n*q", ""]:
            assert escape_markdown_with_math(text) == escape_markdown(text)

    @pytest.mark.parametrize(
        "text",
        [MATH_OPEN + "x", "x" + MATH_CLOSE, MATH_OPEN + MATH_OPEN + "x" + MATH_CLOSE],
    )
    def test_unbalanced_markers_raise(self, text):
        with pytest.raises(ValueError, match="balanced"):
            escape_markdown_with_math(text)

    def test_a_formula_inside_a_code_fence_raises(self):
        with pytest.raises(ValueError, match="fenced"):
            escape_markdown_with_math(f"```\nint {f('x')};\n```")
        with pytest.raises(ValueError, match="fenced"):
            escape_markdown_with_math(f"```{f('x')}\ncode\n```")

    def test_fenced_code_next_to_a_formula_is_left_alone(self):
        text = f"Given {f('n')}:\n\n```\nint *p = &x;\n```"
        assert escape_markdown_with_math(text) == "Given $n$:\n\n```\nint *p = &x;\n```"
