"""
Intake: every question a connector parses is stored first, `ready` or `held` with its issues
(core/quality.py), before anything reaches the review queue (docs/specs/07-intake.md). A held
question waits for a fix (Spec 9); it's never dropped.

Re-running upgrades, never duplicates. An item is keyed by source, paper, edition and number. A
re-parse with the same content keeps its review status (`in_review`, `published`, `rejected`) and
only refreshes its version stamps and issues; changed content recomputes it, so an improved parse
of a published question goes back through review.
"""
import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass, field

from psycopg2.extras import Json

from .db import get_db_connection
from .quality import CropRegion, Issue

# Stamps of where and how a candidate was made, not what it says: a new parser version or a fresh
# download of the same paper isn't new content.
_NOT_CONTENT = {
    "raw_artifact_sha256",
    "parser_version",
    "contract_version",
    "source_url",
    "source_document",
}
# Statuses a re-parse with unchanged content leaves alone: a person has (or is about to) decide.
_DECIDED = ("in_review", "published", "rejected")


def content_hash(candidate: dict) -> str:
    content = {k: v for k, v in candidate.items() if k not in _NOT_CONTENT}
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


@dataclass
class IntakeItem:
    source: str  # the source's registry name ("gate")
    paper_key: str  # "gate/2026/cs/CS-1"
    edition: str  # "iitg"
    number: int
    candidate: dict  # the NormalizedQuestion as JSON (or as much of one as could be built)
    parser_version: str
    number_label: str | None = None
    raw_artifact_sha256: str | None = None
    issues: list[Issue] = field(default_factory=list)
    regions: list[CropRegion] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "held" if self.issues else "ready"


@dataclass
class RecordResult:
    inserted: int = 0
    changed: int = 0  # content changed since the last parse
    unchanged: int = 0
    statuses: dict[str, int] = field(default_factory=dict)  # every recorded item's status after


class IntakeStore:
    """Intake items in the database (`intake_items`)."""

    def record(self, items: list[IntakeItem]) -> RecordResult:
        result = RecordResult()
        if not items:
            return result
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                source_id = _source_id(cur, items[0].source)
                for item in items:
                    digest = content_hash(item.candidate)
                    cur.execute(
                        "SELECT content_hash FROM intake_items WHERE source_id = %s "
                        "AND paper_key = %s AND edition = %s AND number = %s",
                        (source_id, item.paper_key, item.edition, item.number),
                    )
                    previous = cur.fetchone()
                    if previous is None:
                        result.inserted += 1
                    elif previous[0] == digest:
                        result.unchanged += 1
                    else:
                        result.changed += 1
                    cur.execute(
                        "INSERT INTO intake_items (source_id, paper_key, edition, number, "
                        "number_label, raw_artifact_sha256, candidate, content_hash, issues, "
                        "regions, parser_version, status) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                        "ON CONFLICT (source_id, paper_key, edition, number) DO UPDATE SET "
                        "number_label = EXCLUDED.number_label, "
                        "raw_artifact_sha256 = EXCLUDED.raw_artifact_sha256, "
                        "candidate = EXCLUDED.candidate, issues = EXCLUDED.issues, "
                        "regions = EXCLUDED.regions, parser_version = EXCLUDED.parser_version, "
                        "status = CASE WHEN intake_items.content_hash = EXCLUDED.content_hash "
                        "AND intake_items.status IN %s THEN intake_items.status "
                        "ELSE EXCLUDED.status END, "
                        "review_batch_id = CASE WHEN intake_items.content_hash = "
                        "EXCLUDED.content_hash AND intake_items.status IN %s "
                        "THEN intake_items.review_batch_id ELSE NULL END, "
                        "content_hash = EXCLUDED.content_hash, updated_at = now() "
                        "RETURNING status",
                        (
                            source_id,
                            item.paper_key,
                            item.edition,
                            item.number,
                            item.number_label,
                            item.raw_artifact_sha256,
                            Json(item.candidate),
                            digest,
                            Json([issue.to_json() for issue in item.issues]),
                            Json([{"page": r.page, "bbox": list(r.bbox)} for r in item.regions]),
                            item.parser_version,
                            item.status,
                            _DECIDED,
                            _DECIDED,
                        ),
                    )
                    status = cur.fetchone()[0]
                    result.statuses[status] = result.statuses.get(status, 0) + 1
            conn.commit()
        finally:
            conn.close()
        return result

    def ready_for_batch(self, source: str, paper_key: str, edition: str) -> list[tuple[str, dict]]:
        """(id, candidate) of each ready item not yet in a review batch, in question order."""
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT i.id, i.candidate FROM intake_items i JOIN sources s "
                    "ON s.id = i.source_id WHERE s.name = %s AND i.paper_key = %s "
                    "AND i.edition = %s AND i.status = 'ready' AND i.review_batch_id IS NULL "
                    "ORDER BY i.number",
                    (source, paper_key, edition),
                )
                return [(row[0], row[1]) for row in cur.fetchall()]
        finally:
            conn.close()

    def mark_in_review(self, ids: Iterable[str], batch_id: str) -> None:
        ids = list(ids)
        if not ids:
            return
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE intake_items SET status = 'in_review', review_batch_id = %s, "
                    "updated_at = now() WHERE id = ANY(%s)",
                    (batch_id, ids),
                )
            conn.commit()
        finally:
            conn.close()


def _source_id(cur, name: str) -> str:
    cur.execute("SELECT id FROM sources WHERE name = %s", (name,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Source {name!r} isn't registered; run sync-sources first.")
    return row[0]
