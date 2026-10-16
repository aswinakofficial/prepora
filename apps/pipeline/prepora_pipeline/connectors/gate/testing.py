"""
Builders for the invented GATE-shaped PDFs the tests and the e2e fixture use (reportlab): laid out
like GATE's real files, with invented content. No real paper or key is committed.
"""
import io

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

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




def paper_page(number: int, total: int, items: list[tuple]) -> list[tuple]:
    return [
        (295, 26, "Invented Science & Technology (XX1)"),
        *items,
        (72, 807, f"Organizing Institute: Invented Institute Page {number} of {total}"),
    ]
