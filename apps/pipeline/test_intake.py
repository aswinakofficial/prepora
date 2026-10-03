"""
Tests for intake (core/intake.py, core/quality.py; docs/specs/07-intake.md). The store's tests need
DATABASE_URL (the local database) and clean up after themselves.
"""
import os
import uuid

import pytest

from prepora_pipeline.core.db import get_db_connection
from prepora_pipeline.core.intake import IntakeItem, IntakeStore, content_hash
from prepora_pipeline.core.quality import ISSUE_CODES, Issue


def test_content_hash_ignores_provenance_and_version_stamps():
    base = {"question_text": "Invented?", "options": [{"key": "A", "text": "x"}], "marks": 1.0}
    stamped = {**base, "parser_version": "gate-9", "raw_artifact_sha256": "f" * 64}
    assert content_hash(base) == content_hash(stamped)
    assert content_hash(base) != content_hash({**base, "marks": 2.0})


def test_issue_codes_are_a_closed_vocabulary():
    assert Issue("math", "a row of sub- or superscripts").to_json() == {
        "code": "math",
        "detail": "a row of sub- or superscripts",
    }
    assert set(ISSUE_CODES) >= {"figure", "math", "layout", "image_option", "invalid"}
    with pytest.raises(ValueError, match="Unknown issue code"):
        Issue("blurry", "not a code")


needs_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL")


def _query(sql, params=()):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        conn.commit()
        return rows
    finally:
        conn.close()


@pytest.fixture
def paper():
    """A registered source and a unique paper key, removed afterwards."""
    name = f"test-intake-{uuid.uuid4().hex[:8]}"
    _query(
        "INSERT INTO sources (name, base_url, connector_name, robots_review_status) "
        "VALUES (%s, 'https://invented.example.test', 'test', 'not_reviewed')",
        (name,),
    )
    yield name, f"{name}/2099/x/X-1"
    _query("DELETE FROM intake_items WHERE paper_key = %s", (f"{name}/2099/x/X-1",))
    _query("DELETE FROM sources WHERE name = %s", (name,))


def _item(source, paper_key, number=1, text="Invented question?", issues=None):
    return IntakeItem(
        source=source,
        paper_key=paper_key,
        edition="test",
        number=number,
        candidate={"number": number, "question_text": text},
        parser_version="test-1",
        issues=issues or [],
    )


def _status(paper_key, number=1):
    return _query(
        "SELECT status::text FROM intake_items WHERE paper_key = %s AND number = %s",
        (paper_key, number),
    )[0][0]


@needs_db
class TestIntakeStore:
    def test_records_ready_and_held_items_and_batches_only_ready_ones(self, paper):
        source, key = paper
        store = IntakeStore()
        result = store.record(
            [_item(source, key, 1), _item(source, key, 2, issues=[Issue("figure", "drawn")])]
        )
        assert (result.inserted, result.statuses) == (2, {"ready": 1, "held": 1})
        ready = store.ready_for_batch(source, key, "test")
        assert [candidate["number"] for _, candidate in ready] == [1]
        assert _query(
            "SELECT issues FROM intake_items WHERE paper_key = %s AND number = 2", (key,)
        ) == [([{"code": "figure", "detail": "drawn"}],)]

    def test_unchanged_content_keeps_a_decided_status_and_changed_content_reopens_it(self, paper):
        source, key = paper
        store = IntakeStore()
        store.record([_item(source, key)])
        [(item_id, _)] = store.ready_for_batch(source, key, "test")
        _query("UPDATE intake_items SET status = 'published' WHERE id = %s", (item_id,))

        again = store.record([_item(source, key)])  # same content, newer parse
        assert (again.unchanged, _status(key)) == (1, "published")

        reparsed = store.record([_item(source, key, text="Invented question, read better?")])
        assert (reparsed.changed, _status(key)) == (1, "ready")  # back through review

    def test_a_held_item_whose_issues_clear_becomes_ready(self, paper):
        source, key = paper
        store = IntakeStore()
        store.record([_item(source, key, issues=[Issue("math", "a row of sub- or superscripts")])])
        assert _status(key) == "held"
        store.record([_item(source, key)])  # a better parser no longer finds the issue
        assert _status(key) == "ready"

    def test_mark_in_review_takes_items_out_of_the_next_batch(self, paper):
        source, key = paper
        store = IntakeStore()
        store.record([_item(source, key, 1), _item(source, key, 2)])
        ids = [item_id for item_id, _ in store.ready_for_batch(source, key, "test")]
        batch = _query(
            "INSERT INTO scraped_questions (source_url, parsed_data) VALUES ('x', '{}') "
            "RETURNING id"
        )[0][0]
        try:
            store.mark_in_review(ids, batch)
            assert store.ready_for_batch(source, key, "test") == []
            assert _status(key, 1) == "in_review"
        finally:
            _query("DELETE FROM intake_items WHERE paper_key = %s", (key,))
            _query("DELETE FROM scraped_questions WHERE id = %s", (batch,))

    def test_an_unregistered_source_is_a_clear_error(self):
        with pytest.raises(ValueError, match="sync-sources"):
            IntakeStore().record([_item("no-such-source", "x/1")])
