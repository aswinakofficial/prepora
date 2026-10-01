"""
Tests for the shared duplicate-detection layer's phase-2 behaviour (docs/architecture/dedupe.md):
option- and answer-aware matching, whole-corpus near-duplicate search, remembered skip decisions,
the publish race guard and batch planning. Needs DATABASE_URL, like stages/test_dedupe.py, whose
fixtures it reuses.
"""
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from psycopg2.extras import Json

from prepora_pipeline.contracts import McqAnswer, NormalizedOption
from prepora_pipeline.core.db import get_db_connection
from prepora_pipeline.dedupe import check_duplicate, plan_batch
from prepora_pipeline.stages.publish import (
    HeldResult,
    PublishError,
    SkippedResult,
    publish_question,
)
from prepora_pipeline.stages.test_dedupe import _normalized

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL is not set — dedupe needs a database."
)

PORTALS = [("A", "Microsoft 365 admin center"), ("B", "Microsoft Entra admin center")]


def _question(test_exam, test_subject, text, *, number=1, options=PORTALS, answer="A", **extra):
    base = _normalized(test_exam, test_subject, question_text=text, number=number)
    return base.model_copy(
        update={
            "options": [NormalizedOption(key=k, text=t) for k, t in options],
            "answer": McqAnswer(correct_key=answer),
            **extra,
        }
    )


def _rows(query, params):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()


class TestSameWordingDifferentAnswer:
    """Identical wording is only the same question when the options and answer match too."""

    def test_a_different_answer_is_held_not_folded_into_the_published_question(
        self, test_exam, test_subject
    ):
        text = f"Which portal should you use to create group {uuid.uuid4().hex[:8]}?"
        original = publish_question(_question(test_exam, test_subject, text, answer="A"))
        changed = _question(test_exam, test_subject, text, number=2, answer="B")

        decision = check_duplicate(changed)
        assert decision.outcome == "conflicting_duplicate"
        assert decision.existing_question_id == original.question_id
        assert decision.options_match is True and decision.answer_match is False
        assert decision.suggestion == "different"

        held = publish_question(changed, on_near_duplicate="hold")
        assert isinstance(held, HeldResult)
        with pytest.raises(PublishError, match="deduplication gate"):
            publish_question(changed)

    def test_publishing_it_as_new_keeps_both_and_each_is_recognised_again(
        self, test_exam, test_subject
    ):
        text = f"Which portal should you use for tenant {uuid.uuid4().hex[:8]}?"
        a = _question(test_exam, test_subject, text, answer="A", identity="content")
        b = _question(test_exam, test_subject, text, number=2, answer="B", identity="content")
        first = publish_question(a)
        second = publish_question(b, publish_as_new=True)

        assert second.question_created is True
        assert second.question_id != first.question_id
        assert second.stable_content_id != first.stable_content_id
        # From now on each version is simply "already published" — no decision asked again.
        assert check_duplicate(a).existing_question_id == first.question_id
        assert check_duplicate(b).existing_question_id == second.question_id
        assert publish_question(b).question_id == second.question_id

    def test_keeping_the_new_version_applies_its_answer(self, test_exam, test_subject):
        text = f"Which portal should you use for users {uuid.uuid4().hex[:8]}?"
        original = publish_question(_question(test_exam, test_subject, text, answer="A"))
        corrected = _question(test_exam, test_subject, text, number=2, answer="B")
        publish_question(
            corrected, link_to_question_id=original.question_id, use_new_wording=True
        )
        # The published question now has the corrected answer, so it's simply the same question.
        decision = check_duplicate(corrected)
        assert decision.outcome.startswith("exact_duplicate")
        assert decision.existing_question_id == original.question_id

    def test_reordered_options_are_still_the_same_question(self, test_exam, test_subject):
        text = f"Which portal manages licences {uuid.uuid4().hex[:8]}?"
        original = publish_question(_question(test_exam, test_subject, text, answer="A"))
        # The same two options listed the other way round — B is now the original answer.
        swapped = [("A", PORTALS[1][1]), ("B", PORTALS[0][1])]
        reordered = _question(test_exam, test_subject, text, number=2, options=swapped, answer="B")
        assert check_duplicate(reordered).outcome.startswith("exact_duplicate")
        assert publish_question(reordered).question_id == original.question_id


class TestWholeCorpusSearch:
    def test_a_near_duplicate_under_another_subject_is_found(self, test_exam, test_subject):
        marker = uuid.uuid4().hex[:8]
        publish_question(
            _question(
                test_exam,
                test_subject,
                f"You need to ensure that User1 can invite external users {marker}. "
                "Which role should you assign?",
            )
        )
        other_subject = _question(
            test_exam,
            test_subject,
            f"You need to ensure that User1 can invite the external users {marker}. "
            "Which role should you assign?",
            subject_slug=f"{test_subject}-other",
            number=2,
        )
        try:
            assert check_duplicate(other_subject).outcome == "near_duplicate"
        finally:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM subjects WHERE slug = %s", (f"{test_subject}-other",))
                conn.commit()
            finally:
                conn.close()


@pytest.fixture
def review_batch():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO scraped_questions (source_url) VALUES (%s) RETURNING id",
                (f"https://example.com/dedupe-test-{uuid.uuid4().hex[:8]}",),
            )
            batch_id = cur.fetchone()[0]
        conn.commit()
    finally:
        conn.close()
    yield batch_id
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM scraped_questions WHERE id = %s", (batch_id,))
        conn.commit()
    finally:
        conn.close()


def _record_decision(batch_id, candidate, existing_id, status):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO duplicate_reviews (scraped_question_id, question_number, candidate, "
                "existing_question_id, similarity, options_match, answer_match, suggestion, "
                "status, decided_at) VALUES (%s, 1, %s, %s, 0.95, true, true, 'same', %s, now())",
                (batch_id, Json(json.loads(candidate.model_dump_json())), existing_id, status),
            )
        conn.commit()
    finally:
        conn.close()


class TestDecisionsAreRemembered:
    def test_a_skipped_question_is_not_held_again(self, test_exam, test_subject, review_batch):
        marker = uuid.uuid4().hex[:8]
        original = publish_question(
            _question(test_exam, test_subject, f"Which admin center creates group {marker}?")
        )
        reworded = _question(
            test_exam, test_subject, f"Which admin centre creates group {marker}?", number=2
        )
        assert check_duplicate(reworded).outcome == "near_duplicate"
        _record_decision(review_batch, reworded, original.question_id, "skipped")

        assert check_duplicate(reworded).outcome == "previously_skipped"
        assert isinstance(publish_question(reworded, on_near_duplicate="hold"), SkippedResult)
        # The decision covered that exact question: a different answer is asked about again.
        assert check_duplicate(reworded.model_copy(update={"answer": McqAnswer(correct_key="B")}))\
            .outcome == "near_duplicate"

    def test_a_same_wording_question_kept_as_the_published_one_links_from_then_on(
        self, test_exam, test_subject, review_batch
    ):
        text = f"Which portal should you use for group {uuid.uuid4().hex[:8]}?"
        original = publish_question(_question(test_exam, test_subject, text, answer="A"))
        changed = _question(test_exam, test_subject, text, number=2, answer="B")
        _record_decision(review_batch, changed, original.question_id, "same")

        decision = check_duplicate(changed)
        assert decision.outcome.startswith("exact_duplicate")
        assert decision.existing_question_id == original.question_id


class TestPositionIdentity:
    def test_a_different_question_under_a_taken_number_fails_instead_of_vanishing(
        self, test_exam, test_subject
    ):
        publish_question(_question(test_exam, test_subject, f"First {uuid.uuid4().hex}", number=7))
        other = _question(test_exam, test_subject, f"Unrelated {uuid.uuid4().hex}", number=7)
        with pytest.raises(PublishError, match="already published as a different question"):
            publish_question(other)


class TestConcurrentPublishing:
    def test_the_same_new_question_published_at_once_is_created_once(
        self, test_exam, test_subject
    ):
        text = f"Which feature enforces MFA for {uuid.uuid4().hex[:8]}?"
        # Different numbers: without the lock each would create its own question.
        copies = [_question(test_exam, test_subject, text, number=n) for n in range(1, 5)]
        # Creates the shared exam/set rows first, as a batch's first question does.
        publish_question(
            _question(test_exam, test_subject, f"warm-up {uuid.uuid4().hex}", number=99)
        )
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(publish_question, copies))
        assert len({r.question_id for r in results}) == 1
        assert sum(r.question_created for r in results) == 1
        assert _rows("SELECT count(*) FROM questions WHERE question_text = %s", (text,))[0][0] == 1


def test_plan_batch_puts_repeats_after_what_they_repeat(test_exam, test_subject):
    q = lambda text: _question(test_exam, test_subject, text)  # noqa: E731
    batch = [
        q("Which service ingests streaming data from devices at scale?"),
        q("Which tool manages Java packages?"),
        q("Which service ingests streaming data from devices at scale?"),  # repeat of 0
        q("Which service ingests streaming data from the devices at scale?"),  # near 0 and 2
        q("What is vertical scaling?"),
    ]
    assert plan_batch(batch) == [[0, 1, 4], [2], [3]]
    assert plan_batch(batch[:2]) == [[0, 1]]
    assert plan_batch([]) == []


class TestAudit:
    def test_each_kind_of_finding_is_reported(self, test_exam, test_subject):
        from prepora_pipeline.dedupe.audit import run_audit

        marker = uuid.uuid4().hex[:8]
        text = f"Which portal audits sign-ins for {marker}?"
        a = publish_question(_question(test_exam, test_subject, text, answer="A"))
        b = publish_question(
            _question(test_exam, test_subject, text, number=2, answer="B"), publish_as_new=True
        )
        near_text = f"Which portal audits the sign-ins for {marker}?"
        near = publish_question(
            _question(test_exam, test_subject, near_text, number=3), publish_as_new=True
        )
        # A true duplicate can't be published any more, so plant one the way old code could have.
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO questions (stable_content_id, content_hash, slug, question_text, "
                    "question_type, status) SELECT stable_content_id || '-COPY', content_hash, "
                    "slug || '-copy', question_text, question_type, status FROM questions "
                    "WHERE id = %s RETURNING id",
                    (a.question_id,),
                )
                copy_id = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO question_options (question_id, option_key, option_text, sequence) "
                    "SELECT %s, option_key, option_text, sequence FROM question_options "
                    "WHERE question_id = %s",
                    (copy_id, a.question_id),
                )
                cur.execute(
                    "INSERT INTO question_answers (question_id, correct_option_id) "
                    "SELECT %s, o2.id FROM question_answers qa "
                    "JOIN question_options o1 ON o1.id = qa.correct_option_id "
                    "JOIN question_options o2 "
                    "ON o2.question_id = %s AND o2.option_key = o1.option_key "
                    "WHERE qa.question_id = %s",
                    (copy_id, copy_id, a.question_id),
                )
            conn.commit()
        finally:
            conn.close()

        report = run_audit(min_similarity=0.85)
        exact = [{q.id for q in group} for group in report.exact]
        same_wording = [{q.id for q in group} for group in report.same_wording]
        similar = [{p.a.id, p.b.id} for p in report.similar]
        assert {a.question_id, copy_id} in exact
        assert any({a.question_id, b.question_id} <= group or {copy_id, b.question_id} <= group
                   for group in same_wording)
        assert any(near.question_id in pair for pair in similar)
