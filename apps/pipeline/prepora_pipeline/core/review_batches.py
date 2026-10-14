"""
Review batches: a connector's questions, waiting in the admin review queue (`scraped_questions`)
for a person to approve. The same insert as apps/scraper/db.py's insert_scraped_question, for
connectors that run in the pipeline rather than the scraper.

A batch whose metadata says `format: "normalized-v1"` carries, on every element, the complete
NormalizedQuestion (`normalized`), which approval publishes as it is
(docs/specs/05-gate-pilot.md), and the intake item it came from (`intakeItemId`,
docs/specs/07-intake.md), which approval marks as published.
"""
from typing import Any

from psycopg2.extras import Json

from .db import get_db_connection

NORMALIZED_FORMAT = "normalized-v1"


def create_review_batch(
    source_url: str,
    elements: list[dict[str, Any]],
    metadata: dict[str, Any],
    intake_item_ids: list[str] | None = None,
) -> str:
    """Writes a pending batch. Intake items it holds are marked in review in the same transaction,
    so a failure never leaves a batch whose items would be batched again."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO scraped_questions (source_url, raw_data, parsed_data, status) "
                "VALUES (%s, NULL, %s, 'pending') RETURNING id",
                (source_url, Json({"metadata": metadata, "extractedElements": elements})),
            )
            batch_id = cur.fetchone()[0]
            if intake_item_ids:
                cur.execute(
                    "UPDATE intake_items SET status = 'in_review', review_batch_id = %s, "
                    "updated_at = now() WHERE id = ANY(%s)",
                    (batch_id, intake_item_ids),
                )
        conn.commit()
        return batch_id
    finally:
        conn.close()
