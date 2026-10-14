from prepora_pipeline.core.markdown import escape_markdown


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
