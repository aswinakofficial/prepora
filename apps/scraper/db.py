"""
Shared database access for the scraper service.

Single connection helper and single write path into the scraped_questions
staging table. Previously this was duplicated three times across main.py,
ms_learn_catalog_crawler.py, and ms_learn_assessment_crawler.py — and one
of those copies also shelled out to `curl` to POST the raw DATABASE_URL as
an HTTP header to a hardcoded Neon hostname before falling back to
psycopg2. See docs/architecture/prepora-next-level-plan.md finding #6 and
docs/roadmap/engineering-roadmap.md item 4.

Every scraper module should import get_db_connection/insert_scraped_question
from here rather than defining its own.
"""
import os
import re
from typing import Any, Dict, Optional

import psycopg2
from psycopg2.extras import Json


def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    try:
        # Neon's pooled connection strings include channel_binding, which
        # older libpq/psycopg2 builds don't understand as a connection
        # parameter — strip it defensively, mirroring
        # packages/db/src/client.ts's cleanConnectionString().
        clean_url = re.sub(r"[?&]channel_binding=[^&]+", "", db_url)
        return psycopg2.connect(clean_url)
    except Exception as e:
        print(f"[DB CONNECTION WARNING]: {e}")
        return None


def insert_scraped_question(
    source_url: str,
    raw_data: Optional[str],
    parsed_data: Dict[str, Any],
    status: str = "pending",
) -> Optional[str]:
    """
    The single write path into the scraped_questions staging table. Returns
    the inserted row's id, or None if the write failed — callers decide
    whether that's fatal (main.py reports db_saved: False; the Playwright
    crawler logs it and returns its in-memory results regardless, since a
    failed DB write shouldn't discard content already extracted).
    """
    conn = get_db_connection()
    if not conn:
        print("[DB INSERT] No database connection available; scraped content was not saved.")
        return None

    try:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO scraped_questions (source_url, raw_data, parsed_data, status)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (source_url, raw_data, Json(parsed_data), status),
            )
            row = cursor.fetchone()
            conn.commit()
            return row[0] if row else None
        except Exception as e:
            print(f"[DB INSERT ERROR]: {e}")
            conn.rollback()
            return None
        finally:
            cursor.close()
    finally:
        conn.close()
