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

WIDTH, HEIGHT = A4


def make_pdf(pages: list[list[tuple[float, float, str]]], size: int = 10) -> bytes:
    """Each page is a list of (x, top, text), `top` in points from the top edge."""
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    for items in pages:
        c.setFont("Helvetica", size)
        for x, top, text in items:
            c.drawString(x, HEIGHT - top - size, text)
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
