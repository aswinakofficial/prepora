"""Tests for the GATE normalizer and importer (#48), on the invented fixtures from test_parser.py:
nothing is fetched, nothing real is committed."""
import pytest

from prepora_pipeline.core.intake import RecordResult, content_hash
from prepora_pipeline.core.quality import CropRegion, Issue

from .catalog import PaperSpec
from .key_parser import GateKeyRow
from .normalizer import GateNormalizeError, to_normalized
from .paper_parser import GateQuestion
from .run import _intake_item, import_paper
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
        assert n.explanation is None and n.parser_version == "gate-2"

    def test_it_is_markdown_with_prose_escaped_and_code_fences_kept(self):
        question = _question(options={"A": "a_1 * b", "B": "Two", "C": "Three", "D": "Four"})
        question.text = "What does *p hold?\n\n```\nint *p = &x;\n```"
        n = to_normalized(question, _key(), PAPER)
        assert n.text_format == "markdown"
        assert n.question_text == "What does \\*p hold?\n\n```\nint *p = &x;\n```"
        assert n.options[0].text == "a\\_1 \\* b"

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

    def write_batch(*batch, intake_item_ids):
        batches.append(batch)
        intake.mark_in_review(intake_item_ids, f"b{len(batches)}")
        return f"b{len(batches)}"

    report = import_paper(
        PAPER,
        fetch=files.__getitem__,
        store=_Store(),
        write_batch=write_batch,
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

    def test_normalize_validation_errors_are_recorded_as_invalid(self, monkeypatch):
        from . import run

        def refuse(*_args, **_kwargs):
            raise ValueError("question_text: String should have at least 1 character")

        monkeypatch.setattr(run, "to_normalized", refuse)
        item = _intake_item(_question(), _key(), PAPER, "gate/2099/cs/CS-1", "f" * 64, None)
        assert [i.code for i in item.issues] == ["invalid"]
        assert item.status == "held" and item.candidate["number"] == 11

    def test_a_figure_hold_still_records_the_type_mismatch(self):
        question = _question(options={}, issues=[Issue("figure", "something is drawn")])
        item = _intake_item(question, _key(), PAPER, "gate/2099/cs/CS-1", "f" * 64, None)
        assert [i.code for i in item.issues] == ["figure", "type_mismatch"]


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


class TestGateImportExit:
    def _exit(self, monkeypatch, held):
        import argparse

        from prepora_pipeline import cli
        from prepora_pipeline.connectors.gate import run

        class Report:
            join_gaps: list = []

            def lines(self):
                return ["report"]

        report = Report()
        report.held = held
        monkeypatch.setattr(run, "import_paper", lambda _paper: report)
        args = argparse.Namespace(all_pilot=True, year=None, sitting=None, report_dir=None)
        return cli.cmd_gate_import(args)

    def test_a_layout_hold_with_a_type_mismatch_is_not_a_parser_fault(self, monkeypatch):
        assert self._exit(monkeypatch, [(3, ["figure", "type_mismatch"])]) == 0

    def test_a_bare_type_mismatch_or_invalid_question_is_a_parser_fault(self, monkeypatch):
        assert self._exit(monkeypatch, [(3, ["type_mismatch"])]) == 1
        assert self._exit(monkeypatch, [(3, ["invalid"])]) == 1


# ─── Spec 13: the math rebuild in the importer

OPEN, CLOSE = "﷐", "﷑"


def _valid(_normalized):
    return type("Report", (), {"issues": []})()


class TestMathInTheImporter:
    def test_a_formula_becomes_dollar_math_in_the_candidate(self):
        options = {"A": f"{OPEN}2^{{17}}{CLOSE}", "B": "Two", "C": "x", "D": "y"}
        question = _question(options=options)
        question.text = f"Let {OPEN}Z_{{1}}{CLOSE} be a set."
        item = _intake_item(question, _key(), PAPER, "gate/2099/cs/CS-1", "f" * 64, _valid)
        assert item.candidate["question_text"] == "Let $Z_{1}$ be a set."
        assert item.candidate["options"][0]["text"] == "$2^{17}$"

    def test_a_fallback_candidate_uses_the_original_text(self):
        # An image-only option can't be normalized; the held candidate must carry the text as
        # extracted, never the rebuilt one with its markers.
        question = _question(options={"A": "", "B": "x", "C": "y", "D": "z"})
        question.original_text = "Let Z 1 be a set."
        question.original_options = dict(question.options)
        question.text = f"Let {OPEN}Z_{{1}}{CLOSE} be a set."
        item = _intake_item(question, _key(), PAPER, "gate/2099/cs/CS-1", "f" * 64, None)
        assert item.candidate["question_text"] == "Let Z 1 be a set."
        assert OPEN not in str(item.candidate) and CLOSE not in str(item.candidate)

    def test_a_marker_in_a_candidate_is_refused(self):
        question = _question()
        question.original_text = f"Let {OPEN}Z{CLOSE} be a set."
        question.options = {}  # NAT disagrees with the key: the fallback candidate is built
        with pytest.raises(ValueError, match="marker"):
            _intake_item(question, _key(), PAPER, "gate/2099/cs/CS-1", "f" * 64, None)

    def test_no_candidate_of_the_e2e_paper_holds_a_marker(self):
        from ...core.answer_keys import join_by_number
        from ...core.pdf_text import extract_pages
        from .e2e_math_paper import KEY_ROWS, paper_pdf
        from .key_parser import parse_answer_key
        from .paper_parser import parse_paper
        from .testing import key_pdf

        questions = parse_paper(extract_pages(paper_pdf()))
        keys = parse_answer_key(extract_pages(key_pdf(KEY_ROWS)))
        join = join_by_number(questions, keys)
        for question, key in join.matched:
            item = _intake_item(
                question, key, PAPER, "gate/2099/cs/CS-1", "f" * 64, _valid
            )
            assert OPEN not in str(item.candidate) and CLOSE not in str(item.candidate)

    def test_the_report_counts_add_up_and_hold_no_text(self, tmp_path, monkeypatch):
        from .run import write_report

        monkeypatch.setattr("prepora_pipeline.stages.validate._exam_is_registered", lambda _: True)
        from .e2e_math_paper import KEY_ROWS, paper_pdf

        paper = PaperSpec(2099, "CS", "CS-1", "https://x.test/qp.pdf", "https://x.test/key.pdf")
        files = {paper.qp_url: paper_pdf(), paper.key_url: key_pdf(KEY_ROWS)}
        report = import_paper(
            paper, fetch=files.__getitem__, store=_Store(), write_batch=lambda *a, **k: "b1",
            intake=FakeIntake(), register=False,
        )
        counts = report.counts()
        m, r = counts["math"], counts["retypeset"]
        assert m["recovered"] + m["still_held"] == m["flagged"] == 3
        assert r["retypeset"] + r["kept"] == r["clean_with_math_runs"] == 3
        assert m["still_held_by_reason"] == {"fraction": 1}
        assert r["kept_by_reason"] == {"unknown_symbol": 1}
        assert counts["held_by_issues"] == {"math": 1}

        [path] = write_report([report], tmp_path)
        assert path.name == "2099-CS-1.iitg.json"
        first = path.read_text()
        write_report([report], tmp_path)
        assert path.read_text() == first  # stable: no diff on a re-run
        text = first + (tmp_path / "README.md").read_text()
        assert "Z_{1}" not in text and "Let" not in text  # counts only
        assert (tmp_path / "README.md").exists()
        assert report.lines().count("  Q.7 kept as is: unknown_symbol") == 1


@pytest.mark.skipif(not __import__("os").environ.get("DATABASE_URL"), reason="needs DATABASE_URL")
class TestUpgradeAgainstTheDatabase:
    """gate-1 → gate-2 through intake's content hash (Spec 13, Decision 4)."""

    def test_recovered_retypeset_and_kept_items_follow_the_hash_rules(self, monkeypatch):
        import uuid

        from prepora_pipeline.core import sync_sources_from_yaml
        from prepora_pipeline.core.db import get_db_connection

        from . import paper_parser
        from .e2e_math_paper import KEY_ROWS, cleanup, paper_pdf

        sync_sources_from_yaml()
        sitting = f"E2E-{uuid.uuid4().hex[:6]}"
        paper = PaperSpec(2099, "CS", sitting, f"https://x.test/{sitting}/qp.pdf",
                          f"https://x.test/{sitting}/key.pdf")
        files = {paper.qp_url: paper_pdf(), paper.key_url: key_pdf(KEY_ROWS)}
        key = f"gate/2099/cs/{sitting}"

        def query(sql, params=()):
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(sql, params)
                    rows = cur.fetchall() if cur.description else None
                conn.commit()
                return rows
            finally:
                conn.close()

        def statuses():
            return dict(query(
                "SELECT number, status::text FROM intake_items WHERE paper_key = %s", (key,)
            ))

        def run():
            return import_paper(paper, fetch=files.__getitem__, store=_Store())

        try:
            # What parser gate-1 recorded: no rebuild.
            with monkeypatch.context() as old:
                old.setattr(paper_parser, "_rebuild", lambda *a, **k: None)
                first = run()
            assert statuses()[1] == "held" and statuses()[4] == "held"
            # A person published everything that was ready.
            query("UPDATE intake_items SET status = 'published' WHERE paper_key = %s "
                  "AND status = 'in_review'", (key,))
            query("UPDATE scraped_questions SET status = 'approved' WHERE id = %s",
                  (first.batch_id,))

            second = run()
            now = statuses()
            for n in (1, 2, 3, 6):  # recovered (1, 3) and re-typeset published (2, 6): to review
                assert now[n] == "in_review"
            assert now[5] == "published" and now[7] == "published"   # unchanged text
            assert now[4] == "held"                                  # still held, refreshed
            [issues] = query("SELECT issues FROM intake_items WHERE paper_key = %s AND number = 4",
                             (key,))[0:1]
            assert any("fraction" in i["detail"] for i in issues[0])
            assert second.in_batch == 4 and second.batch_id

            third = run()
            assert third.batch_id is None and third.recorded.inserted == 0  # idempotent
        finally:
            cleanup()


class TestReportFindings:
    def _math(self, number, outcome, detector=(), runs=True):
        from .run import QuestionMath

        return QuestionMath(
            number=number, outcome=outcome, reasons=[], detector_math=list(detector),
            first_codes=["math"] if detector else [], issues_after=[], math_runs=runs,
        )

    def _report(self, key, maths):
        from .run import ImportReport

        report = ImportReport(paper="GATE", key=key, parsed=len(maths), clean=len(maths))
        report.maths = maths
        return report

    def test_the_readme_sums_every_report_in_the_directory(self, tmp_path):
        from .run import write_report

        ok = [self._math(1, "retypeset"), self._math(2, "recovered", ["a row"])]
        write_report([self._report("gate/2026/cs/CS-1", ok)], tmp_path)
        write_report([self._report("gate/2025/cs/CS-1", ok)], tmp_path)  # a later, partial run
        readme = (tmp_path / "README.md").read_text()
        assert "2025-CS-1.iitg" in readme and "2026-CS-1.iitg" in readme
        assert "| **All** | **4** |" in readme

    def test_the_arithmetic_can_fail(self):
        # A question with math runs that came out as neither re-typeset nor kept is a miscount.
        report = self._report("gate/2026/cs/CS-1", [self._math(1, "none")])
        with pytest.raises(ValueError, match="re-typeset"):
            report.counts()
        # A question held for math whose outcome is neither recovered nor still held too.
        report = self._report("gate/2026/cs/CS-1", [self._math(1, "kept", ["a row"])])
        with pytest.raises(ValueError, match="other than"):
            report.counts()


@pytest.mark.skipif(not __import__("os").environ.get("DATABASE_URL"), reason="needs DATABASE_URL")
def test_cleanup_keeps_a_question_that_also_occurs_in_another_set():
    import uuid

    from prepora_pipeline.contracts import NormalizedQuestion
    from prepora_pipeline.core.db import get_db_connection
    from prepora_pipeline.core.intake import IntakeStore  # noqa: F401
    from prepora_pipeline.stages.publish import publish_question

    from . import e2e_math_paper
    from .e2e_math_paper import cleanup

    sitting = f"E2E-{uuid.uuid4().hex[:6]}"
    result = e2e_math_paper.run_import(sitting)
    conn = get_db_connection()
    shared_id = other_session = None
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT candidate FROM intake_items WHERE paper_key = %s AND number IN (5, 2) "
                "ORDER BY number", (result["paper_key"],)
            )
            candidates = [NormalizedQuestion.model_validate(r[0]) for r in cur.fetchall()]
        conn.commit()
        mine, shared = (publish_question(c) for c in candidates)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT s.exam_variant_id FROM exam_sessions s WHERE s.id = "
                "(SELECT exam_session_id FROM question_sets WHERE exam_session_id IN "
                "(SELECT id FROM exam_sessions WHERE year = 2099) LIMIT 1)"
            )
            variant = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO exam_sessions (exam_variant_id, label, year) "
                "VALUES (%s, 'other', 2098) RETURNING id", (variant,)
            )
            other_session = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO question_sets (exam_variant_id, title, slug, exam_session_id, "
                "paper_kind, key_status) SELECT exam_variant_id, 'other', %s, %s, paper_kind, "
                "key_status FROM question_sets WHERE exam_session_id IN "
                "(SELECT id FROM exam_sessions WHERE year = 2099) LIMIT 1 RETURNING id",
                (f"other-{sitting}", other_session),
            )
            other_set = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO question_occurrences (question_id, question_set_id) VALUES (%s, %s)",
                (shared.question_id, other_set),
            )
        conn.commit()
        shared_id = shared.question_id
        cleanup()
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM questions WHERE id = %s", (shared_id,))
            assert cur.fetchone()[0] == 1  # kept: it occurs elsewhere too
            cur.execute("SELECT count(*) FROM questions WHERE id = %s", (mine.question_id,))
            assert cur.fetchone()[0] == 0  # the fixture's own question is gone
        conn.commit()
    finally:
        with conn.cursor() as cur:
            if shared_id:
                cur.execute("DELETE FROM questions WHERE id = %s", (shared_id,))
            cur.execute("DELETE FROM question_sets WHERE slug LIKE %s", (f"other-{sitting}",))
            if other_session:
                cur.execute("DELETE FROM exam_sessions WHERE id = %s", (other_session,))
        conn.commit()
        conn.close()
        cleanup()
