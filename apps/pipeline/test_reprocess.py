"""
Tests for reprocessing stored artifacts — docs/roadmap/engineering-roadmap.md item 12.

The headline guarantee: reprocessing never makes an HTTP request. http.client is what both
urllib and requests eventually call down into, so blocking it here catches an accidental network
call regardless of which library made it — while leaving psycopg2's own (non-HTTP) connection to
the database untouched, since that is an expected pipeline dependency, not "the network" this
guarantee is about.
"""
import http.client
import os
from datetime import datetime, timezone

import pytest

from prepora_pipeline.core import FilesystemArtifactStore, reprocess_source
from prepora_pipeline.core.db import get_db_connection

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL is not set — reprocessing needs the artifact store's database.",
)

TEST_SOURCE_PREFIX = "test-reprocess"


@pytest.fixture
def source_slug():
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


def _block_http(*_args, **_kwargs):
    raise AssertionError("HTTP request attempted during reprocess — this must never re-fetch.")


def test_reprocess_yields_parser_output_for_every_stored_artifact(store, source_slug):
    store.store(
        b"question one",
        source_slug=source_slug,
        source_url="https://example.com/q1",
        content_type="text/plain",
    )
    store.store(
        b"question two",
        source_slug=source_slug,
        source_url="https://example.com/q2",
        content_type="text/plain",
    )

    def parser(content: bytes, artifact):
        return content.decode().upper()

    results = list(reprocess_source(store, parser, source_slug=source_slug))

    assert len(results) == 2
    outputs = {output for _artifact, output in results}
    assert outputs == {"QUESTION ONE", "QUESTION TWO"}


def test_a_modified_parser_produces_new_output_from_the_same_stored_artifact(store, source_slug):
    store.store(
        b"raw content",
        source_slug=source_slug,
        source_url="https://example.com/q1",
        content_type="text/plain",
    )

    def parser_v1(content: bytes, artifact):
        return content.decode()

    def parser_v2(content: bytes, artifact):
        return content.decode().upper()

    [(_, v1_output)] = list(reprocess_source(store, parser_v1, source_slug=source_slug))
    [(_, v2_output)] = list(reprocess_source(store, parser_v2, source_slug=source_slug))

    assert v1_output == "raw content"
    assert v2_output == "RAW CONTENT"


def test_reprocess_makes_no_http_requests(monkeypatch, store, source_slug):
    store.store(
        b"<html>question</html>",
        source_slug=source_slug,
        source_url="https://example.com/q1",
        content_type="text/html",
    )

    monkeypatch.setattr(http.client.HTTPConnection, "request", _block_http)
    monkeypatch.setattr(http.client.HTTPSConnection, "request", _block_http)

    def parser(content: bytes, artifact):
        return content.decode()

    results = list(reprocess_source(store, parser, source_slug=source_slug))

    assert len(results) == 1
    assert results[0][1] == "<html>question</html>"
