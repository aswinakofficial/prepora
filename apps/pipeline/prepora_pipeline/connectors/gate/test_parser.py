"""
Contract tests for the GATE connector (docs/specs/05-gate-pilot.md). Every PDF is generated here
with reportlab, laid out like GATE's real files (the same columns and header spellings, measured on
the 2025 and 2026 CS keys), with invented content. No real paper or key is committed.
"""
import pytest

from prepora_pipeline.core.pdf_text import extract_pages

from .catalog import PAPERS, find_papers
from .key_parser import GateKeyError, parse_answer_key, parse_answer_value
from .paper_parser import GatePaperError, parse_paper
from .testing import key_pdf, make_pdf, paper_page

# Column x positions like GATE 2026's key, with the Key/Range column wide enough for an "OR" range;
# 2025's header says "Q. Type" instead.
ROWS = [
    ("1", "3", "MCQ", "GA", "B", "1"),
    ("2", "3", "MSQ", "CS-1", "A;C;D", "1"),
    ("3", "3", "MSQ", "CS-1", "B, C, D", "2"),
    ("4", "3", "NAT", "CS-1", "4.24 to 4.26", "2"),
    ("5", "3", "NAT", "CS-1", "-0.61 to -0.57 OR 0.57 to 0.61", "2"),
    ("6", "3", "MCQ", "CS-1", "MTA", "1"),
]


class TestAnswerKey:
    @pytest.mark.parametrize("qtype_header", ["Question Type", "Q. Type"])
    def test_every_kind_of_key_value_parses_to_its_answer(self, qtype_header):
        rows = parse_answer_key(extract_pages(key_pdf(ROWS, qtype_header=qtype_header)))
        assert [r.number for r in rows] == [1, 2, 3, 4, 5, 6]
        assert [r.answer for r in rows] == [
            ("keys", ["B"]),
            ("keys", ["A", "C", "D"]),
            ("keys", ["B", "C", "D"]),
            ("ranges", [(4.24, 4.26)]),
            ("ranges", [(-0.61, -0.57), (0.57, 0.61)]),
            ("mta", None),
        ]
        assert rows[0].section == "GA" and rows[1].section == "CS-1"
        assert [r.marks for r in rows] == [1, 1, 2, 2, 2, 1]
        assert rows[3].raw_key == "4.24 to 4.26"
        assert rows[0].session == "3"

    def test_a_key_over_two_pages_keeps_every_row(self):
        rows = [(str(n), "1", "MCQ", "GA", "A", "1") for n in range(1, 66)]
        parsed = parse_answer_key(extract_pages(key_pdf(rows)))
        assert [r.number for r in parsed] == list(range(1, 66))

    @pytest.mark.parametrize(
        ("qtype", "raw"),
        [
            ("MCQ", "E"),
            ("MCQ", "A;B"),
            ("MSQ", "A;Z"),
            ("MSQ", "A;A;C"),
            ("NAT", "5 to 4"),
            ("NAT", "about 5"),
        ],
    )
    def test_a_bad_value_raises(self, qtype, raw):
        with pytest.raises(GateKeyError):
            parse_answer_value(qtype, raw)

    def test_a_bad_value_in_a_table_names_its_question(self):
        rows = [*ROWS[:1], ("2", "3", "NAT", "CS-1", "5 to 4", "2")]
        with pytest.raises(GateKeyError, match=r"Q\.2"):
            parse_answer_key(extract_pages(key_pdf(rows)))

    def test_a_typographic_minus_reads_as_negative(self):
        assert parse_answer_value("NAT", "\u22120.61 to \u20130.57") == ("ranges", [(-0.61, -0.57)])

    def test_an_unknown_question_type_raises(self):
        with pytest.raises(GateKeyError, match="Unknown question type"):
            parse_answer_value("ESSAY", "A")


def test_the_catalog_lists_the_four_pilot_papers():
    assert {(p.year, p.sitting) for p in PAPERS} == {
        (2025, "CS-1"),
        (2025, "CS-2"),
        (2026, "CS-1"),
        (2026, "CS-2"),
    }
    assert [p.sitting for p in find_papers(year=2026)] == ["CS-1", "CS-2"]
    assert all(p.qp_url.startswith("https://gate2026.iitg.ac.in/") for p in PAPERS)


# ─── Question papers (#47). GATE's layout: labels at x=78, the section and marks headings in the
# margin at x=72, text at x=120, options at x=78, a running header and footer.


def invented_paper(boxes=None) -> bytes:
    pages = [
        paper_page(
            1,
            3,
            [
                (72, 93, "General Aptitude (GA)"),
                (72, 116, "Q.1 – Q.2 Carry ONE mark Each"),
                (78, 151, "Q.1"),
                (120, 151, "The antonym of the invented word glimmer is ________."),
                (78, 190, "(A) dull"),
                (78, 210, "(B) bright"),
                (78, 230, "(C) shiny"),
                (78, 250, "(D) gleam"),
                # Q.2's first line sits 8pt above its own label.
                (120, 392, "A long invented question whose text starts"),
                (78, 400, "Q.2"),
                (120, 406, "a little above its own label. Which are invented?"),
                (78, 440, "(A) Zed"),
                (300, 440, "(B) Quill"),
                (78, 460, "(C) Lune"),
                (300, 460, "(D) Mire"),
            ],
        ),
        paper_page(
            2,
            3,
            [
                (72, 93, "Q.3 – Q.4 Carry TWO marks Each"),
                (78, 120, "Q.3"),
                (120, 120, "Consider the following invented C code:"),
                (140, 140, "int x = 1;", "Courier", 10),
                (164, 154, "x = x + 1;", "Courier", 10),  # 4 Courier characters in
                (120, 180, "The value printed is ________. (Answer in integer)"),
                (120, 210, "________"),
            ],
        ),
        paper_page(
            3,
            3,
            [
                (78, 120, "Q.4"),
                (120, 120, "Which invented figure below is a circle?"),
                (78, 300, "(A)"),
                (78, 340, "(B)"),
                (78, 380, "(C)"),
                (78, 420, "(D)"),
            ],
        ),
    ]
    return make_pdf(pages, boxes=boxes)


class TestPaper:
    def test_every_question_with_its_stem_options_and_marks(self):
        questions = parse_paper(extract_pages(invented_paper()))
        assert [q.number for q in questions] == [1, 2, 3, 4]
        assert [q.label for q in questions] == ["Q.1", "Q.2", "Q.3", "Q.4"]
        assert [q.marks_heading for q in questions] == [1, 1, 2, 2]
        q1, q2, q3, _ = questions
        assert q1.text == "The antonym of the invented word glimmer is ________."
        assert q1.options == {"A": "dull", "B": "bright", "C": "shiny", "D": "gleam"}
        # The line above Q.2's label is Q.2's, and two-column options are read in order.
        assert q2.text.startswith("A long invented question whose text starts a little above")
        assert q2.options == {"A": "Zed", "B": "Quill", "C": "Lune", "D": "Mire"}
        assert not any("General Aptitude" in q.text or "Carry" in q.text for q in questions)
        assert not any("Organizing Institute" in q.text for q in questions)
        assert q3.page == 1

    def test_a_nat_question_has_no_options_its_code_is_fenced_and_its_blank_line_is_gone(self):
        q3 = parse_paper(extract_pages(invented_paper()))[2]
        assert q3.options == {}
        assert q3.text == (
            "Consider the following invented C code:\n\n"
            "```\nint x = 1;\n    x = x + 1;\n```\n\n"
            "The value printed is ________. (Answer in integer)"
        )
        assert not q3.flags

    def test_image_only_options_and_a_drawn_figure_flag_a_crop(self):
        questions = parse_paper(extract_pages(invented_paper(boxes={2: [(140, 290, 60, 40)]})))
        q4 = questions[3]
        assert q4.options == {"A": "", "B": "", "C": "", "D": ""}
        assert q4.flags == ["figure", "image_option"]
        assert {i.detail for i in q4.issues} >= {"an option has no text"}
        [region] = q4.regions
        x0, top, x1, bottom = region.bbox
        assert region.page == 2
        assert top < 120 and bottom >= 420 and x0 < 78 and x1 > 500  # label, figure and options
        assert not questions[0].flags and not questions[1].flags

    def test_a_question_over_two_pages_is_cropped_and_checked_on_both(self):
        pages = [
            [(78, 600, "Q.1"), (120, 600, "An invented question that continues overleaf:")],
            [(120, 120, "and ends here, below a figure."), (78, 200, "Q.2"), (120, 200, "Next?")],
        ]
        questions = parse_paper(extract_pages(make_pdf(pages, boxes={1: [(150, 70, 80, 40)]})))
        q1 = questions[0]
        assert q1.spans_pages
        assert [r.page for r in q1.regions] == [0, 1]
        assert q1.regions[1].bbox[3] < 205  # stops at Q.2's label (its glyphs start at ~202pt)
        assert q1.flags == ["figure"]  # the figure is on the continuation page
        assert questions[1].flags == []

    def test_unexpected_margin_text_raises_instead_of_vanishing(self):
        long_line = "This invented sentence starts in the margin and is far too long for a title."
        pdf = make_pdf([[(72, 90, long_line), (78, 120, "Q.1"), (120, 120, "Invented?")]])
        with pytest.raises(GatePaperError, match="margin"):
            parse_paper(extract_pages(pdf))

    def test_a_nat_line_of_dots_is_content_not_the_answer_blank(self):
        pdf = make_pdf([[(78, 120, "Q.1"), (120, 120, "Continue 1, 2,"), (120, 135, ". . ."),
                         (120, 150, "up to 9. The sum is ______."), (120, 180, "________")]])
        [q] = parse_paper(extract_pages(pdf))
        assert ". . ." in q.text and not q.text.endswith("________")

    def test_a_split_label_is_joined(self):
        pdf = make_pdf([[(78, 120, "Q."), (92, 120, "7"), (120, 120, "An invented question?")]])
        questions = parse_paper(extract_pages(pdf))
        assert [(q.number, q.text) for q in questions] == [(7, "An invented question?")]


class TestGarbleDetector:
    def _one(self, items, boxes=None):
        return parse_paper(extract_pages(make_pdf([[(78, 120, "Q.1"), *items]], boxes=boxes)))[0]

    def test_a_plain_question_isnt_flagged(self):
        q = self._one([(120, 120, "What is the invented capital of Zed?"), (78, 160, "(A) Mire")])
        assert q.flags == []

    def test_a_superscript_in_a_smaller_font_is_math(self):
        q = self._one(
            [
                (120, 120, "The invented cost is n", "Helvetica", 12),
                (240, 117, "2", "Helvetica", 8),
                (250, 120, "per item.", "Helvetica", 12),
            ]
        )
        assert q.flags == ["math"]

    def test_a_row_of_subscripts_just_below_its_line_is_math(self):
        q = self._one([(120, 120, "Let L and L be invented languages."), (132, 126, "1")])
        assert "math" in q.flags

    def test_a_table_laid_out_in_columns_is_layout(self):
        q = self._one([(120, 120, "List I"), (320, 120, "List II"), (120, 140, "P. Zed")])
        assert q.flags == ["layout"]

    def test_a_tall_block_with_almost_no_words_is_a_figure(self):
        q = self._one([(120, 120, "Invented figure:"), (78, 300, "(A) One")])
        assert q.flags == ["figure"]


# ─── Spec 13: the math rebuild in the parser (Decision 2). The invented paper is the e2e fixture's.


@pytest.fixture(scope="module")
def questions():
    from .e2e_math_paper import paper_pdf

    return {q.number: q for q in parse_paper(extract_pages(paper_pdf()))}


class TestMathRebuild:
    def test_a_question_held_for_math_is_recovered(self, questions):
        q1 = questions[1]
        assert q1.math_outcome == "recovered" and q1.flags == []
        assert "﷐Z_{1}﷑" in q1.text
        assert q1.original_text != q1.text and "Z" in q1.original_text
        assert q1.detector_math == ["a row of sub- or superscripts"]

    def test_a_recovered_question_keeps_its_figure_hold(self):
        from .testing import make_pdf

        items = [
            (78, 120, "Q.1", "Helvetica", 10),
            (120, 120, "Let ", "Helvetica", 10),
            (145, 120, "Z", "Helvetica-Oblique", 10),
            (152.5, 125, "1", "Helvetica-Oblique", 7),
            (160, 120, "be drawn in the invented figure below.", "Helvetica", 10),
        ]
        [q] = parse_paper(extract_pages(make_pdf([items], boxes={0: [(150, 160, 60, 40)]})))
        assert q.math_outcome == "recovered" and q.flags == ["figure"]

    def test_a_question_that_needs_a_fraction_stays_held_with_the_original_text(self, questions):
        q4 = questions[4]
        assert q4.math_outcome == "still_held" and q4.math_reasons == ["fraction"]
        assert "﷐" not in q4.text and q4.text == q4.original_text
        details = [i.detail for i in q4.issues if i.code == "math"]
        assert "the rebuild found a fraction, which it doesn't rebuild" in details
        assert "a row of sub- or superscripts" in details  # the first run's, too

    def test_a_question_with_math_runs_is_retypeset(self, questions):
        for n in (2, 6):
            assert questions[n].math_outcome == "retypeset" and questions[n].flags == []
        assert questions[6].text.count("﷐") == 1
        assert questions[2].options["A"] == "﷐2^{17}﷑"

    def test_an_unmapped_symbol_keeps_the_question_as_it_was(self, questions):
        q7 = questions[7]
        assert q7.math_outcome == "kept" and q7.math_reasons == ["unknown_symbol"]
        assert q7.text == q7.original_text and q7.options == q7.original_options
        assert q7.flags == []

    def test_a_thin_drawn_overbar_keeps_the_question_as_it_was(self):
        from .testing import make_pdf

        items = [
            (78, 120, "Q.1", "Helvetica", 10),
            (120, 120, "Is the invented event ", "Helvetica", 10),
            (210, 120, "α", "Symbol", 10),
            (222, 120, "possible?", "Helvetica", 10),
        ]
        pdf = make_pdf([items], boxes={0: [(209, 119, 7, 0.8)]})
        [q] = parse_paper(extract_pages(pdf))
        assert q.math_outcome == "kept" and "overbar" in q.math_reasons
        assert q.text == q.original_text and q.flags == []

    def test_a_question_without_math_is_byte_identical(self, questions):
        q5 = questions[5]
        assert q5.math_outcome == "none" and q5.text == q5.original_text
        assert q5.options == q5.original_options

    def test_an_unaccepted_rebuild_always_names_a_reason(self, questions):
        for q in questions.values():
            if q.math_outcome in ("still_held", "kept"):
                assert q.math_reasons
            else:
                assert q.math_reasons == []

    def test_a_split_label_keeps_raw_text_consistent(self):
        from ...core.pdf_text import Page, Word
        from .paper_parser import _join_split_labels

        a = Word("Q.", 78, 84, 100, 110, 0, 10, "Helvetica", raw_text="Q.")
        b = Word("4", 85, 90, 100, 110, 0, 10, "Helvetica", raw_text="4")
        [joined] = _join_split_labels(Page(0, 600, 800, [a, b])).words
        assert (joined.text, joined.raw_text) == ("Q.4", "Q.4")


class TestRebuildChangingOptions:
    def test_a_rebuild_that_changes_the_option_keys_is_rejected(self, monkeypatch):
        from . import paper_parser
        from .e2e_math_paper import paper_pdf

        real = paper_parser._read

        def dropping(block):
            text, options, stem = real(block)
            if any(w.math for line in block.lines for w in line.words):
                options = {k: v for k, v in options.items() if k != "B"}
            return text, options, stem

        monkeypatch.setattr(paper_parser, "_read", dropping)
        questions = {q.number: q for q in parse_paper(extract_pages(paper_pdf()))}
        q2 = questions[2]  # options with superscripts: re-typeset when all is well
        assert q2.math_outcome == "kept" and q2.math_reasons == ["options_changed"]
        assert q2.options == q2.original_options and set(q2.options) == set("ABCD")
