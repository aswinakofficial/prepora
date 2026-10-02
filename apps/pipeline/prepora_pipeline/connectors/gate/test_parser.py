"""
Contract tests for the GATE connector (docs/specs/05-gate-pilot.md). Every PDF is generated here
with reportlab, laid out like GATE's real files (the same columns and header spellings, measured on
the 2025 and 2026 CS keys), with invented content. No real paper or key is committed.
"""
import io

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from prepora_pipeline.core.pdf_text import extract_pages

from .catalog import PAPERS, find_papers
from .key_parser import GateKeyError, parse_answer_key, parse_answer_value
from .paper_parser import parse_paper

WIDTH, HEIGHT = A4


def make_pdf(pages: list[list[tuple]], size: int = 10, boxes=None) -> bytes:
    """Each page is a list of (x, top, text) or (x, top, text, font, size), `top` in points from
    the top edge. `boxes` maps a page index to filled (x, top, width, height) boxes: a figure."""
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    for index, items in enumerate(pages):
        for item in items:
            x, top, text = item[:3]
            font, font_size = (item[3], item[4]) if len(item) == 5 else ("Helvetica", size)
            c.setFont(font, font_size)
            c.drawString(x, HEIGHT - top - font_size, text)
        for x, top, w, h in (boxes or {}).get(index, []):
            c.rect(x, HEIGHT - top - h, w, h, fill=1)
        c.showPage()
    c.save()
    return out.getvalue()


# Column x positions like GATE 2026's key, with the Key/Range column wide enough for an "OR" range;
# 2025's header says "Q. Type" instead.
COLUMNS = (110, 170, 240, 320, 370, 540)


def key_pdf(rows, *, qtype_header="Question Type", rows_per_page=40) -> bytes:
    header = ["Q. No.", "Session", qtype_header, "Section", "Key/Range", "Marks"]
    pages = []
    for start in range(0, len(rows), rows_per_page):
        items = [(88, 100, "Answer Key for an Invented Paper (XX-1)")]
        items += [(x, 130, text) for x, text in zip(COLUMNS, header, strict=True)]
        for i, row in enumerate(rows[start : start + rows_per_page]):
            items += [(x, 150 + 16 * i, text) for x, text in zip(COLUMNS, row, strict=True)]
        items.append((474, 800, f"Page {len(pages) + 1}"))
        pages.append(items)
    return make_pdf(pages)


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


def paper_page(number: int, total: int, items: list[tuple]) -> list[tuple]:
    return [
        (295, 26, "Invented Science & Technology (XX1)"),
        *items,
        (72, 807, f"Organizing Institute: Invented Institute Page {number} of {total}"),
    ]


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
        assert q4.flags == ["figure"]
        x0, top, x1, bottom = q4.region
        assert top < 120 and bottom >= 420 and x0 < 78 and x1 > 500  # label, figure and options
        assert not questions[0].flags and not questions[1].flags

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
