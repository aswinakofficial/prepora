"""
Database access for apps/pipeline.

Unlike apps/web (Cloudflare Workers, per-request environment bindings — see
packages/db/src/client.ts), apps/pipeline is a traditional process that reads its full environment
at startup, so there is no reason to defer validation: a missing DATABASE_URL should fail loudly and
immediately, naming the problem, rather than return None and let the failure surface later as a
confusing attribute error deep inside a stage. See docs/roadmap/engineering-roadmap.md item 7.
"""
import os
import re
import threading
import time

import psycopg2
import psycopg2.extensions

# Every caller follows the same pattern — `conn = get_db_connection()`, work, `conn.close()` in a
# `finally`. Opening a fresh connection each time meant a new TCP + TLS + auth handshake to Neon
# (~350ms from a developer machine to the Singapore region), and publishing a single question
# opened three of them (quality gate, dedupe check, publish): about a second of pure connection
# setup per question, which made approving a 50-question review batch take minutes. So close()
# now hands the connection back to a small process-wide idle pool instead, and the next
# get_db_connection() reuses it. Callers don't change.
_MAX_IDLE = 8
# Neon's pooler drops idle client connections eventually; a connection idle longer than this is
# probed with `SELECT 1` (one round trip, far cheaper than a reconnect) before being handed out.
_PROBE_AFTER_IDLE_SECONDS = 30

_idle: list[tuple["_PooledConnection", float]] = []
_idle_lock = threading.Lock()


class _PooledConnection(psycopg2.extensions.connection):
    def close(self):
        if self.closed:
            return
        try:
            # Never hand out a connection mid-transaction: a caller that raised before commit()
            # (or only ever read) leaves one open, and reusing it would leak that state.
            if self.get_transaction_status() != psycopg2.extensions.TRANSACTION_STATUS_IDLE:
                self.rollback()
            if self.autocommit:
                self.autocommit = False
        except Exception:
            super().close()
            return
        with _idle_lock:
            if len(_idle) < _MAX_IDLE:
                _idle.append((self, time.monotonic()))
                return
        super().close()

    def discard(self):
        super().close()


def _take_idle() -> "_PooledConnection | None":
    while True:
        with _idle_lock:
            if not _idle:
                return None
            conn, released_at = _idle.pop()
        if conn.closed:
            continue
        if time.monotonic() - released_at > _PROBE_AFTER_IDLE_SECONDS:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                conn.rollback()
            except Exception:
                conn.discard()
                continue
        return conn


def get_db_connection():
    reused = _take_idle()
    if reused is not None:
        return reused

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and fill in a real Postgres "
            "connection string, or configure it in your deployment environment."
        )
    # Neon's pooled connection strings include channel_binding, which some libpq/psycopg2 builds
    # don't accept as a connection parameter — mirrors packages/db/src/client.ts's
    # cleanConnectionString() and apps/scraper/db.py's own copy of this same fix.
    clean_url = re.sub(r"[?&]channel_binding=[^&]+", "", db_url)
    return psycopg2.connect(clean_url, connection_factory=_PooledConnection)
