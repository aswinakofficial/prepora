"""
Tests for idempotent, occurrence-aware publishing — docs/roadmap/engineering-roadmap.md item 18.

Requires DATABASE_URL (see test_conformance.py's docstring). Every test creates its own
organization/exam_type/exam with a unique slug and tears the whole tree down afterward, in FK
dependency order.
"""
import os
import uuid

import pytest

from prepora_pipeline.contracts import McqAnswer, NormalizedOption, NormalizedQuestion
from prepora_pipeline.core.db import get_db_connection

from .publish import PublishError, publish_question

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — publishing needs a database."
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
            cur.execute(
                "DELETE FROM questions WHERE stable_content_id LIKE %s",
                (f"{exam_slug.upper()}-%",),
            )
            cur.execute(
                "DELETE FROM question_sets WHERE exam_variant_id IN "
                "(SELECT id FROM exam_variants WHERE exam_id = %s)",
                (exam_id,),
            )
            cur.execute("DELETE FROM exam_variants WHERE exam_id = %s", (exam_id,))
            cur.execute("DELETE FROM exams WHERE id = %s", (exam_id,))
            cur.execute("DELETE FROM exam_types WHERE id = %s", (type_id,))
            cur.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
            conn.commit()
    finally:
        conn.close()


@pytest.fixture
def test_subject():
    unique = uuid.uuid4().hex[:10]
    subject_slug = f"test-subject-{unique}"
    yield subject_slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Fixture teardown is LIFO, so test_exam's cleanup (which deletes question_sets and
            # questions) hasn't run yet when this runs — question_sets/questions referencing this
            # subject must be cleared here first, or the FK constraints below block the deletes.
            cur.execute(
                "DELETE FROM question_sets WHERE subject_id IN "
                "(SELECT id FROM subjects WHERE slug = %s)",
                (subject_slug,),
            )
            cur.execute(
                "DELETE FROM questions WHERE topic_id IN "
                "(SELECT id FROM topics WHERE subject_id IN "
                "(SELECT id FROM subjects WHERE slug = %s))",
                (subject_slug,),
            )
            cur.execute(
                "DELETE FROM topics WHERE subject_id IN (SELECT id FROM subjects WHERE slug = %s)",
                (subject_slug,),
            )
            cur.execute("DELETE FROM subjects WHERE slug = %s", (subject_slug,))
            conn.commit()
    finally:
        conn.close()


def _normalized(test_exam, test_subject, *, question_text, year=2025, number=1, topic_slug=None):
    return NormalizedQuestion(
        exam_slug=test_exam,
        exam_variant_slug="standard",
        subject_slug=test_subject,
        year=year,
        number=number,
        question_text=question_text,
        question_type="mcq",
        options=[
            NormalizedOption(key="A", text="first option"),
            NormalizedOption(key="B", text="second option"),
        ],
        answer=McqAnswer(correct_key="B"),
        topic_slug=topic_slug,
        parser_version="test-v1",
    )


def _row(query, params):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()
    finally:
        conn.close()


class TestBasicPublish:
    def test_publishing_the_same_content_twice_produces_one_question_and_one_occurrence(
        self, test_exam, test_subject
    ):
        normalized = _normalized(
            test_exam, test_subject, question_text=f"Unique question {uuid.uuid4()}"
        )

        first = publish_question(normalized)
        second = publish_question(normalized)

        assert first.question_id == second.question_id
        assert first.question_created is True
        assert second.question_created is False
        assert second.occurrence_created is False  # already existed from the first call

        count = _row(
            "SELECT count(*) FROM question_occurrences WHERE question_id = %s",
            (first.question_id,),
        )[0]
        assert count == 1

    def test_answer_is_resolved_by_option_key_not_text_equality(self, test_exam, test_subject):
        # Two options with identical text, differentiated only by key — a text-equality match
        # (the old TS bug) could not possibly get this right.
        normalized = NormalizedQuestion(
            exam_slug=test_exam,
            exam_variant_slug="standard",
            subject_slug=test_subject,
            year=2025,
            number=1,
            question_text=f"Ambiguous options question {uuid.uuid4()}",
            question_type="mcq",
            options=[
                NormalizedOption(key="A", text="same text"),
                NormalizedOption(key="B", text="same text"),
            ],
            answer=McqAnswer(correct_key="B"),
            parser_version="test-v1",
        )

        result = publish_question(normalized)

        row = _row(
            "SELECT qo.option_key FROM question_answers qa "
            "JOIN question_options qo ON qo.id = qa.correct_option_id "
            "WHERE qa.question_id = %s",
            (result.question_id,),
        )
        assert row[0] == "B"

    def test_rejects_a_question_flagged_needs_review(self, test_exam, test_subject):
        normalized = _normalized(test_exam, test_subject, question_text="Ambiguous question")
        normalized.needs_review = True
        normalized.review_note = "answer was ambiguous"

        with pytest.raises(PublishError, match="needs_review"):
            publish_question(normalized)

    def test_rejects_an_unregistered_exam(self, test_subject):
        normalized = _normalized(
            "totally-unregistered-exam", test_subject, question_text="Some question"
        )

        with pytest.raises(PublishError, match="not registered"):
            publish_question(normalized)


class TestOccurrenceAcrossYears:
    def test_the_same_question_in_two_exam_years_produces_one_question_and_two_occurrences(
        self, test_exam, test_subject
    ):
        text = f"Recurring question {uuid.uuid4()}"
        result_2024 = publish_question(
            _normalized(test_exam, test_subject, question_text=text, year=2024, number=1)
        )
        result_2025 = publish_question(
            _normalized(test_exam, test_subject, question_text=text, year=2025, number=1)
        )

        # Different stable_content_id (year is embedded in it) but the same canonical question,
        # reused via the exact-match content_hash check.
        assert result_2024.stable_content_id != result_2025.stable_content_id
        assert result_2024.question_id == result_2025.question_id

        count = _row(
            "SELECT count(*) FROM question_occurrences WHERE question_id = %s",
            (result_2024.question_id,),
        )[0]
        assert count == 2

        set_count = _row(
            "SELECT count(DISTINCT question_set_id) FROM question_occurrences "
            "WHERE question_id = %s",
            (result_2024.question_id,),
        )[0]
        assert set_count == 2  # two distinct question sets, one per year


class TestCatalogConnectivity:
    def test_every_published_question_resolves_to_a_topic_and_is_reachable_from_its_exam(
        self, test_exam, test_subject
    ):
        normalized = _normalized(
            test_exam,
            test_subject,
            question_text=f"Topic-linked question {uuid.uuid4()}",
            topic_slug=f"test-topic-{uuid.uuid4().hex[:8]}",
        )

        result = publish_question(normalized)

        # Follow the full FK chain a real page load would: question -> topic -> subject, and
        # question -> occurrence -> question_set -> exam_variant -> exam. Nothing here should be
        # NULL or unresolvable — that's exactly what "floats disconnected" (this item's own "why
        # it matters") means to fix.
        row = _row(
            "SELECT q.topic_id, t.subject_id, s.slug AS subject_slug, "
            "qs.exam_variant_id, ev.exam_id, e.slug AS exam_slug "
            "FROM questions q "
            "JOIN topics t ON t.id = q.topic_id "
            "JOIN subjects s ON s.id = t.subject_id "
            "JOIN question_occurrences qo ON qo.question_id = q.id "
            "JOIN question_sets qs ON qs.id = qo.question_set_id "
            "JOIN exam_variants ev ON ev.id = qs.exam_variant_id "
            "JOIN exams e ON e.id = ev.exam_id "
            "WHERE q.id = %s",
            (result.question_id,),
        )

        assert row is not None
        topic_id, subject_id, subject_slug, exam_variant_id, exam_id, exam_slug = row
        assert all([topic_id, subject_id, exam_variant_id, exam_id])
        assert subject_slug == test_subject
        assert exam_slug == test_exam


class TestFullRunIdempotency:
    def test_a_full_publish_run_then_rerun_is_a_no_op(self, test_exam, test_subject):
        questions = [
            _normalized(test_exam, test_subject, question_text=f"Q{i} {uuid.uuid4()}", number=i)
            for i in range(1, 4)
        ]

        first_results = [publish_question(q) for q in questions]
        second_results = [publish_question(q) for q in questions]

        assert [r.question_id for r in first_results] == [r.question_id for r in second_results]
        assert all(r.question_created for r in first_results)
        assert not any(r.question_created for r in second_results)
        assert not any(r.occurrence_created for r in second_results)

        total_questions = _row(
            "SELECT count(*) FROM questions WHERE stable_content_id LIKE %s",
            (f"{test_exam.upper()}-%",),
        )[0]
        assert total_questions == 3
