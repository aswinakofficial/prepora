"""
Tests for the source registry — docs/roadmap/engineering-roadmap.md item 14.

Requires DATABASE_URL (see test_conformance.py's docstring for why these are skipped locally
without one and how CI provides one). Every test uses a distinctive source name and cleans its own
rows up afterward.
"""
import os
import uuid

import pytest

from prepora_pipeline.core import (
    get_allowed_base_urls,
    get_source,
    is_source_enabled,
    record_crawl_attempt,
    sync_sources_from_yaml,
)
from prepora_pipeline.core.db import get_db_connection

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — the registry needs a database."
)


def _write_source_yaml(connectors_dir, name, **overrides):
    fields = {
        "name": name,
        "base_url": f"https://{name}.example.com",
        "source_type": "test",
        "connector_name": "generic",
        "requires_auth": False,
        "robots_review_status": "not_reviewed",
        **overrides,
    }
    source_dir = connectors_dir / name
    source_dir.mkdir(parents=True, exist_ok=True)
    lines = [f"{k}: {v}" for k, v in fields.items() if not isinstance(v, dict)]
    yaml_text = "\n".join(lines) + "\n"
    if "crawl_policy" in fields:
        yaml_text += "crawl_policy:\n" + "".join(
            f"  {k}: {v}\n" for k, v in fields["crawl_policy"].items()
        )
    (source_dir / "source.yaml").write_text(yaml_text)


@pytest.fixture
def source_name():
    name = f"test-source-{uuid.uuid4()}"
    yield name
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sources WHERE name = %s", (name,))
            conn.commit()
    finally:
        conn.close()


class TestSyncFromYaml:
    def test_adding_a_yaml_file_makes_the_source_appear_with_no_code_change(
        self, tmp_path, source_name
    ):
        _write_source_yaml(tmp_path, source_name, base_url=f"https://{source_name}.example.com")

        count = sync_sources_from_yaml(connectors_dir=tmp_path)

        assert count == 1
        source = get_source(source_name)
        assert source is not None
        assert source.base_url == f"https://{source_name}.example.com"
        assert source.enabled is True  # column default for a brand-new row

    def test_resyncing_preserves_mutable_operational_state(self, tmp_path, source_name):
        _write_source_yaml(tmp_path, source_name)
        sync_sources_from_yaml(connectors_dir=tmp_path)

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET enabled = false, consecutive_failures = 7 WHERE name = %s",
                    (source_name,),
                )
                conn.commit()
        finally:
            conn.close()

        # Re-sync with a changed static field — the operational state above must survive.
        _write_source_yaml(tmp_path, source_name, source_type="changed")
        sync_sources_from_yaml(connectors_dir=tmp_path)

        source = get_source(source_name)
        assert source.source_type == "changed"  # static field: updated
        assert source.enabled is False  # operational field: untouched
        assert source.consecutive_failures == 7  # operational field: untouched


class TestAllowedBaseUrls:
    def test_disabled_source_is_excluded_from_the_allowlist(self, tmp_path, source_name):
        _write_source_yaml(tmp_path, source_name, base_url=f"https://{source_name}.example.com")
        sync_sources_from_yaml(connectors_dir=tmp_path)

        assert f"{source_name}.example.com" in get_allowed_base_urls()

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE sources SET enabled = false WHERE name = %s", (source_name,))
                conn.commit()
        finally:
            conn.close()

        assert f"{source_name}.example.com" not in get_allowed_base_urls()

    def test_a_disabled_source_cannot_be_triggered(self, tmp_path, source_name):
        _write_source_yaml(tmp_path, source_name)
        sync_sources_from_yaml(connectors_dir=tmp_path)
        assert is_source_enabled(source_name) is True

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE sources SET enabled = false WHERE name = %s", (source_name,))
                conn.commit()
        finally:
            conn.close()

        assert is_source_enabled(source_name) is False

    def test_a_not_onboarded_source_is_always_disabled(self, tmp_path, source_name):
        _write_source_yaml(tmp_path, source_name)
        sync_sources_from_yaml(connectors_dir=tmp_path)
        assert is_source_enabled(source_name) is True

        # Marked not onboarded: disabled on the next sync, and kept disabled even if re-enabled.
        _write_source_yaml(tmp_path, source_name, onboarding="not_onboarded")
        sync_sources_from_yaml(connectors_dir=tmp_path)
        assert is_source_enabled(source_name) is False
        assert f"{source_name}.example.com" not in get_allowed_base_urls()

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE sources SET enabled = true WHERE name = %s", (source_name,))
                conn.commit()
        finally:
            conn.close()
        sync_sources_from_yaml(connectors_dir=tmp_path)
        assert is_source_enabled(source_name) is False

    def test_unknown_source_is_not_enabled(self):
        assert is_source_enabled(f"does-not-exist-{uuid.uuid4()}") is False


class TestRecordCrawlAttempt:
    def test_successful_attempt_resets_consecutive_failures_and_stamps_success(
        self, tmp_path, source_name
    ):
        _write_source_yaml(tmp_path, source_name)
        sync_sources_from_yaml(connectors_dir=tmp_path)

        record_crawl_attempt(source_name, success=False)
        record_crawl_attempt(source_name, success=False)
        failed_twice = get_source(source_name)
        assert failed_twice.consecutive_failures == 2
        assert failed_twice.last_successful_crawl_at is None

        record_crawl_attempt(source_name, success=True)
        after_success = get_source(source_name)
        assert after_success.consecutive_failures == 0
        assert after_success.last_successful_crawl_at is not None
        assert after_success.last_crawl_at is not None
