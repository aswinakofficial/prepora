"""Tests for the GATE normalizer and importer (#48), on the invented fixtures from test_parser.py:
nothing is fetched, nothing real is committed."""
import pytest

from prepora_pipeline.core.intake import RecordResult, content_hash
from prepora_pipeline.core.quality import CropRegion

from .catalog import PaperSpec
from .key_parser import GateKeyRow
from .normalizer import GateNormalizeError, to_normalized
from .paper_parser import GateQuestion
from .run import import_paper
from .test_parser import invented_paper, key_pdf

PAPER = PaperSpec(2099, "CS", "CS-1", "https://gate.example.test/qp.pdf", "https://gate.example.test/key.pdf")

KEY_ROWS = [
    ("1", "3", "MCQ", "GA", "B", "1"),
    ("2", "3", "MSQ", "GA", "A;C", "1"),
    ("3", "3", "NAT", "CS-1", "2 to 2", "2"),
    ("4", "3", "MCQ", "CS-1", "A", "2"),
]


def _question(number=11, options=None, issues=None):
    return GateQuestion(
        number=number,
        label=f"Q.{number}",
        text="An invented question?",
        options={"A": "One", "B": "Two", "C": "Three", "D": "Four"} if options is None else options,
        marks_heading=1,
        page=0,
        regions=[CropRegion(0, (0, 0, 1, 1))],
        issues=issues or [],
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


class FakeIntake:
    """IntakeStore's behaviour, in memory: same content keeps a decided status, changed content
    is recomputed (core/intake.py; the real store is tested against the database below)."""

    def __init__(self):
        self.rows: dict[tuple, dict] = {}

    def record(self, items):
        result = RecordResult()
        for item in items:
            key = (item.paper_key, item.edition, item.number)
            digest = content_hash(item.candidate)
            row = self.rows.get(key)
            if row is None:
                result.inserted += 1
                row = self.rows[key] = {"id": f"i{item.number}", "batch": None}
            elif row["hash"] == digest:
                result.unchanged += 1
            else:
                result.changed += 1
            if row.get("status") == "in_review":  # its batch holds this copy
                result.waiting += row["hash"] != digest
                result.statuses["in_review"] = result.statuses.get("in_review", 0) + 1
                continue
            keep = row.get("hash") == digest and row.get("status") in ("published", "rejected")
            row.update(hash=digest, candidate=item.candidate, issues=item.issues)
            if not keep:
                row.update(status=item.status, batch=None)
            result.statuses[row["status"]] = result.statuses.get(row["status"], 0) + 1
        return result

    def ready_for_batch(self, source, paper_key, edition):
        return [
            (row["id"], row["candidate"])
            for (p, e, _), row in sorted(self.rows.items())
            if (p, e) == (paper_key, edition) and row["status"] == "ready" and not row["batch"]
        ]

    def mark_in_review(self, ids, batch_id):
        for row in self.rows.values():
            if row["id"] in ids:
                row.update(status="in_review", batch=batch_id)


def _run(key_rows, boxes=None, intake=None):
    files = {PAPER.qp_url: invented_paper(boxes=boxes), PAPER.key_url: key_pdf(key_rows)}
    batches = []
    intake = intake or FakeIntake()
    report = import_paper(
        PAPER,
        fetch=files.__getitem__,
        store=_Store(),
        write_batch=lambda *batch: batches.append(batch) or f"b{len(batches)}",
        intake=intake,
        register=False,
    )
    return report, batches, intake


class TestImport:
    @pytest.fixture(autouse=True)
    def _gate_is_registered(self, monkeypatch):
        # Registration is a database write (tested with the database below); here, pretend it ran.
        monkeypatch.setattr("prepora_pipeline.stages.validate._exam_is_registered", lambda _: True)

    def test_every_question_goes_to_intake_and_only_ready_ones_to_review(self):
        report, batches, intake = _run(KEY_ROWS, boxes={2: [(140, 290, 60, 40)]})
        assert (report.parsed, report.joined, report.clean, report.in_batch) == (4, 4, 3, 3)
        assert report.held == [(4, ["figure", "image_option"])]
        assert report.recorded.inserted == 4 and report.batch_id == "b1"
        held = intake.rows[("gate/2099/cs/CS-1", "iitg", 4)]
        assert held["status"] == "held"
        assert {i.code for i in held["issues"]} == {"figure", "image_option"}

        [(url, elements, metadata)] = batches
        assert url == PAPER.qp_url
        assert metadata["format"] == "normalized-v1"
        assert (metadata["exam"], metadata["paper"], metadata["year"]) == ("GATE", "CS-1", 2099)
        assert [e["normalized"]["number"] for e in elements] == [1, 2, 3]
        assert [e["intakeItemId"] for e in elements] == ["i1", "i2", "i3"]
        assert [e["answer"] for e in elements] == ["B", "A | C", "2 to 2"]
        assert elements[2]["options"] == []
        assert elements[2]["normalized"]["answer"]["ranges"] == [[2.0, 2.0]]
        assert "clean" in report.lines()[0]

    def test_a_second_run_records_nothing_new_and_writes_no_batch(self):
        _, _, intake = _run(KEY_ROWS)
        report, batches, _ = _run(KEY_ROWS, intake=intake)
        assert batches == [] and report.batch_id is None
        assert (report.recorded.inserted, report.recorded.unchanged) == (0, 4)
        assert report.recorded.statuses == {"in_review": 3, "held": 1}
        assert any("no new review batch" in line for line in report.lines())

    def test_an_incomplete_join_writes_nothing(self):
        report, batches, intake = _run(KEY_ROWS[:3])  # the key has no row for Q.4
        assert batches == [] and report.batch_id is None and intake.rows == {}
        assert report.join_gaps == ["Q.4 has no key row"]

    def test_a_question_whose_type_disagrees_with_its_key_is_held_with_the_reason(self):
        rows = [*KEY_ROWS[:2], ("3", "3", "MCQ", "CS-1", "A", "2"), KEY_ROWS[3]]
        report, batches, intake = _run(rows)
        assert (3, ["type_mismatch"]) in report.held
        assert intake.rows[("gate/2099/cs/CS-1", "iitg", 3)]["candidate"]["key"]["qtype"] == "MCQ"
        assert [e["normalized"]["number"] for e in batches[0][1]] == [1, 2]


@pytest.mark.skipif(not __import__("os").environ.get("DATABASE_URL"), reason="needs DATABASE_URL")
def test_import_registers_gate_writes_intake_and_a_real_review_batch():
    from prepora_pipeline.core import sync_sources_from_yaml
    from prepora_pipeline.core.db import get_db_connection

    sync_sources_from_yaml()  # as a real run requires (`sync-sources`): registers `gate`

    files = {PAPER.qp_url: invented_paper(), PAPER.key_url: key_pdf(KEY_ROWS)}
    batch_ids = []

    def query(sql, params=()):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()
        finally:
            conn.close()

    try:
        first = import_paper(PAPER, fetch=files.__getitem__, store=_Store())
        batch_ids.append(first.batch_id)
        # Registering again is idempotent, and nothing is recorded or queued a second time.
        again = import_paper(PAPER, fetch=files.__getitem__, store=_Store())
        assert again.batch_id is None and again.recorded.unchanged == 4
        assert query(
            "SELECT e.status, o.slug, t.slug FROM exams e "
            "JOIN organizations o ON o.id = e.organization_id "
            "JOIN exam_types t ON t.id = e.exam_type_id WHERE e.slug = 'gate'"
        ) == [("published", "ncb-gate", "competitive")]
        assert query(
            "SELECT parsed_data->'metadata'->>'format', "
            "jsonb_array_length(parsed_data->'extractedElements'), status "
            "FROM scraped_questions WHERE id = %s",
            (first.batch_id,),
        ) == [("normalized-v1", 3, "pending")]  # Q.4 (image options) is held
        assert query(
            "SELECT number, status::text, review_batch_id IS NOT NULL, issues->0->>'code' "
            "FROM intake_items WHERE paper_key = 'gate/2099/cs/CS-1' ORDER BY number"
        ) == [
            (1, "in_review", True, None),
            (2, "in_review", True, None),
            (3, "in_review", True, None),
            (4, "held", False, "image_option"),
        ]
    finally:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM intake_items WHERE paper_key = 'gate/2099/cs/CS-1'")
                cur.execute("DELETE FROM scraped_questions WHERE id = ANY(%s)", (batch_ids,))
            conn.commit()
        finally:
            conn.close()
