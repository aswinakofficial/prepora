"""Tests for the GATE normalizer and importer (#48), on the invented fixtures from test_parser.py:
nothing is fetched, nothing real is committed."""
import pytest

from .catalog import PaperSpec
from .key_parser import GateKeyRow
from .normalizer import GateNormalizeError, to_normalized
from .paper_parser import CropRegion, GateQuestion
from .run import import_paper
from .test_parser import invented_paper, key_pdf

PAPER = PaperSpec(2099, "CS", "CS-1", "https://gate.example.test/qp.pdf", "https://gate.example.test/key.pdf")

KEY_ROWS = [
    ("1", "3", "MCQ", "GA", "B", "1"),
    ("2", "3", "MSQ", "GA", "A;C", "1"),
    ("3", "3", "NAT", "CS-1", "2 to 2", "2"),
    ("4", "3", "MCQ", "CS-1", "A", "2"),
]


def _question(number=11, options=None, flags=None):
    return GateQuestion(
        number=number,
        label=f"Q.{number}",
        text="An invented question?",
        options={"A": "One", "B": "Two", "C": "Three", "D": "Four"} if options is None else options,
        marks_heading=1,
        page=0,
        regions=[CropRegion(0, (0, 0, 1, 1))],
        flags=flags or [],
    )


def _key(qtype="MCQ", answer=("keys", ["B"]), marks=1, section="CS-1", raw="B", number=11):
    return GateKeyRow(number, "3", section, marks, qtype, answer, raw)


class TestNormalizer:
    def test_an_mcq_carries_marks_negative_marks_section_and_provenance(self):
        n = to_normalized(_question(), _key(marks=2), PAPER, raw_artifact_sha256="a" * 64)
        assert (n.exam_slug, n.exam_variant_slug) == ("gate", "cs")
        assert n.subject_slug == "computer-science"
        assert (n.year, n.shift, n.number, n.number_label) == (2099, "CS-1", 11, "Q.11")
        assert (n.marks, round(n.negative_marks, 4), n.section) == (2.0, 0.6667, "CS")
        assert n.question_type == "mcq" and n.answer.correct_key == "B"
        assert (n.answer_provenance, n.paper_kind, n.key_status, n.source_type) == (
            "official_final",
            "past_paper",
            "final",
            "official",
        )
        assert n.question_set_title == "GATE 2099 · CS-1"
        assert n.explanation is None and n.parser_version == "gate-1"

    def test_msq_nat_and_mta_answers(self):
        msq = to_normalized(_question(), _key("MSQ", ("keys", ["A", "C"])), PAPER)
        assert msq.question_type == "multiple_correct" and msq.answer.correct_keys == ["A", "C"]
        assert msq.negative_marks == 0  # no penalty for MSQ

        nat = to_normalized(
            _question(options={}),
            _key("NAT", ("ranges", [(4.24, 4.26)]), raw="4.24 to 4.26", section="GA"),
            PAPER,
        )
        assert nat.question_type == "numerical" and nat.options == []
        assert nat.answer.answer == "4.24 to 4.26" and nat.answer.ranges == [(4.24, 4.26)]
        assert nat.section == "GA" and nat.negative_marks == 0

        mta = to_normalized(_question(), _key(answer=("mta", None), raw="MTA"), PAPER)
        assert mta.answer is None and mta.answer_status == "marks_to_all"

    def test_a_question_that_disagrees_with_its_key_is_refused(self):
        with pytest.raises(GateNormalizeError, match="NAT"):
            to_normalized(_question(), _key("NAT", ("ranges", [(1.0, 1.0)])), PAPER)
        with pytest.raises(GateNormalizeError, match="image"):
            to_normalized(_question(options={"A": "", "B": "x", "C": "y", "D": "z"}), _key(), PAPER)


class _Store:
    def __init__(self):
        self.stored = []

    def store(self, content, **kw):
        import hashlib

        from prepora_pipeline.contracts import RawArtifact

        self.stored.append(kw["source_url"])
        sha = hashlib.sha256(content).hexdigest()
        return RawArtifact.model_construct(sha256=sha, **kw)


def _run(key_rows, boxes=None):
    files = {PAPER.qp_url: invented_paper(boxes=boxes), PAPER.key_url: key_pdf(key_rows)}
    batches = []
    report = import_paper(
        PAPER,
        fetch=files.__getitem__,
        store=_Store(),
        write_batch=lambda *batch: batches.append(batch) or "b1",
        register=False,
    )
    return report, batches


class TestImport:
    @pytest.fixture(autouse=True)
    def _gate_is_registered(self, monkeypatch):
        # Registration is a database write (tested with the database below); here, pretend it ran.
        monkeypatch.setattr("prepora_pipeline.stages.validate._exam_is_registered", lambda _: True)

    def test_clean_questions_go_into_one_normalized_batch_and_flagged_ones_are_held_back(self):
        report, batches = _run(KEY_ROWS, boxes={2: [(140, 290, 60, 40)]})
        assert (report.parsed, report.joined, report.in_batch) == (4, 4, 3)
        assert report.held_back == [(4, ["figure"])]
        assert report.invalid == [] and report.batch_id == "b1"

        [(url, elements, metadata)] = batches
        assert url == PAPER.qp_url
        assert metadata["format"] == "normalized-v1"
        assert (metadata["exam"], metadata["paper"], metadata["year"]) == ("GATE", "CS-1", 2099)
        assert [e["normalized"]["number"] for e in elements] == [1, 2, 3]
        assert [e["answer"] for e in elements] == ["B", "A | C", "2 to 2"]
        assert elements[2]["options"] == [] and elements[2]["normalized"]["answer"]["ranges"] == [
            [2.0, 2.0]
        ]
        assert all(not e["normalized"]["needs_review"] for e in elements)
        assert "clean" in report.lines()[0]

    def test_an_incomplete_join_writes_nothing(self):
        report, batches = _run(KEY_ROWS[:3])  # the key has no row for Q.4
        assert batches == [] and report.batch_id is None
        assert report.join_gaps == ["Q.4 has no key row"]

    def test_a_question_whose_type_disagrees_with_its_key_is_listed_invalid(self):
        rows = [*KEY_ROWS[:2], ("3", "3", "MCQ", "CS-1", "A", "2"), KEY_ROWS[3]]
        report, batches = _run(rows)
        assert [n for n, _ in report.invalid] == [3]
        assert [e["normalized"]["number"] for e in batches[0][1]] == [1, 2]


@pytest.mark.skipif(not __import__("os").environ.get("DATABASE_URL"), reason="needs DATABASE_URL")
def test_import_registers_gate_and_writes_a_real_review_batch():
    from prepora_pipeline.core.db import get_db_connection

    files = {PAPER.qp_url: invented_paper(), PAPER.key_url: key_pdf(KEY_ROWS)}
    batch_ids = []
    try:
        for _ in range(2):  # registering is idempotent
            report = import_paper(PAPER, fetch=files.__getitem__, store=_Store())
            batch_ids.append(report.batch_id)
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT e.status, o.slug, t.slug FROM exams e "
                    "JOIN organizations o ON o.id = e.organization_id "
                    "JOIN exam_types t ON t.id = e.exam_type_id WHERE e.slug = 'gate'"
                )
                assert cur.fetchall() == [("published", "ncb-gate", "competitive")]
                cur.execute(
                    "SELECT parsed_data->'metadata'->>'format', "
                    "jsonb_array_length(parsed_data->'extractedElements'), status "
                    "FROM scraped_questions WHERE id = %s",
                    (batch_ids[0],),
                )
                assert cur.fetchone() == ("normalized-v1", 3, "pending")  # Q.4 is held back
        finally:
            conn.close()
    finally:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM scraped_questions WHERE id = ANY(%s)", (batch_ids,))
            conn.commit()
        finally:
            conn.close()
