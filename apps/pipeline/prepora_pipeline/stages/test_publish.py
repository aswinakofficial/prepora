"""
Tests for idempotent, occurrence-aware publishing — docs/roadmap/engineering-roadmap.md item 18.

Requires DATABASE_URL (see test_conformance.py's docstring). Every test creates its own
organization/exam_type/exam with a unique slug and tears the whole tree down afterward, in FK
dependency order.
"""
import os
import uuid

import pytest

from prepora_pipeline.contracts import (
    McqAnswer,
    NormalizedOption,
    NormalizedQuestion,
    NumericalAnswer,
)
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

        with pytest.raises(PublishError, match="NEEDS_REVIEW"):
            publish_question(normalized)

    def test_rejects_an_unregistered_exam(self, test_subject):
        normalized = _normalized(
            "totally-unregistered-exam", test_subject, question_text="Some question"
        )

        with pytest.raises(PublishError, match="not registered"):
            publish_question(normalized)

    def test_rejects_content_the_quality_gate_would_reject_docs_roadmap_item_19(
        self, test_exam, test_subject
    ):
        # docs/roadmap/engineering-roadmap.md item 19's "Done when": no content publishes without
        # passing the gate. Duplicate option keys were never checked by publish_question() itself
        # before validate_question() was wired in — this would previously have published cleanly.
        normalized = _normalized(test_exam, test_subject, question_text="Duplicated option keys")
        normalized.options = [
            NormalizedOption(key="A", text="first"),
            NormalizedOption(key="A", text="duplicate key"),
        ]

        with pytest.raises(PublishError, match="DUPLICATE_OPTION_KEYS"):
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


def test_concurrent_first_publishes_share_one_set_session_and_subject(test_exam, test_subject):
    # Regression: review-batch approval publishes many questions at once. Every one of them
    # needs the same not-yet-existing question set / session / subject, and a plain
    # "SELECT, then INSERT" let concurrent requests race — the losers failed with a
    # UniqueViolation (or, for sessions, silently created duplicates).
    import random
    import string
    from concurrent.futures import ThreadPoolExecutor

    def text(n):
        words = [
            "".join(random.choices(string.ascii_lowercase, k=random.randint(4, 9)))
            for _ in range(25)
        ]
        return f"Concurrent question {n}: {' '.join(words)}?"

    questions = [
        _normalized(test_exam, test_subject, question_text=text(n), number=n) for n in range(1, 13)
    ]
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(publish_question, questions))

    assert len({r.question_set_id for r in results}) == 1
    assert all(r.question_created for r in results)
    assert _row(
        "SELECT COUNT(*) FROM exam_sessions es JOIN exam_variants ev ON ev.id = es.exam_variant_id "
        "JOIN exams e ON e.id = ev.exam_id WHERE e.slug = %s",
        (test_exam,),
    )[0] == 1
    assert _row("SELECT COUNT(*) FROM subjects WHERE slug = %s", (test_subject,))[0] == 1


def _media(placement, n, option_key=None):
    from prepora_pipeline.contracts import NormalizedMedia

    sha = f"{n:064x}"
    return NormalizedMedia(
        placement=placement,
        option_key=option_key,
        storage_key=f"{sha[:2]}/{sha}.png",
        mime_type="image/png",
        alt_text=f"image {n}",
        size_bytes=100,
    )


def test_publish_records_question_images_idempotently(test_exam, test_subject):
    normalized = _normalized(
        test_exam, test_subject, question_text="Refer to the exhibit. Which subnet is isolated?"
    ).model_copy(
        update={
            "media": [
                _media("question", 1),
                _media("question", 2),
                _media("option", 3, option_key="B"),
                _media("explanation", 4),
            ]
        }
    )
    first = publish_question(normalized)
    publish_question(normalized)  # re-publishing must not duplicate the images

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT placement, option_key, position, alt_text, filename FROM media "
                "WHERE question_id = %s ORDER BY placement, option_key NULLS FIRST, position",
                (first.question_id,),
            )
            rows = cur.fetchall()
            assert rows == [
                ("explanation", None, 0, "image 4", f"{4:064x}.png"),
                ("option", "B", 0, "image 3", f"{3:064x}.png"),
                ("question", None, 0, "image 1", f"{1:064x}.png"),
                ("question", None, 1, "image 2", f"{2:064x}.png"),
            ]
            # Images go with their question.
            cur.execute("DELETE FROM questions WHERE id = %s", (first.question_id,))
            cur.execute("SELECT COUNT(*) FROM media WHERE question_id = %s", (first.question_id,))
            assert cur.fetchone()[0] == 0
        conn.rollback()
    finally:
        conn.close()


def test_image_on_a_missing_option_is_refused(test_exam, test_subject):
    normalized = _normalized(test_exam, test_subject, question_text="Which one?").model_copy(
        update={"media": [_media("option", 5, option_key="Z")]}
    )
    with pytest.raises(PublishError, match="MEDIA_OPTION_NOT_FOUND"):
        publish_question(normalized)


def _pooled(test_exam, test_subject, *, question_text, number):
    # A question from a randomly drawn pool (MS Learn): identified by content, not position.
    return _normalized(
        test_exam, test_subject, question_text=question_text, number=number
    ).model_copy(update={"identity": "content"})


def _occurrences(question_set_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT q.question_text, o.original_question_number FROM question_occurrences o "
                "JOIN questions q ON q.id = o.question_id WHERE o.question_set_id = %s "
                "ORDER BY o.original_question_number",
                (question_set_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def test_rescraped_pool_question_is_deduplicated_by_content(test_exam, test_subject):
    text = "Which Azure service provides managed DNS zones for a virtual network?"
    first = publish_question(_pooled(test_exam, test_subject, question_text=text, number=3))
    # The same question comes back in a later scrape, at a different position.
    again = publish_question(_pooled(test_exam, test_subject, question_text=text, number=41))
    assert again.question_id == first.question_id
    assert again.stable_content_id == first.stable_content_id
    assert not again.question_created and not again.occurrence_created
    assert len(_occurrences(first.question_set_id)) == 1


def test_new_pool_question_at_a_used_position_is_added_not_dropped(test_exam, test_subject):
    # Regression: position-based ids gave a new question that happened to appear 7th the id of the
    # existing 7th question, and it was silently discarded as "already published".
    first = publish_question(
        _pooled(test_exam, test_subject, question_text="How do you peer two VNets?", number=7)
    )
    second = publish_question(
        _pooled(
            test_exam,
            test_subject,
            question_text="Which gateway SKU supports zone redundancy?",
            number=7,
        )
    )
    assert second.question_created
    assert second.question_id != first.question_id
    assert second.stable_content_id != first.stable_content_id


def test_new_pool_questions_append_after_existing_ones(test_exam, test_subject):
    texts = [
        "What does Azure Firewall inspect by default?",
        "Which rule type filters by FQDN?",
        "Where are NSG flow logs stored?",
    ]
    results = [
        publish_question(_pooled(test_exam, test_subject, question_text=t, number=1))
        for t in texts
    ]
    rows = _occurrences(results[0].question_set_id)
    assert [text for text, _ in rows] == texts
    assert [number for _, number in rows] == [1, 2, 3]


def test_content_hash_collision_with_different_text_is_not_merged(test_exam, test_subject):
    from .content_hash import content_hash

    new_text = "Which service encrypts traffic between on-premises and Azure?"
    first = publish_question(
        _pooled(test_exam, test_subject, question_text="An unrelated seed question?", number=1)
    )
    # Force a djb2 collision: another question row claims the new text's content_hash while its
    # text is different.
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE questions SET content_hash = %s WHERE id = %s",
                (content_hash(new_text), first.question_id),
            )
        conn.commit()
    finally:
        conn.close()

    second = publish_question(_pooled(test_exam, test_subject, question_text=new_text, number=2))
    assert second.question_created
    assert second.question_id != first.question_id


def test_concurrent_pool_appends_get_distinct_numbers(test_exam, test_subject):
    # Approval publishes many questions at once; appends to the same set must not read the same
    # MAX(original_question_number) and tie.
    from concurrent.futures import ThreadPoolExecutor

    first = publish_question(
        _pooled(test_exam, test_subject, question_text="Seed question for the set?", number=1)
    )
    # Texts must be clearly distinct: near-identical ones ("... number 3 ...", "... number 4 ...")
    # can trip the near-duplicate gate depending on which lands first — a flaky failure that has
    # nothing to do with numbering, which is all this test is about.
    texts = [f"{uuid.uuid4().hex} {uuid.uuid4().hex}?" for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(
            pool.map(
                lambda t: publish_question(
                    _pooled(test_exam, test_subject, question_text=t, number=1)
                ),
                texts,
            )
        )
    numbers = [number for _, number in _occurrences(first.question_set_id)]
    assert numbers == list(range(1, 10))


# ─── Paper structure: marks, answer status, numeric ranges (docs/specs/03-paper-structure-min.md)


def _numeric(test_exam, test_subject, **overrides):
    return _normalized(
        test_exam, test_subject, question_text="How many invented units fit in a crate?"
    ).model_copy(
        update={
            "question_type": "numerical",
            "options": [],
            "answer": NumericalAnswer(
                answer="-0.61 to -0.57 OR 0.57 to 0.61", ranges=[(-0.61, -0.57), (0.57, 0.61)]
            ),
            **overrides,
        }
    )


def _answers(question_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT numeric_min::float, numeric_max::float, range_group, numerical_answer, "
                "provenance FROM question_answers WHERE question_id = %s ORDER BY range_group",
                (question_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def _occurrence_facts(question_id):
    return _row(
        "SELECT section_label, number_label, marks::float, negative_marks::float, answer_status "
        "FROM question_occurrences WHERE question_id = %s",
        (question_id,),
    )


def test_a_numeric_answer_with_two_ranges_writes_one_row_per_range(test_exam, test_subject):
    result = publish_question(
        _numeric(test_exam, test_subject, answer_provenance="official_provisional")
    )
    display = "-0.61 to -0.57 OR 0.57 to 0.61"
    assert _answers(result.question_id) == [
        (-0.61, -0.57, 0, display, "official_provisional"),
        (0.57, 0.61, 1, display, "official_provisional"),
    ]
    # Republishing finds the same question: its ranges are its answer shape.
    again = publish_question(_numeric(test_exam, test_subject))
    assert again.question_id == result.question_id
    assert not again.question_created


def test_occurrence_facts_are_written_and_a_revised_key_updates_them(test_exam, test_subject):
    paper = {"section": "General Aptitude", "number_label": "Q.1", "marks": 1.0}
    first = publish_question(
        _normalized(test_exam, test_subject, question_text="Pick the invented colour.").model_copy(
            update={**paper, "negative_marks": 1 / 3}
        )
    )
    assert first.occurrence_created
    assert _occurrence_facts(first.question_id) == ("General Aptitude", "Q.1", 1.0, 0.33, "scored")

    # The revised key gives marks to everyone: same question, same paper, new status.
    revised = publish_question(
        _normalized(test_exam, test_subject, question_text="Pick the invented colour.").model_copy(
            update={**paper, "negative_marks": 1 / 3, "answer_status": "marks_to_all"}
        )
    )
    assert revised.question_id == first.question_id
    assert not revised.occurrence_created
    assert _occurrence_facts(first.question_id)[4] == "marks_to_all"


def test_a_question_with_marks_to_all_publishes_without_answer_rows(test_exam, test_subject):
    result = publish_question(
        _normalized(test_exam, test_subject, question_text="An invented question with no key.")
        .model_copy(update={"answer": None, "answer_status": "marks_to_all"})
    )
    assert _answers(result.question_id) == []
    assert _occurrence_facts(result.question_id)[4] == "marks_to_all"


def test_a_sets_key_status_only_moves_forward(test_exam, test_subject):
    stems = {
        1: "Which invented planet has rings?",
        2: "How do zeppelins in the invented fleet refuel?",
        3: "Name the composer of the invented anthem.",
        4: "What does the invented tax on salt fund?",
    }

    def publish(number, key_status):
        return publish_question(
            _normalized(
                test_exam, test_subject, question_text=stems[number], number=number
            ).model_copy(update={"key_status": key_status, "paper_kind": "past_paper"})
        )

    set_id = publish(1, "provisional").question_set_id

    def status():
        return _row(
            "SELECT paper_kind, key_status FROM question_sets WHERE id = %s", (set_id,)
        )

    assert status() == ("past_paper", "provisional")
    publish(2, "final")
    assert status() == ("past_paper", "final")
    publish(3, "provisional")  # an older key never relabels the set
    assert status() == ("past_paper", "final")
    publish(4, "revised")
    assert status() == ("past_paper", "revised")
