"""
Tests for the deterministic quality gate — docs/roadmap/engineering-roadmap.md item 19.

Ports packages/content/src/validate.test.ts's cases onto NormalizedQuestion (item 9's test cases,
as the roadmap item asks), then adds the regression tests for what changed: multiple_correct now
gets checked against options (validate.test.ts documents this as a real, un-fixed gap in the TS
version), an unregistered exam_slug is now its own rule, duplicate stable_content_ids are checked
across a whole batch, and the FLAG FOR HUMAN REVIEW defect is caught independently of needs_review.

Requires DATABASE_URL (see test_conformance.py's docstring): EXAM_NOT_REGISTERED needs a real
lookup against the exams table. Every test creates its own exam (or deliberately doesn't, to
exercise EXAM_NOT_REGISTERED) with a unique slug and tears it down afterward.
"""
import os
import uuid

import pytest

from prepora_pipeline.contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedOption,
    NormalizedQuestion,
    TextAnswer,
)
from prepora_pipeline.core.db import get_db_connection

from .validate import validate_question, validate_question_set

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — the quality gate needs a database."
)


@pytest.fixture
def test_exam():
    unique = uuid.uuid4().hex[:10]
    org_slug = f"test-org-{unique}"
    exam_type_slug = f"test-type-{unique}"
    exam_slug = f"test-exam-{unique}"

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO organizations (name, slug) VALUES (%s, %s) RETURNING id",
                (f"Test Org {unique}", org_slug),
            )
            org_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO exam_types (slug, label) VALUES (%s, %s) RETURNING id",
                (exam_type_slug, f"Test Type {unique}"),
            )
            type_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO exams (name, slug, organization_id, exam_type_id) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (f"Test Exam {unique}", exam_slug, org_id, type_id),
            )
            exam_id = cur.fetchone()[0]
            conn.commit()
    finally:
        conn.close()

    yield exam_slug

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM exams WHERE id = %s", (exam_id,))
            cur.execute("DELETE FROM exam_types WHERE id = %s", (type_id,))
            cur.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
            conn.commit()
    finally:
        conn.close()


def _valid_question(test_exam, **overrides) -> NormalizedQuestion:
    fields = {
        "exam_slug": test_exam,
        "exam_variant_slug": "standard",
        "subject_slug": "test-subject",
        "number": 1,
        "question_text": "What is 2 + 2?",
        "question_type": "mcq",
        "options": [
            NormalizedOption(key="A", text="3"),
            NormalizedOption(key="B", text="4"),
        ],
        "answer": McqAnswer(correct_key="B"),
        "explanation": "Basic arithmetic.",
        "needs_review": False,
        "parser_version": "test-v1",
    }
    fields.update(overrides)
    return NormalizedQuestion(**fields)


class TestPortedRules:
    """Direct ports of packages/content/src/validate.test.ts's cases."""

    def test_passes_a_well_formed_mcq_question_with_no_issues(self, test_exam):
        r = validate_question(_valid_question(test_exam))
        assert r.valid is True
        assert r.issues == []
        assert r.validated is not None

    def test_missing_question_text_flags_empty_text_as_an_error(self, test_exam):
        r = validate_question(_valid_question(test_exam, question_text=" "))
        assert r.valid is False
        assert any(i.code == "MISSING_QUESTION_TEXT" and i.severity == "error" for i in r.issues)

    def test_mcq_missing_options_flags_fewer_than_two_options(self, test_exam):
        r = validate_question(
            _valid_question(test_exam, options=[NormalizedOption(key="A", text="Only one")])
        )
        assert any(i.code == "MCQ_MISSING_OPTIONS" and i.severity == "error" for i in r.issues)

    def test_duplicate_option_keys_flags_two_options_sharing_a_key(self, test_exam):
        r = validate_question(
            _valid_question(
                test_exam,
                options=[
                    NormalizedOption(key="A", text="First"),
                    NormalizedOption(key="A", text="Duplicate key"),
                ],
            )
        )
        assert any(i.code == "DUPLICATE_OPTION_KEYS" and i.severity == "error" for i in r.issues)

    def test_missing_answer_flags_a_question_with_no_answer_at_all(self, test_exam):
        r = validate_question(_valid_question(test_exam, answer=None))
        assert any(i.code == "MISSING_ANSWER" and i.severity == "error" for i in r.issues)

    def test_a_question_with_marks_to_all_needs_no_answer(self, test_exam):
        r = validate_question(_valid_question(test_exam, answer=None, answer_status="marks_to_all"))
        assert r.valid, r.issues
        assert r.validated is not None and r.validated.answer is None

    def test_invalid_answer_key_flags_an_mcq_key_absent_from_options(self, test_exam):
        r = validate_question(_valid_question(test_exam, answer=McqAnswer(correct_key="Z")))
        assert any(i.code == "INVALID_ANSWER_KEY" and i.severity == "error" for i in r.issues)

    def test_missing_explanation_warns_but_does_not_invalidate(self, test_exam):
        r = validate_question(_valid_question(test_exam, explanation=None))
        issue = next(i for i in r.issues if i.code == "MISSING_EXPLANATION")
        assert issue.severity == "warning"
        assert r.valid is True

    def test_needs_review_flags_using_its_review_note(self, test_exam):
        r = validate_question(
            _valid_question(
                test_exam, needs_review=True, review_note="Ambiguous source material"
            )
        )
        issue = next(i for i in r.issues if i.code == "NEEDS_REVIEW")
        assert issue.severity == "error"
        assert issue.message == "Ambiguous source material"
        assert r.valid is False


class TestGapsFixedFromTheTsVersion:
    """
    validate.test.ts's own "a real gap, not this test's concern" test documents that
    multiple_correct answers were never checked against options in the TS validator. This suite
    documents the opposite here: the gap is closed.
    """

    def test_multiple_correct_answer_keys_are_now_checked_against_options(self, test_exam):
        r = validate_question(
            _valid_question(
                test_exam,
                options=[
                    NormalizedOption(key="A", text="One"),
                    NormalizedOption(key="B", text="Two"),
                ],
                answer=MultipleCorrectAnswer(correct_keys=["Z", "Y"]),
            )
        )
        assert any(i.code == "INVALID_ANSWER_KEY" and i.severity == "error" for i in r.issues)
        assert r.valid is False

    def test_a_valid_multiple_correct_answer_passes(self, test_exam):
        r = validate_question(
            _valid_question(
                test_exam,
                options=[
                    NormalizedOption(key="A", text="One"),
                    NormalizedOption(key="B", text="Two"),
                ],
                answer=MultipleCorrectAnswer(correct_keys=["A", "B"]),
            )
        )
        assert r.valid is True

    def test_an_unregistered_exam_slug_is_flagged(self):
        r = validate_question(_valid_question("totally-unregistered-exam-xyz"))
        assert any(i.code == "EXAM_NOT_REGISTERED" and i.severity == "error" for i in r.issues)
        assert r.valid is False

    def test_duplicate_stable_content_ids_are_caught_across_a_whole_batch(self, test_exam):
        # Same exam/variant/year/subject/number combination twice — a batch-level duplicate that
        # a single-file check (the TS version's actual scope) could never catch.
        a = _valid_question(test_exam, number=1)
        b = _valid_question(test_exam, number=1, question_text="A differently worded question?")
        results = validate_question_set([a, b])

        assert results[0][1].valid is True
        _, second_report = results[1]
        assert any(
            i.code == "DUPLICATE_STABLE_CONTENT_ID" and i.severity == "error"
            for i in second_report.issues
        )
        assert second_report.valid is False


class TestFlagForHumanReviewDefect:
    """
    Regression test for docs/architecture/prepora-next-level-plan.md finding #12: content whose
    answer is the literal string "FLAG FOR HUMAN REVIEW" must quarantine and never publish, even
    if — exactly as the original defect did — whatever produced this NormalizedQuestion failed to
    set needs_review itself.
    """

    def test_flag_for_human_review_answer_quarantines_even_without_needs_review_set(
        self, test_exam
    ):
        normalized = _valid_question(
            test_exam,
            answer=TextAnswer(answer="FLAG FOR HUMAN REVIEW"),
            needs_review=False,  # the exact shape of the original defect
        )

        r = validate_question(normalized)

        assert r.valid is False
        assert any(i.code == "NEEDS_REVIEW" and i.severity == "error" for i in r.issues)
        assert r.validated is None

    def test_flag_for_human_review_is_case_insensitive(self, test_exam):
        normalized = _valid_question(
            test_exam,
            answer=TextAnswer(answer="flag for human review — ambiguous"),
            needs_review=False,
        )
        r = validate_question(normalized)
        assert r.valid is False

    def test_does_not_double_report_when_needs_review_is_already_set(self, test_exam):
        normalized = _valid_question(
            test_exam,
            answer=TextAnswer(answer="FLAG FOR HUMAN REVIEW"),
            needs_review=True,
            review_note="already flagged upstream",
        )
        r = validate_question(normalized)
        needs_review_issues = [i for i in r.issues if i.code == "NEEDS_REVIEW"]
        assert len(needs_review_issues) == 1


class TestQuarantineIsQueryable:
    def test_a_quarantined_record_retains_its_reason_and_is_queryable(self, test_exam):
        r = validate_question(_valid_question(test_exam, answer=None))

        assert r.valid is False
        assert r.confidence == "needs-review"
        reasons = [i.message for i in r.issues if i.code == "MISSING_ANSWER"]
        assert reasons == ["No answer found"]


class TestConfidenceLabel:
    def test_official_source_type_is_verified_when_valid(self, test_exam):
        r = validate_question(_valid_question(test_exam, source_type="official"))
        assert r.confidence == "verified"

    def test_an_invalid_question_is_always_needs_review_confidence(self, test_exam):
        r = validate_question(_valid_question(test_exam, answer=None, source_type="official"))
        assert r.confidence == "needs-review"
