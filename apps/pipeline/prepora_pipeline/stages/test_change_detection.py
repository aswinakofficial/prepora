"""
Tests for change detection — docs/roadmap/engineering-roadmap.md item 17.

Requires DATABASE_URL (see test_conformance.py's docstring): raw_artifacts and removed_resources
both need a real database. Every test uses a distinctive source_slug and cleans its own rows up.
"""
import os
import uuid

import pytest

from prepora_pipeline.core import FilesystemArtifactStore
from prepora_pipeline.core.db import get_db_connection

from .change_detection import classify_fetch, classify_not_modified, find_removed, reconcile_removed

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — change detection needs a database."
)


@pytest.fixture
def source_slug():
    slug = f"test-change-detection-{uuid.uuid4()}"
    yield slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM raw_artifacts WHERE source_slug = %s", (slug,))
            cur.execute("DELETE FROM removed_resources WHERE source_slug = %s", (slug,))
            conn.commit()
    finally:
        conn.close()


@pytest.fixture
def store(tmp_path):
    return FilesystemArtifactStore(root_dir=tmp_path)


class TestClassifyFetch:
    def test_content_never_seen_before_classifies_new(self, store, source_slug):
        result = classify_fetch(store, source_slug, "https://example.com/q1", b"first version")

        assert result.status == "new"
        assert result.previous_sha256 is None
        assert result.diff is None

    def test_identical_content_on_a_second_crawl_classifies_unchanged(self, store, source_slug):
        url = "https://example.com/q1"
        store.store(
            b"same content", source_slug=source_slug, source_url=url, content_type="text/html"
        )

        result = classify_fetch(store, source_slug, url, b"same content")

        assert result.status == "unchanged"
        assert result.previous_sha256 == result.new_sha256
        assert result.diff is None

    def test_modified_content_classifies_changed_and_produces_a_diff(self, store, source_slug):
        url = "https://example.com/q1"
        store.store(
            b"line one\nline two\n",
            source_slug=source_slug,
            source_url=url,
            content_type="text/plain",
        )

        result = classify_fetch(store, source_slug, url, b"line one\nline TWO CHANGED\n")

        assert result.status == "changed"
        assert result.previous_sha256 is not None
        assert result.new_sha256 is not None
        assert result.previous_sha256 != result.new_sha256
        assert "-line two" in result.diff
        assert "+line TWO CHANGED" in result.diff

    def test_304_not_modified_classifies_unchanged_without_hashing_a_body(self, store, source_slug):
        url = "https://example.com/q1"
        artifact = store.store(
            b"cached content", source_slug=source_slug, source_url=url, content_type="text/html"
        )

        result = classify_not_modified(store, source_slug, url)

        assert result.status == "unchanged"
        assert result.previous_sha256 == artifact.sha256
        assert result.new_sha256 == artifact.sha256


class TestFindAndReconcileRemoved:
    def test_a_url_absent_from_discovery_classifies_removed(self, store, source_slug):
        store.store(
            b"content",
            source_slug=source_slug,
            source_url="https://example.com/still-here",
            content_type="text/html",
        )
        store.store(
            b"content2",
            source_slug=source_slug,
            source_url="https://example.com/gone-now",
            content_type="text/html",
        )

        removed = find_removed(store, source_slug, ["https://example.com/still-here"])

        assert removed == ["https://example.com/gone-now"]

    def test_reconcile_flags_removed_urls_rather_than_deleting_anything(self, store, source_slug):
        store.store(
            b"content",
            source_slug=source_slug,
            source_url="https://example.com/gone-now",
            content_type="text/html",
        )

        removed = reconcile_removed(store, source_slug, discovered_urls=[])

        assert removed == ["https://example.com/gone-now"]
        # The artifact itself is untouched — flagging is not deleting.
        assert store.latest_for_url(source_slug, "https://example.com/gone-now") is not None

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM removed_resources WHERE source_slug = %s AND url = %s",
                    (source_slug, "https://example.com/gone-now"),
                )
                assert cur.fetchone()[0] == "flagged"
        finally:
            conn.close()

    def test_a_previously_flagged_url_reappearing_is_marked_restored(self, store, source_slug):
        url = "https://example.com/comes-back"
        store.store(b"content", source_slug=source_slug, source_url=url, content_type="text/html")

        reconcile_removed(store, source_slug, discovered_urls=[])  # flags it as removed
        reconcile_removed(store, source_slug, discovered_urls=[url])  # it's back

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM removed_resources WHERE source_slug = %s AND url = %s",
                    (source_slug, url),
                )
                assert cur.fetchone()[0] == "restored"
        finally:
            conn.close()

    def test_reconcile_does_not_overwrite_a_human_reviewed_status(self, store, source_slug):
        url = "https://example.com/reviewed"
        store.store(b"content", source_slug=source_slug, source_url=url, content_type="text/html")
        reconcile_removed(store, source_slug, discovered_urls=[])  # flags it

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE removed_resources SET status = 'confirmed_removed' "
                    "WHERE source_slug = %s AND url = %s",
                    (source_slug, url),
                )
                conn.commit()
        finally:
            conn.close()

        reconcile_removed(store, source_slug, discovered_urls=[])  # still missing, run again

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM removed_resources WHERE source_slug = %s AND url = %s",
                    (source_slug, url),
                )
                # A human already confirmed this — a re-run must not silently reset it back to
                # the default 'flagged' state.
                assert cur.fetchone()[0] == "confirmed_removed"
        finally:
            conn.close()
