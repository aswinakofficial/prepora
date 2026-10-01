"""
The source registry — docs/roadmap/engineering-roadmap.md item 14. Sources are configuration, not
code: each connector's static facts (base URL, source type, connector name, auth requirement, crawl
policy, rate limit, robots review status) live in a source.yaml file next to it, and this module
syncs them into the `sources` table. Mutable operational state (enabled, last_crawl_at,
last_successful_crawl_at, consecutive_failures) lives only in the table and a sync never touches it
— see sync_sources_from_yaml()'s ON CONFLICT clause.

This is also the fetch allowlist: apps/scraper/security.py calls get_allowed_base_urls() instead of
reading a separate SCRAPER_ALLOWED_HOSTS env var, so the registry and the security boundary are one
mechanism that can't silently disagree with each other.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml
from psycopg2.extras import Json

from .db import get_db_connection

CONNECTORS_DIR = Path(__file__).resolve().parent.parent / "connectors"


@dataclass
class Source:
    id: str
    name: str
    base_url: str
    source_type: str | None
    connector_name: str
    requires_auth: bool
    crawl_policy: dict[str, Any] | None
    rate_limit: dict[str, Any] | None
    robots_review_status: str
    enabled: bool
    last_crawl_at: datetime | None
    last_successful_crawl_at: datetime | None
    consecutive_failures: int


_COLUMNS = (
    "id, name, base_url, source_type, connector_name, requires_auth, crawl_policy, rate_limit, "
    "robots_review_status, enabled, last_crawl_at, last_successful_crawl_at, consecutive_failures"
)


def _row_to_source(row) -> Source:
    (
        id_,
        name,
        base_url,
        source_type,
        connector_name,
        requires_auth,
        crawl_policy,
        rate_limit,
        robots_review_status,
        enabled,
        last_crawl_at,
        last_successful_crawl_at,
        consecutive_failures,
    ) = row
    return Source(
        id=id_,
        name=name,
        base_url=base_url,
        source_type=source_type,
        connector_name=connector_name,
        requires_auth=requires_auth,
        crawl_policy=crawl_policy,
        rate_limit=rate_limit,
        robots_review_status=robots_review_status,
        enabled=enabled,
        last_crawl_at=last_crawl_at,
        last_successful_crawl_at=last_successful_crawl_at,
        consecutive_failures=consecutive_failures,
    )


def load_source_yaml_files(connectors_dir: Path | None = None) -> list[dict[str, Any]]:
    """Reads every connectors/*/source.yaml, in no particular order. Does not touch the database."""
    directory = connectors_dir or CONNECTORS_DIR
    definitions = []
    if not directory.exists():
        return definitions
    for yaml_path in sorted(directory.glob("*/source.yaml")):
        with open(yaml_path) as f:
            definitions.append(yaml.safe_load(f))
    return definitions


def sync_sources_from_yaml(connectors_dir: Path | None = None) -> int:
    """
    Upserts every connectors/*/source.yaml into the sources table, keyed on `name`. Only the
    static fields are written on conflict — enabled/last_crawl_at/last_successful_crawl_at/
    consecutive_failures are set from the column defaults on first insert only, and never
    overwritten on a repeat sync. Returns the number of source definitions processed.

    One exception to "enabled is never overwritten": a definition marked
    `onboarding: not_onboarded` (a source researched and deliberately not used — see
    docs/sources/not-onboarded.md) is forced to enabled = false on every sync, so it can never be
    fetched from (it drops off get_allowed_base_urls()) however its row was toggled before.
    """
    definitions = load_source_yaml_files(connectors_dir)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            for d in definitions:
                crawl_policy = d.get("crawl_policy")
                rate_limit = d.get("rate_limit")
                not_onboarded = d.get("onboarding") == "not_onboarded"
                cur.execute(
                    "INSERT INTO sources "
                    "(name, base_url, source_type, connector_name, requires_auth, crawl_policy, "
                    "rate_limit, robots_review_status, enabled) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (name) DO UPDATE SET "
                    "base_url = EXCLUDED.base_url, source_type = EXCLUDED.source_type, "
                    "connector_name = EXCLUDED.connector_name, "
                    "requires_auth = EXCLUDED.requires_auth, "
                    "crawl_policy = EXCLUDED.crawl_policy, rate_limit = EXCLUDED.rate_limit, "
                    "robots_review_status = EXCLUDED.robots_review_status, "
                    "enabled = CASE WHEN %s THEN false ELSE sources.enabled END, "
                    "updated_at = now()",
                    (
                        d["name"],
                        d["base_url"],
                        d.get("source_type"),
                        d["connector_name"],
                        d.get("requires_auth", False),
                        Json(crawl_policy) if crawl_policy is not None else None,
                        Json(rate_limit) if rate_limit is not None else None,
                        d.get("robots_review_status", "not_reviewed"),
                        not not_onboarded,
                        not_onboarded,
                    ),
                )
            conn.commit()
    finally:
        conn.close()
    return len(definitions)


def list_sources(*, enabled_only: bool = False) -> list[Source]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if enabled_only:
                cur.execute(f"SELECT {_COLUMNS} FROM sources WHERE enabled = true ORDER BY name")
            else:
                cur.execute(f"SELECT {_COLUMNS} FROM sources ORDER BY name")
            return [_row_to_source(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_source(name: str) -> Source | None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {_COLUMNS} FROM sources WHERE name = %s", (name,))
            row = cur.fetchone()
            return _row_to_source(row) if row else None
    finally:
        conn.close()


def is_source_enabled(name: str) -> bool:
    source = get_source(name)
    return source is not None and source.enabled


def get_allowed_base_urls(*, enabled_only: bool = True) -> list[str]:
    """The fetch allowlist — every enabled source's base_url hostname. This is what
    apps/scraper/security.py checks a scrape target against instead of a separate env var."""
    return [urlparse(s.base_url).hostname for s in list_sources(enabled_only=enabled_only)]


def is_url_allowed(url: str) -> bool:
    """
    Whether `url`'s host is an enabled source's base_url, or a subdomain of one — the same rule
    apps/scraper/security.py's _host_is_allowlisted() applies, duplicated narrowly here (not
    imported from apps/scraper, which depends on apps/pipeline and not the other way around) so
    prepora_pipeline.core.http_client (item 16) enforces the registry allowlist itself rather than
    relying on every caller to check it first.
    """
    hostname = (urlparse(url).hostname or "").lower()
    if not hostname:
        return False
    for allowed in get_allowed_base_urls():
        if allowed and (hostname == allowed or hostname.endswith(f".{allowed}")):
            return True
    return False


def record_crawl_attempt(name: str, *, success: bool) -> None:
    """
    Updates last_crawl_at always; on success also stamps last_successful_crawl_at and resets
    consecutive_failures to 0, on failure increments consecutive_failures.
    """
    now = datetime.now(timezone.utc)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if success:
                cur.execute(
                    "UPDATE sources SET last_crawl_at = %s, last_successful_crawl_at = %s, "
                    "consecutive_failures = 0 WHERE name = %s",
                    (now, now, name),
                )
            else:
                cur.execute(
                    "UPDATE sources SET last_crawl_at = %s, "
                    "consecutive_failures = consecutive_failures + 1 WHERE name = %s",
                    (now, name),
                )
            conn.commit()
    finally:
        conn.close()
