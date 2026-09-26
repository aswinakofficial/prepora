"""
Tests for deduplication — docs/roadmap/engineering-roadmap.md item 20.

Requires DATABASE_URL (see test_conformance.py's docstring). Every test creates its own
organization/exam_type/exam/subject with a unique slug and tears the whole tree down afterward.
"""
import os
import time
import uuid

import psycopg2.extras
import pytest

from prepora_pipeline.contracts import McqAnswer, NormalizedOption, NormalizedQuestion
from prepora_pipeline.core.db import get_db_connection

from .content_hash import content_hash
from .dedupe import check_duplicate, levenshtein, similarity
from .publish import HeldResult, PublishError, publish_question

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — dedupe needs a database."
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


def _normalized(test_exam, test_subject, *, question_text, number, year=2025):
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
        parser_version="test-v1",
    )


class TestLevenshteinAndSimilarity:
    def test_levenshtein_is_zero_for_identical_strings(self):
        assert levenshtein("hello", "hello") == 0

    def test_levenshtein_matches_a_known_value(self):
        assert levenshtein("kitten", "sitting") == 3

    def test_similarity_is_one_for_identical_strings(self):
        assert similarity("hello world", "hello world") == 1

    def test_similarity_is_one_for_two_empty_strings(self):
        assert similarity("", "") == 1

    def test_similarity_decreases_as_strings_diverge(self):
        close = similarity("strength of materials", "strength of material")
        far = similarity("strength of materials", "database management systems")
        assert close > far


class TestExactDuplicateWithinTheSamePaper:
    def test_byte_identical_questions_in_the_same_paper_is_an_exact_duplicate(
        self, test_exam, test_subject
    ):
        text = f"Byte-identical question {uuid.uuid4()}"
        first = publish_question(_normalized(test_exam, test_subject, question_text=text, number=1))
        assert first.dedupe_outcome == "unique"

        decision = check_duplicate(
            _normalized(test_exam, test_subject, question_text=text, number=2)
        )
        assert decision.outcome == "exact_duplicate_in_set"
        assert decision.existing_question_id == first.question_id
        assert decision.existing_question_set_id == first.question_set_id

    def test_publishing_the_in_paper_repeat_is_a_no_op_not_a_second_occurrence(
        self, test_exam, test_subject
    ):
        text = f"Repeated within one paper {uuid.uuid4()}"
        first = publish_question(_normalized(test_exam, test_subject, question_text=text, number=1))
        second = publish_question(
            _normalized(test_exam, test_subject, question_text=text, number=2)
        )

        assert second.question_id == first.question_id
        assert second.dedupe_outcome == "exact_duplicate_in_set"
        assert second.occurrence_created is False

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM question_occurrences WHERE question_id = %s",
                    (first.question_id,),
                )
                assert cur.fetchone()[0] == 1
        finally:
            conn.close()


class TestExactDuplicateAcrossExamsOrYears:
    def test_the_same_question_in_2023_and_2024_is_one_canonical_two_occurrences(
        self, test_exam, test_subject
    ):
        text = f"Recurring across years {uuid.uuid4()}"
        result_2023 = publish_question(
            _normalized(test_exam, test_subject, question_text=text, number=1, year=2023)
        )
        assert result_2023.dedupe_outcome == "unique"

        decision = check_duplicate(
            _normalized(test_exam, test_subject, question_text=text, number=1, year=2024)
        )
        assert decision.outcome == "exact_duplicate_cross_set"
        assert decision.existing_question_id == result_2023.question_id

        result_2024 = publish_question(
            _normalized(test_exam, test_subject, question_text=text, number=1, year=2024)
        )
        assert result_2024.question_id == result_2023.question_id
        assert result_2024.dedupe_outcome == "exact_duplicate_cross_set"
        assert result_2024.occurrence_created is True

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM question_occurrences WHERE question_id = %s",
                    (result_2023.question_id,),
                )
                assert cur.fetchone()[0] == 2
        finally:
            conn.close()


class TestNearDuplicatesAreNeverAutoMerged:
    def test_near_duplicates_at_0_92_are_flagged_not_merged(self, test_exam, test_subject):
        # A single-character change deep inside an otherwise-identical, fairly long string — high
        # similarity (~0.98) without normalizing away to byte-identical the way a trailing
        # punctuation-only difference would (see duplicates.test.ts's own note on that boundary).
        marker = uuid.uuid4().hex[:8]
        original_text = f"What is the modulus of elasticity of mild steel grade {marker}A"
        publish_question(
            _normalized(test_exam, test_subject, question_text=original_text, number=1)
        )

        near_text = f"What is the modulus of elasticity of mild steel grade {marker}B"
        score = similarity(original_text.lower(), near_text.lower())
        assert 0.9 <= score < 1, f"test fixture text isn't actually near-duplicate range: {score}"

        decision = check_duplicate(
            _normalized(test_exam, test_subject, question_text=near_text, number=2)
        )
        assert decision.outcome == "near_duplicate"
        assert decision.similarity_score is not None
        assert 0.9 <= decision.similarity_score < 1

        with pytest.raises(PublishError, match="flagged for human review"):
            publish_question(
                _normalized(test_exam, test_subject, question_text=near_text, number=2)
            )

    def test_a_genuinely_different_question_in_the_same_subject_is_unique(
        self, test_exam, test_subject
    ):
        publish_question(
            _normalized(
                test_exam, test_subject, question_text=f"Question A {uuid.uuid4()}", number=1
            )
        )
        decision = check_duplicate(
            _normalized(
                test_exam,
                test_subject,
                question_text=f"An entirely unrelated question about something else {uuid.uuid4()}",
                number=2,
            )
        )
        assert decision.outcome == "unique"


class TestNeverMergesSilently:
    def test_check_duplicate_has_no_side_effects(self, test_exam, test_subject):
        # Mirrors duplicates.test.ts's "never merges — only reports candidates for human review":
        # calling check_duplicate must never write anything, and must be idempotent.
        text = f"Side-effect-free check {uuid.uuid4()}"
        normalized = _normalized(test_exam, test_subject, question_text=text, number=1)

        before = check_duplicate(normalized)
        after = check_duplicate(normalized)
        assert before == after
        assert before.outcome == "unique"


class TestPerformanceAgainstALargeCorpus:
    """
    docs/roadmap/engineering-roadmap.md item 20's own performance test: dedupe against a
    50,000-question corpus completes within a documented bound. Seeds the corpus directly via bulk
    SQL (not publish_question, which would take far too many round trips) spread across 25
    subjects so the target subject's own bucket is ~2,000 rows — proving the subject-scoped query
    doesn't pay for the other 48,000.
    """

    NUM_SUBJECTS = 25
    QUESTIONS_PER_SUBJECT = 2000
    TOTAL_CORPUS_SIZE = NUM_SUBJECTS * QUESTIONS_PER_SUBJECT

    @pytest.fixture
    def large_corpus(self, test_exam):
        conn = get_db_connection()
        run_id = uuid.uuid4().hex[:8]
        subject_ids = []
        question_set_ids = []
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO exam_variants (exam_id, name, slug) VALUES (%s, %s, %s) "
                    "RETURNING id",
                    (
                        self._exam_id(cur, test_exam),
                        "Perf Variant",
                        "perf-variant",
                    ),
                )
                variant_id = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO exam_sessions (exam_variant_id, label, year) "
                    "VALUES (%s, %s, %s) RETURNING id",
                    (variant_id, "2025", 2025),
                )
                session_id = cur.fetchone()[0]

                subjects_rows = [
                    (str(uuid.uuid4()), f"Perf Subject {run_id}-{i}", f"perf-subject-{run_id}-{i}")
                    for i in range(self.NUM_SUBJECTS)
                ]
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO subjects (id, name, slug) VALUES %s",
                    subjects_rows,
                )
                subject_ids = [row[0] for row in subjects_rows]

                question_set_rows = [
                    (
                        str(uuid.uuid4()),
                        variant_id,
                        session_id,
                        subject_ids[i],
                        f"Perf Set {run_id}-{i}",
                        f"perf-set-{run_id}-{i}",
                        "published",
                    )
                    for i in range(self.NUM_SUBJECTS)
                ]
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO question_sets "
                    "(id, exam_variant_id, exam_session_id, subject_id, title, slug, "
                    "publication_status) VALUES %s",
                    question_set_rows,
                )
                question_set_ids = [row[0] for row in question_set_rows]

                for subject_index in range(self.NUM_SUBJECTS):
                    question_rows = []
                    for q_index in range(self.QUESTIONS_PER_SUBJECT):
                        text = (
                            f"Perf corpus question {run_id} subject {subject_index} "
                            f"number {q_index}"
                        )
                        question_rows.append(
                            (
                                str(uuid.uuid4()),
                                f"{run_id}-{subject_index}-{q_index}",
                                content_hash(text),
                                text,
                                "published",
                            )
                        )
                    psycopg2.extras.execute_values(
                        cur,
                        "INSERT INTO questions (id, slug, content_hash, question_text, status) "
                        "VALUES %s",
                        question_rows,
                    )
                    occurrence_rows = [
                        (row[0], question_set_ids[subject_index], i)
                        for i, row in enumerate(question_rows)
                    ]
                    psycopg2.extras.execute_values(
                        cur,
                        "INSERT INTO question_occurrences "
                        "(question_id, question_set_id, original_question_number) VALUES %s",
                        occurrence_rows,
                    )
                conn.commit()
        finally:
            conn.close()

        # A bulk load of 50,000 fresh rows in one go leaves the planner with stale statistics
        # until autovacuum's autoanalyze gets around to it — which, immediately after a burst
        # insert like this, it usually hasn't. Without this, the planner can pick a sequential
        # scan instead of question_sets_subject_id_idx, which is the exact thing this test exists
        # to catch, not something it should itself be defeated by.
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("ANALYZE questions, question_occurrences, question_sets")
            conn.commit()
        finally:
            conn.close()

        yield {
            "run_id": run_id,
            "target_subject_slug": f"perf-subject-{run_id}-0",
        }

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM question_occurrences WHERE question_set_id = ANY(%s)",
                    (question_set_ids,),
                )
                cur.execute(
                    "DELETE FROM questions WHERE slug LIKE %s", (f"{run_id}-%",)
                )
                cur.execute(
                    "DELETE FROM question_sets WHERE id = ANY(%s)", (question_set_ids,)
                )
                cur.execute("DELETE FROM subjects WHERE id = ANY(%s)", (subject_ids,))
                cur.execute(
                    "DELETE FROM exam_sessions WHERE exam_variant_id = %s", (variant_id,)
                )
                cur.execute("DELETE FROM exam_variants WHERE id = %s", (variant_id,))
                conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _exam_id(cur, exam_slug):
        cur.execute("SELECT id FROM exams WHERE slug = %s", (exam_slug,))
        return cur.fetchone()[0]

    def test_dedupe_against_a_50000_question_corpus_completes_within_a_documented_bound(
        self, large_corpus
    ):
        candidate = NormalizedQuestion(
            exam_slug="unregistered-perf-exam",
            exam_variant_slug="standard",
            subject_slug=large_corpus["target_subject_slug"],
            number=1,
            question_text="A brand new question never seen in the corpus before, unique text.",
            question_type="mcq",
            options=[NormalizedOption(key="A", text="x"), NormalizedOption(key="B", text="y")],
            answer=McqAnswer(correct_key="A"),
            parser_version="test-v1",
        )

        started = time.monotonic()
        decision = check_duplicate(candidate)
        elapsed = time.monotonic() - started
        print(f"\ndedupe check against a {self.TOTAL_CORPUS_SIZE}-question corpus: {elapsed:.3f}s")

        assert decision.outcome == "unique"
        # Documented bound: a subject-scoped dedupe check against a corpus of
        # NUM_SUBJECTS * QUESTIONS_PER_SUBJECT = 50,000 questions completes in under 10 seconds —
        # generous enough to absorb a remote Postgres connection's own latency variance (three
        # sequential round trips per check_duplicate() call), while still being one to two orders
        # of magnitude below what a naive O(n) full-corpus scan with per-pair Levenshtein would
        # cost, which is the thing the subject-scoped query and question_sets_subject_id_idx exist
        # to avoid — the query only ever touches the ~2,000-row bucket for one subject, not the
        # other 48,000 rows in the other 24 subjects.
        assert elapsed < 10.0, f"dedupe check against a 50k corpus took {elapsed:.2f}s"


def _with_options(question, options, answer_key):
    return question.model_copy(
        update={
            "options": [NormalizedOption(key=k, text=t) for k, t in options],
            "answer": McqAnswer(correct_key=answer_key),
        }
    )


GITHUB_OPTIONS = [("A", "JavaScript and Docker"), ("B", "Workflows and runners"), ("C", "Both")]


class TestPossibleDuplicatesAreHeldForADecision:
    """A near duplicate becomes a decision for a person (on_near_duplicate="hold"), with a
    suggestion — then that decision either links it to the existing question or publishes it."""

    def _publish_original(self, test_exam, test_subject, text):
        return publish_question(
            _with_options(
                _normalized(test_exam, test_subject, question_text=text, number=1),
                GITHUB_OPTIONS,
                "A",
            )
        )

    def test_hold_returns_the_match_and_writes_nothing(self, test_exam, test_subject):
        marker = uuid.uuid4().hex[:8]
        original = self._publish_original(
            test_exam, test_subject, f"What's the best reason to upgrade plan {marker}?"
        )
        reworded = _with_options(
            _normalized(
                test_exam,
                test_subject,
                question_text=f"What is the best reason to upgrade plan {marker}?",
                number=2,
                year=2026,
            ),
            GITHUB_OPTIONS,
            "A",
        )

        held = publish_question(reworded, on_near_duplicate="hold")

        assert isinstance(held, HeldResult)
        decision = held.decision
        assert decision.outcome == "near_duplicate"
        assert decision.existing_question_id == original.question_id
        assert decision.existing_question_text.startswith("What's the best reason")
        # Same options, same answer, no number changed → most likely the same question, reworded.
        assert (decision.options_match, decision.answer_match) == (True, True)
        assert decision.suggestion == "same"
        assert _count("SELECT count(*) FROM questions WHERE question_text = %s",
                      (reworded.question_text,)) == 0

    def test_a_changed_number_suggests_a_different_question(self, test_exam, test_subject):
        # Seen for real: "What are the two types of GitHub Actions?" vs "…three types…" scored 90%
        # similar, but they are different questions with different answers.
        marker = uuid.uuid4().hex[:6]
        self._publish_original(
            test_exam, test_subject, f"What are the two types of GitHub Actions {marker}?"
        )
        three = _with_options(
            _normalized(
                test_exam,
                test_subject,
                question_text=f"What are the three types of GitHub Actions {marker}?",
                number=2,
                year=2026,
            ),
            GITHUB_OPTIONS,
            "A",
        )
        decision = publish_question(three, on_near_duplicate="hold").decision
        assert decision.suggestion == "different"

    def test_a_different_correct_answer_suggests_a_different_question(
        self, test_exam, test_subject
    ):
        marker = uuid.uuid4().hex[:8]
        self._publish_original(
            test_exam, test_subject, f"Which feature should you enable for team {marker}?"
        )
        other_answer = _with_options(
            _normalized(
                test_exam,
                test_subject,
                question_text=f"Which feature should you enable for teams {marker}?",
                number=2,
                year=2026,
            ),
            GITHUB_OPTIONS,
            "B",
        )
        decision = publish_question(other_answer, on_near_duplicate="hold").decision
        assert (decision.options_match, decision.answer_match) == (True, False)
        assert decision.suggestion == "different"

    def test_same_question_links_and_remembers_the_wording(self, test_exam, test_subject):
        marker = uuid.uuid4().hex[:8]
        original = self._publish_original(
            test_exam,
            test_subject,
            f"What's the appropriate repository permission role for pushers {marker}?",
        )
        reworded_text = f"What's the appropriate repository permission level for pushers {marker}?"
        reworded = _with_options(
            _normalized(
                test_exam, test_subject, question_text=reworded_text, number=2, year=2026
            ),
            GITHUB_OPTIONS,
            "A",
        )

        linked = publish_question(reworded, link_to_question_id=original.question_id)

        # No new question: the existing one now also appears in the 2026 set, under its own wording.
        assert linked.question_id == original.question_id
        assert linked.question_created is False
        assert linked.occurrence_created is True
        assert linked.question_set_id != original.question_set_id
        assert _count("SELECT count(*) FROM question_variants WHERE question_id = %s",
                      (original.question_id,)) == 1

        # The decision is made once: the same rewording collected again (a 2027 paper) is now an
        # exact match and links on its own — no hold, no review.
        again = publish_question(
            _with_options(
                _normalized(
                    test_exam, test_subject, question_text=reworded_text, number=3, year=2027
                ),
                GITHUB_OPTIONS,
                "A",
            ),
            on_near_duplicate="hold",
        )
        assert not isinstance(again, HeldResult)
        assert again.question_id == original.question_id
        assert again.occurrence_created is True

    def test_different_question_publishes_as_new(self, test_exam, test_subject):
        marker = uuid.uuid4().hex[:6]
        original = self._publish_original(
            test_exam, test_subject, f"What are the two types of GitHub Actions {marker}?"
        )
        three = _with_options(
            _normalized(
                test_exam,
                test_subject,
                question_text=f"What are the three types of GitHub Actions {marker}?",
                number=2,
                year=2026,
            ),
            GITHUB_OPTIONS,
            "C",
        )
        with pytest.raises(PublishError, match="flagged for human review"):
            publish_question(three)  # the default is still to refuse

        published = publish_question(three, publish_as_new=True)
        assert published.question_created is True
        assert published.question_id != original.question_id

    def test_linking_to_a_deleted_question_fails_clearly(self, test_exam, test_subject):
        question = _normalized(
            test_exam, test_subject, question_text=f"Orphan {uuid.uuid4().hex}?", number=1
        )
        with pytest.raises(PublishError, match="no longer exists"):
            publish_question(question, link_to_question_id=str(uuid.uuid4()))


def _count(query, params):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()[0]
    finally:
        conn.close()
