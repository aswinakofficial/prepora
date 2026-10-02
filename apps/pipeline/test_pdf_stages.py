"""
Tests for the shared PDF stages (docs/specs/02-pdf-stages.md): core/pdf_text.py,
core/pdf_segment.py and core/answer_keys.py.

Every PDF here is generated in the test with reportlab, reproducing the *layouts* that matter in
real exam papers — a label column, a label sitting below its own text, options in 1, 2 and 4
columns, running headers and footers, answer-key tables — with invented text. No real paper is
committed (CONTRIBUTING.md → content policy).
"""
import io
import re

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from prepora_pipeline.core.answer_keys import HeaderProfile, join_by_number, parse_key_table
from prepora_pipeline.core.pdf_segment import segment, split_options
from prepora_pipeline.core.pdf_text import (
    extract_pages,
    group_lines,
    normalize_text,
    render_region,
    strip_running_text,
)

WIDTH, HEIGHT = A4
LABEL = re.compile(r"^Q\.(\d+)$")


def make_pdf(pages: list[list[tuple[float, float, str]]], size: int = 10) -> bytes:
    """Each page is a list of (x, top, text): `top` in points from the top edge, like pdfplumber."""
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    for items in pages:
        c.setFont("Helvetica", size)
        for x, top, text in items:
            c.drawString(x, HEIGHT - top - size, text)
        c.showPage()
    c.save()
    return out.getvalue()


def paper_page(n: int, total: int, questions: list[tuple[int, float, list[str]]]):
    items = [(200, 20, "Invented Practice Paper 2099"), (250, HEIGHT - 40, f"Page {n} of {total}")]
    for number, top, body in questions:
        items.append((40, top, f"Q.{number}"))
        for i, text in enumerate(body):
            items.append((80, top + i * 14, text))
    return items


class TestRunningTextAndSegmentation:
    def test_headers_footers_go_and_questions_are_found_in_the_label_column(self):
        pdf = make_pdf(
            [
                paper_page(1, 3, [(1, 120, ["What colour is the invented sky?", "(A) Teal"])]),
                paper_page(2, 3, [(2, 120, ["How many invented moons orbit Zed?", "(A) Two"])]),
                paper_page(3, 3, [(3, 120, ["Which invented river is longest?", "(A) Lune"])]),
            ]
        )
        pages = strip_running_text(extract_pages(pdf))
        texts = [line.text for page in pages for line in group_lines(page)]
        assert not any("Invented Practice Paper" in t or t.startswith("Page ") for t in texts)

        blocks = segment(pages, label=LABEL, label_max_x=60)
        assert [b.number for b in blocks] == [1, 2, 3]
        assert blocks[0].lines[0].text == "What colour is the invented sky?"
        assert blocks[2].page == 2

    def test_a_label_below_the_start_of_its_text_still_owns_that_text(self):
        # Q.2's first line sits 8pt above its label — like GATE CS-1 2026 Q.31.
        pdf = make_pdf(
            [
                [
                    (40, 100, "Q.1"),
                    (80, 100, "First invented question?"),
                    (80, 192, "A long second question whose text starts"),
                    (40, 200, "Q.2"),
                    (80, 206, "a little above its own label."),
                ]
            ]
        )
        blocks = segment(extract_pages(pdf), label=LABEL, label_max_x=60)
        assert [line.text for line in blocks[0].lines] == ["First invented question?"]
        assert [line.text for line in blocks[1].lines] == [
            "A long second question whose text starts",
            "a little above its own label.",
        ]

    def test_a_dense_paper_keeps_the_previous_questions_last_line(self):
        # 10pt text on 12pt line spacing: Q.1's last option sits right above Q.2's label but doesn't
        # overlap it, so it stays with Q.1.
        pdf = make_pdf(
            [
                [
                    (40, 100, "Q.1"),
                    (80, 100, "Which invented gas is lightest?"),
                    (80, 112, "(A) Zephyrite"),
                    (40, 124, "Q.2"),
                    (80, 124, "Which invented metal rusts?"),
                ]
            ]
        )
        blocks = segment(extract_pages(pdf), label=LABEL, label_max_x=60)
        assert [line.text for line in blocks[0].lines] == [
            "Which invented gas is lightest?",
            "(A) Zephyrite",
        ]
        assert [line.text for line in blocks[1].lines] == ["Which invented metal rusts?"]

    def test_a_label_without_a_number_is_a_clear_error(self):
        pdf = make_pdf([[(40, 100, "Q.A"), (80, 100, "Invented")]])
        with pytest.raises(ValueError, match="no number"):
            segment(extract_pages(pdf), label=re.compile(r"^Q\.\w+$"))

    def test_text_beyond_the_label_column_is_not_a_label(self):
        pdf = make_pdf([[(40, 100, "Q.1"), (80, 100, "See Q.7 for context"), (300, 120, "Q.9")]])
        blocks = segment(extract_pages(pdf), label=LABEL, label_max_x=60)
        assert [b.number for b in blocks] == [1]

    def test_nothing_before_the_first_label_is_a_question(self):
        pdf = make_pdf([[(40, 60, "Instructions: answer every question."), (40, 100, "Q.1")]])
        blocks = segment(extract_pages(pdf), label=LABEL)
        assert [b.number for b in blocks] == [1]


class TestOptions:
    def _block(self, lines: list):
        """Each line is (x, text), or a list of (x, text) placed side by side on one line."""
        items = [(40, 100, "Q.1"), (80, 100, "Pick the invented answer.")]
        for i, line in enumerate(lines):
            for x, text in line if isinstance(line, list) else [line]:
                items.append((x, 120 + 14 * i, text))
        return segment(extract_pages(make_pdf([items])), label=LABEL)[0]

    def test_one_option_per_line(self):
        block = self._block([(80, "(A) 127"), (80, "(B) 64"), (80, "(C) 63"), (80, "(D) 32")])
        stem, options = split_options(block)
        assert stem == ["Pick the invented answer."]
        assert options == {"A": "127", "B": "64", "C": "63", "D": "32"}

    def test_two_and_four_columns(self):
        two = self._block(
            [[(80, "(A) Alpha"), (280, "(B) Beta")], [(80, "(C) Gamma"), (280, "(D) Delta")]]
        )
        assert split_options(two)[1] == {"A": "Alpha", "B": "Beta", "C": "Gamma", "D": "Delta"}
        four = self._block([[(80, "(A) w"), (180, "(B) x"), (280, "(C) y"), (380, "(D) z")]])
        assert split_options(four)[1] == {"A": "w", "B": "x", "C": "y", "D": "z"}

    def test_a_marker_in_the_middle_of_the_stem_is_not_an_option(self):
        block = self._block(
            [(80, "Which of (A) and (B) is invented?"), (80, "(A) Both"), (80, "(B) Neither")]
        )
        stem, options = split_options(block)
        assert stem == ["Pick the invented answer.", "Which of (A) and (B) is invented?"]
        assert options == {"A": "Both", "B": "Neither"}

    def test_wrapped_option_text_and_a_glued_marker(self):
        block = self._block(
            [
                (80, "(A)127 invented units"),
                (80, "(B) a long option that"),
                (100, "wraps to the next line"),
            ]
        )
        assert split_options(block)[1] == {
            "A": "127 invented units",
            "B": "a long option that wraps to the next line",
        }


def test_nfkc_turns_math_and_full_width_letters_into_plain_ones():
    assert normalize_text("𝑛 ｎ Θ(𝑛²)") == "n n Θ(n2)"


GATE_LIKE = HeaderProfile(
    name="invented-2099",
    columns={
        "number": ("Q. No.",),
        "qtype": ("Type", "Question Type"),
        "key": ("Key/Range",),
        "marks": ("Marks",),
    },
)


def key_pdf(
    header_rows: list[list[tuple[float, str]]], rows: list[tuple[str, str, str, str]]
) -> bytes:
    items = []
    top = 80
    for header in header_rows:
        items += [(x, top, text) for x, text in header]
        top += 14
    for number, qtype, key, marks in rows:
        items += [(40, top, number), (120, top, qtype), (220, top, key), (420, top, marks)]
        top += 14
    return make_pdf([items])


ROWS = [
    ("1", "MCQ", "A", "1"),
    ("2", "MSQ", "A;C", "2"),
    ("3", "NAT", "4.24 to 4.26", "2"),
    ("4", "MCQ", "MTA", "1"),
    ("5", "MCQ", "B", "1"),
]


class TestAnswerKeys:
    def test_a_key_table_parses_every_row_into_the_right_columns(self):
        pdf = key_pdf([[(40, "Q. No."), (120, "Type"), (220, "Key/Range"), (420, "Marks")]], ROWS)
        rows = parse_key_table(extract_pages(pdf), GATE_LIKE)
        assert [r.number for r in rows] == [1, 2, 3, 4, 5]
        assert rows[2].values == {
            "number": "3",
            "qtype": "NAT",
            "key": "4.24 to 4.26",
            "marks": "2",
        }
        assert rows[1].values["key"] == "A;C"
        assert rows[3].values["key"] == "MTA"

    def test_a_header_wrapped_over_two_lines_is_still_found(self):
        pdf = key_pdf(
            [
                [(40, "Q. No."), (120, "Question"), (220, "Key/Range"), (420, "Marks")],
                [(120, "Type")],
            ],
            ROWS,
        )
        rows = parse_key_table(extract_pages(pdf), GATE_LIKE)
        assert [r.values["qtype"] for r in rows] == ["MCQ", "MSQ", "NAT", "MCQ", "MCQ"]

    def test_a_missing_header_raises(self):
        pdf = make_pdf([[(40, 80, "Nothing tabular here")]])
        with pytest.raises(ValueError, match="invented-2099"):
            parse_key_table(extract_pages(pdf), GATE_LIKE)

    def test_join_reports_gaps_on_both_sides(self):
        paper = make_pdf([[(40, 100, "Q.1"), (40, 140, "Q.2"), (40, 180, "Q.3")]])
        blocks = segment(extract_pages(paper), label=LABEL)
        key = key_pdf(
            [[(40, "Q. No."), (120, "Type"), (220, "Key/Range"), (420, "Marks")]],
            [("1", "MCQ", "A", "1"), ("2", "MCQ", "B", "1"), ("4", "MCQ", "C", "1")],
        )
        report = join_by_number(blocks, parse_key_table(extract_pages(key), GATE_LIKE))
        assert [b.number for b, _ in report.matched] == [1, 2]
        assert report.missing_in_key == [3]
        assert report.missing_in_paper == [4]
        assert not report.ok

    def test_join_reports_duplicate_numbers_instead_of_dropping_them(self):
        paper = make_pdf([[(40, 100, "Q.1"), (40, 140, "Q.2"), (40, 180, "Q.2")]])
        blocks = segment(extract_pages(paper), label=LABEL)
        key = key_pdf(
            [[(40, "Q. No."), (120, "Type"), (220, "Key/Range"), (420, "Marks")]],
            [("1", "MCQ", "A", "1"), ("1", "MCQ", "B", "1"), ("2", "MCQ", "C", "1")],
        )
        report = join_by_number(blocks, parse_key_table(extract_pages(key), GATE_LIKE))
        assert report.duplicate_in_key == [1]
        assert report.duplicate_in_paper == [2]
        assert not report.ok


def test_render_region_returns_a_png_of_the_right_size():
    pdf = make_pdf([[(40, 100, "Q.1"), (80, 100, "An invented figure goes here.")]])
    png = render_region(pdf, 0, (50.0, 50.0, 150.0, 100.0), dpi=200)
    assert png.startswith(b"\x89PNG")
    width = int.from_bytes(png[16:20], "big")
    height = int.from_bytes(png[20:24], "big")
    assert abs(width - round(100 * 200 / 72)) <= 2
    assert abs(height - round(50 * 200 / 72)) <= 2
