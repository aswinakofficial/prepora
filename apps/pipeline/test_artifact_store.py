"""
Tests for the raw artifact store — docs/roadmap/engineering-roadmap.md item 12.

Requires DATABASE_URL (the store's metadata lives in raw_artifacts — see
test_conformance.py's docstring for why these are skipped locally without one and how CI provides
one). Every test uses a distinctive source_slug prefix and cleans its own rows up afterward, since
these run against the same database as everything else in this session.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest

from prepora_pipeline.core import ArtifactNotFoundError, FilesystemArtifactStore
from prepora_pipeline.core.db import get_db_connection

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — the artifact store needs a database."
)

TEST_SOURCE_PREFIX = "test-artifact-store"


@pytest.fixture
def source_slug():
    # Unique per test so parallel/repeated runs never collide.
    slug = f"{TEST_SOURCE_PREFIX}-{os.getpid()}-{datetime.now(timezone.utc).timestamp()}"
    yield slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM raw_artifacts WHERE source_slug = %s", (slug,))
            conn.commit()
    finally:
        conn.close()


@pytest.fixture
def store(tmp_path):
    return FilesystemArtifactStore(root_dir=tmp_path)


class TestStore:
    def test_stores_and_retrieves_content(self, store, source_slug):
        artifact = store.store(
            b"<html>hello</html>",
            source_slug=source_slug,
            source_url="https://example.com/q1",
            content_type="text/html",
        )
        assert store.get(artifact.sha256) == b"<html>hello</html>"
        assert store.exists(artifact.sha256)

    def test_identical_content_stores_once(self, store, source_slug):
        first = store.store(
            b"same bytes",
            source_slug=source_slug,
            source_url="https://example.com/a",
            content_type="text/plain",
        )
        second = store.store(
            b"same bytes",
            source_slug=source_slug,
            source_url="https://example.com/b",  # different URL, identical content
            content_type="text/plain",
        )
        assert first.sha256 == second.sha256

        artifacts = list(store.iter_artifacts(source_slug=source_slug))
        assert len(artifacts) == 1, "identical content must dedupe to a single stored artifact"

    def test_different_content_stores_separately(self, store, source_slug):
        store.store(
            b"content one",
            source_slug=source_slug,
            source_url="https://example.com/a",
            content_type="text/plain",
        )
        store.store(
            b"content two",
            source_slug=source_slug,
            source_url="https://example.com/b",
            content_type="text/plain",
        )
        assert len(list(store.iter_artifacts(source_slug=source_slug))) == 2

    def test_get_raises_for_unknown_hash(self, store):
        with pytest.raises(ArtifactNotFoundError):
            store.get("0" * 64)

    def test_iter_artifacts_filters_by_since(self, store, source_slug):
        old = datetime.now(timezone.utc) - timedelta(days=10)
        recent = datetime.now(timezone.utc)
        store.store(
            b"old content",
            source_slug=source_slug,
            source_url="https://example.com/old",
            content_type="text/plain",
            fetched_at=old,
        )
        store.store(
            b"recent content",
            source_slug=source_slug,
            source_url="https://example.com/recent",
            content_type="text/plain",
            fetched_at=recent,
        )

        cutoff = datetime.now(timezone.utc) - timedelta(days=1)
        results = list(store.iter_artifacts(source_slug=source_slug, since=cutoff))
        assert len(results) == 1
        assert results[0].source_url == "https://example.com/recent"


class TestPrune:
    def test_prune_removes_only_artifacts_older_than_cutoff(self, store, source_slug):
        old = datetime.now(timezone.utc) - timedelta(days=100)
        recent = datetime.now(timezone.utc)
        old_artifact = store.store(
            b"ancient",
            source_slug=source_slug,
            source_url="https://example.com/old",
            content_type="text/plain",
            fetched_at=old,
        )
        recent_artifact = store.store(
            b"fresh",
            source_slug=source_slug,
            source_url="https://example.com/recent",
            content_type="text/plain",
            fetched_at=recent,
        )

        removed = store.prune(older_than_days=30)

        assert removed == 1
        assert not store.exists(old_artifact.sha256)
        assert store.exists(recent_artifact.sha256)
