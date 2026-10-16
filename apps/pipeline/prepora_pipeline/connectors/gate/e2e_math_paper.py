"""
The e2e fixture for Spec 13 (tests/e2e/acceptance/13-math-recovery.spec.ts): an invented 7-question
paper laid out like GATE, and its key, generated with reportlab and imported by the real
`import_paper` into the database `DATABASE_URL` names (which must be local).

    python -m prepora_pipeline.connectors.gate.e2e_math_paper [--sitting E2E-abc123]
    python -m prepora_pipeline.connectors.gate.e2e_math_paper --cleanup

The paper is `GATE 2099`, sitting `E2E-<random>` (or `--sitting`, to import the same paper again).
It prints one JSON object: {"paper_key", "sitting", "title", "batch_id", "lines"}, where `lines` are
the import report's lines ("Q.7 kept as is: unknown_symbol", …). `--cleanup` deletes only year
2099's session and what hangs off it, and leaves the shared GATE registration alone.

What each invented question exercises (stems are distinct from each other and from Spec 12's e2e
seeds):

| Q | Contains | The rebuild should |
|---|---|---|
| 1 | a subscript row (Z with 1, Z with 2) just below its line | recover it |
| 2 | options with raised superscripts (2 with 17 …); "(A)2" is glued | recover it |
| 3 | NAT; a multi-token subscript (d with k+1) | recover it |
| 4 | a subscript plus a stacked fraction, a thin filled bar between two rows | hold it (fraction) |
| 5 | prose containing `*` and `_` | leave it |
| 6 | a run in reportlab's Symbol font (alpha, union, beta) | re-typeset it |
| 7 | a Symbol-font glyph outside the table (a club) | keep it as it is |
"""
import argparse
import json
import secrets
import sys
import tempfile

from reportlab.pdfbase.pdfmetrics import stringWidth

from ...core.artifact_store import FilesystemArtifactStore
from ...core.db import get_db_connection
from .catalog import PaperSpec
from .run import import_paper, paper_key
from .testing import key_pdf, make_pdf, paper_page

YEAR = 2099
H, HO, SYM = "Helvetica", "Helvetica-Oblique", "Symbol"
BODY, SMALL = 10, 7
BASE_URL = "https://gate.example.test"

# (number, session, type, section, key, marks)
KEY_ROWS = [
    ("1", "1", "MCQ", "CS-1", "B", "1"),
    ("2", "1", "MCQ", "CS-1", "A", "1"),
    ("3", "1", "NAT", "CS-1", "5 to 5", "1"),
    ("4", "1", "MCQ", "CS-1", "C", "1"),
    ("5", "1", "MCQ", "CS-1", "D", "1"),
    ("6", "1", "MCQ", "CS-1", "A", "1"),
    ("7", "1", "MCQ", "CS-1", "B", "1"),
]


def _flow(x: float, top: float, parts: list[tuple]) -> tuple[list[tuple], float]:
    """Lays parts out left to right: (text, font, size[, dy]) → page items, and where it ends. `dy`
    moves a part down (a subscript) or up (a superscript) from the line's top."""
    items = []
    for part in parts:
        text, font, size = part[:3]
        dy = part[3] if len(part) > 3 else 0
        items.append((x, top + dy, text, font, size))
        x += stringWidth(text, font, size)
    return items, x


def _options(top: float, texts: list[str]) -> list[tuple]:
    return [(78, top + 18 * i, f"({'ABCD'[i]}) {t}", H, BODY) for i, t in enumerate(texts)]


def _question(label: int, top: float) -> list[tuple]:
    return [(78, top, f"Q.{label}", H, BODY)]


def paper_pdf() -> bytes:
    first: list[tuple] = [(72, 93, "Q.1 – Q.7 Carry ONE mark Each", H, BODY)]
    second: list[tuple] = []

    # Q.1: Z with a subscript, in a row just below the line.
    first += _question(1, 120)
    items, x = _flow(120, 120, [("Let ", H, BODY), ("Z", HO, BODY)])
    first += items
    first.append((x, 125, "1", HO, SMALL))
    x += stringWidth("1", HO, SMALL)
    items, x = _flow(x, 120, [(" and ", H, BODY), ("Z", HO, BODY)])
    first += items
    first.append((x, 125, "2", HO, SMALL))
    x += stringWidth("2", HO, SMALL)
    items, _ = _flow(x, 120, [(" be invented sets of widgets.", H, BODY)])
    first += items
    first += _options(150, ["no widget", "every widget", "one widget", "two widgets"])

    # Q.2: options with raised superscripts; the marker is glued to the base ("(A)2").
    first += _question(2, 240)
    first.append((120, 240, "Which invented quantity is the size of the toy store?", H, BODY))
    for i, exponent in enumerate(["17", "19", "23", "31"]):
        top = 270 + 18 * i
        marker = f"({'ABCD'[i]})2"
        first.append((78, top, marker, H, BODY))
        first.append((78 + stringWidth(marker, H, BODY), top - 2.5, exponent, H, SMALL))

    # Q.3 (NAT): d with a multi-token subscript, in a row below.
    first += _question(3, 370)
    items, x = _flow(120, 370, [("Each invented term ", H, BODY), ("d", HO, BODY)])
    first += items
    first.append((x, 374, "k+1", HO, SMALL))
    first.append(
        (
            x + stringWidth("k+1", HO, SMALL) + 3,
            370,
            "follows its predecessor. How many terms come before the sixth one?",
            H,
            BODY,
        )
    )
    first.append((120, 385, "(Answer in integer)", H, BODY))
    first.append((120, 410, "________", H, BODY))

    # Q.4: a subscript and a stacked fraction (a thin filled bar between two short rows).
    first += _question(4, 450)
    first.append((120, 450, "Consider the invented ratio below:", H, BODY))
    first.append((200, 470, "N", HO, BODY))
    items, x = _flow(200, 490, [("R", HO, BODY)])
    first += items
    first.append((x, 494, "0", HO, SMALL))
    first.append((120, 520, "What is the invented value of the ratio?", H, BODY))
    first += _options(545, ["low", "high", "middle", "none"])

    # Page 2. Q.5: prose with `*` and `_`.
    second += _question(5, 120)
    second.append(
        (120, 120, "Which invented rule treats a * star and a snake_case_name as text?", H, BODY)
    )
    second += _options(150, ["rule one", "rule two", "rule three", "rule four"])

    # Q.6: a Symbol-font run (alpha, union, beta).
    second += _question(6, 240)
    items, x = _flow(120, 240, [("Which invented set is ", H, BODY)])
    second += items
    for glyph in ("α", "∪", "β"):
        second.append((x, 240, glyph, SYM, BODY))
        x += stringWidth(glyph, SYM, BODY) + 3
    second.append((x, 240, "?", H, BODY))
    second += _options(270, ["empty", "small", "large", "full"])

    # Q.7: a Symbol-font glyph outside the rebuild's table (a club).
    second += _question(7, 370)
    items, x = _flow(120, 370, [("Which invented suit is ", H, BODY)])
    second += items
    second.append((x, 370, "♣", SYM, BODY))
    second.append((x + 15, 370, "?", H, BODY))
    second += _options(400, ["hearts", "clubs", "spades", "diamonds"])

    # The bar: x, top, width, height (0.8pt thick, like the real papers' fraction bars).
    bars = {0: [(196, 486.5, 18, 0.8)]}
    pages = [paper_page(1, 2, first), paper_page(2, 2, second)]
    return make_pdf(pages, boxes=bars)


def _paper(sitting: str) -> PaperSpec:
    return PaperSpec(
        YEAR, "CS", sitting, f"{BASE_URL}/{sitting}/qp.pdf", f"{BASE_URL}/{sitting}/key.pdf"
    )


def run_import(sitting: str) -> dict:
    paper = _paper(sitting)
    files = {paper.qp_url: paper_pdf(), paper.key_url: key_pdf(KEY_ROWS)}
    with tempfile.TemporaryDirectory() as directory:
        report = import_paper(
            paper, fetch=files.__getitem__, store=FilesystemArtifactStore(directory)
        )
    return {
        "paper_key": paper_key(paper),
        "sitting": sitting,
        "title": f"GATE {YEAR} · {sitting}",
        "batch_id": report.batch_id,
        "lines": report.lines(),
    }


def cleanup() -> dict:
    """Deletes year 2099's GATE session, its question set and questions, and the intake items,
    review batches and raw-artifact rows of the fixture's papers."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT s.id FROM exam_sessions s JOIN exam_variants v ON v.id = s.exam_variant_id "
                "JOIN exams e ON e.id = v.exam_id WHERE e.slug = 'gate' AND s.year = %s",
                (YEAR,),
            )
            sessions = [r[0] for r in cur.fetchall()]
            cur.execute(
                "SELECT id FROM question_sets WHERE exam_session_id = ANY(%s)", (sessions,)
            )
            sets = [r[0] for r in cur.fetchall()]
            cur.execute(
                "SELECT DISTINCT question_id FROM question_occurrences "
                "WHERE question_set_id = ANY(%s)",
                (sets,),
            )
            questions = {r[0] for r in cur.fetchall()}
            cur.execute(
                "SELECT question_id, review_batch_id FROM intake_items "
                "WHERE paper_key LIKE %s",
                (f"gate/{YEAR}/%",),
            )
            batches = set()
            for question_id, batch_id in cur.fetchall():
                if question_id:
                    questions.add(question_id)
                if batch_id:
                    batches.add(batch_id)
            cur.execute(
                "SELECT id FROM scraped_questions WHERE source_url LIKE %s", (f"{BASE_URL}/%",)
            )
            batches |= {r[0] for r in cur.fetchall()}
            questions, batches = list(questions), list(batches)

            cur.execute("DELETE FROM attempts WHERE question_id = ANY(%s)", (questions,))
            cur.execute(
                "DELETE FROM duplicate_reviews WHERE existing_question_id = ANY(%s) "
                "OR scraped_question_id = ANY(%s)",
                (questions, batches),
            )
            cur.execute("DELETE FROM intake_items WHERE paper_key LIKE %s", (f"gate/{YEAR}/%",))
            cur.execute("DELETE FROM scraped_questions WHERE id = ANY(%s)", (batches,))
            cur.execute("DELETE FROM question_variants WHERE question_id = ANY(%s)", (questions,))
            cur.execute("DELETE FROM questions WHERE id = ANY(%s)", (questions,))
            cur.execute("DELETE FROM question_sets WHERE id = ANY(%s)", (sets,))
            cur.execute("DELETE FROM exam_sessions WHERE id = ANY(%s)", (sessions,))
            cur.execute(
                "DELETE FROM raw_artifacts WHERE source_slug = 'gate' AND source_url LIKE %s",
                (f"{BASE_URL}/%",),
            )
        conn.commit()
    finally:
        conn.close()
    return {"cleaned": True, "questions": len(questions), "batches": len(batches)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cleanup", action="store_true", help="Delete year 2099's data.")
    parser.add_argument("--sitting", help="The sitting to import as (default: E2E-<random>).")
    args = parser.parse_args(argv)
    if args.cleanup:
        print(json.dumps(cleanup()))
        return 0
    print(json.dumps(run_import(args.sitting or f"E2E-{secrets.token_hex(3)}")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
