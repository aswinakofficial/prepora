"""
Incremental crawling and change detection — docs/roadmap/engineering-roadmap.md item 17.

Item 12 already computes a content hash for everything it stores, so most of what this module
does is comparison, not new machinery: classify a freshly fetched resource against the most
recent artifact stored for that exact URL as `new`, `changed`, or `unchanged`, and — after a full
discovery pass — flag any previously-known URL that didn't turn up this time as `removed`. Nothing
here ever deletes a `raw_artifacts` row or unpublishes content; a source going dark should surface
for human review, not silently vanish.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import unified_diff
from typing import Literal

from prepora_pipeline.core.artifact_store import ArtifactStore
from prepora_pipeline.core.db import get_db_connection

ChangeStatus = Literal["new", "changed", "unchanged", "removed"]


@dataclass
class ChangeResult:
    url: str
    status: ChangeStatus
    previous_sha256: str | None
    new_sha256: str | None
    diff: str | None = None


def make_diff(old_content: bytes, new_content: bytes) -> str:
    """A unified diff for a human reviewer — see this module's `changed` classification."""
    old_lines = old_content.decode("utf-8", errors="replace").splitlines(keepends=True)
    new_lines = new_content.decode("utf-8", errors="replace").splitlines(keepends=True)
    return "".join(unified_diff(old_lines, new_lines, fromfile="previous", tofile="current"))


def classify_fetch(
    store: ArtifactStore, source_slug: str, url: str, content: bytes
) -> ChangeResult:
    """
    Classifies a freshly fetched page's content against the last artifact stored for this exact
    URL. Does not store `content` itself — the caller decides whether to (typically: always, since
    storing is what item 12's dedupe-on-hash makes cheap for the `unchanged` case too).
    """
    new_sha256 = hashlib.sha256(content).hexdigest()
    previous = store.latest_for_url(source_slug, url)

    if previous is None:
        return ChangeResult(url=url, status="new", previous_sha256=None, new_sha256=new_sha256)

    if previous.sha256 == new_sha256:
        return ChangeResult(
            url=url, status="unchanged", previous_sha256=previous.sha256, new_sha256=new_sha256
        )

    diff = make_diff(store.get(previous.sha256), content)
    return ChangeResult(
        url=url, status="changed", previous_sha256=previous.sha256, new_sha256=new_sha256, diff=diff
    )


def classify_not_modified(store: ArtifactStore, source_slug: str, url: str) -> ChangeResult:
    """The source answered 304 Not Modified to a conditional request — definitely unchanged, no
    need to hash anything (there is nothing new to hash)."""
    previous = store.latest_for_url(source_slug, url)
    sha = previous.sha256 if previous else None
    return ChangeResult(url=url, status="unchanged", previous_sha256=sha, new_sha256=sha)


def find_removed(store: ArtifactStore, source_slug: str, discovered_urls: list[str]) -> list[str]:
    """Every URL with a stored artifact for this source that this crawl's discovery pass didn't
    turn up. A URL that's been removed for several crawls in a row appears here every time —
    each run reports what's missing *right now*, not just newly-missing-since-ever."""
    known = {a.source_url for a in store.iter_artifacts(source_slug=source_slug)}
    return sorted(known - set(discovered_urls))


def reconcile_removed(
    store: ArtifactStore, source_slug: str, discovered_urls: list[str]
) -> list[str]:
    """
    Flags every URL find_removed() reports as removed (upserting a removed_resources row — never
    deleting anything), and marks any previously-flagged URL that reappeared in this crawl's
    discovery as 'restored'. A row a human has already reviewed (status moved off 'flagged') is
    left alone by the flagging half rather than silently reset, so this never overwrites a
    reviewer's decision — only 'restored' can move a row off a terminal human-set status, and only
    because the resource is verifiably back.

    Returns the list of URLs newly reported as removed this run (see find_removed()'s own note on
    why a persistently-missing URL is reported every time).
    """
    removed_urls = find_removed(store, source_slug, discovered_urls)
    now = datetime.now(timezone.utc)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            for url in removed_urls:
                previous = store.latest_for_url(source_slug, url)
                cur.execute(
                    "INSERT INTO removed_resources "
                    "(source_slug, url, last_seen_sha256, last_seen_at, status) "
                    "VALUES (%s, %s, %s, %s, 'flagged') "
                    "ON CONFLICT (source_slug, url) DO UPDATE SET "
                    "last_seen_sha256 = EXCLUDED.last_seen_sha256, "
                    "last_seen_at = EXCLUDED.last_seen_at, updated_at = now() "
                    "WHERE removed_resources.status = 'flagged'",
                    (source_slug, url, previous.sha256 if previous else None, now),
                )

            if discovered_urls:
                cur.execute(
                    "UPDATE removed_resources SET status = 'restored', updated_at = now() "
                    "WHERE source_slug = %s AND url = ANY(%s) "
                    "AND status IN ('flagged', 'confirmed_removed')",
                    (source_slug, discovered_urls),
                )
            conn.commit()
    finally:
        conn.close()

    return removed_urls
