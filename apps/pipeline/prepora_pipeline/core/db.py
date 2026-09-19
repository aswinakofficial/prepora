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

import psycopg2


def get_db_connection():
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
    return psycopg2.connect(clean_url)
