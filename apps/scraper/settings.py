"""
Startup configuration for the scraper service, validated once at import.

This is a genuinely traditional Python process — unlike the TypeScript web app, which runs on
Cloudflare Workers and only receives its environment per request (see packages/db/src/client.ts and
packages/auth/src/index.ts for why *those* validate lazily rather than at import), this service reads
its full environment from the OS / .env at process startup via python-dotenv, well before this module
is ever imported. There is no reason to defer validation here: a missing required variable should
crash the service immediately, naming exactly what's missing, rather than let it start in a state
where its core job — persisting scraped content — will silently fail on every request.

See docs/architecture/prepora-next-level-plan.md finding #22 and
docs/roadmap/engineering-roadmap.md item 7.
"""
from dotenv import load_dotenv
from pydantic import ValidationError
from pydantic_settings import BaseSettings

# Mirrors main.py's own dotenv loading (python-dotenv walks up to the repo-root .env by default).
load_dotenv()


class ScraperSettings(BaseSettings):
    # Required: the scraper's whole purpose is to persist scraped content into Postgres, so a
    # missing database isn't a degraded-but-usable state — it's a misconfigured service that
    # shouldn't start at all.
    database_url: str

    # Deliberately *not* declared here, and not required at import time: PIPELINE_SERVICE_TOKEN and
    # the allowlist/CORS settings (see security.py) are already validated per-request (roadmap
    # item 3) — that design lets the service start before its access-control config is fully wired
    # (e.g. in CI) while still refusing every real request. This item doesn't change that.


try:
    settings = ScraperSettings()
except ValidationError as e:
    missing = ", ".join(err["loc"][0] for err in e.errors() if err["type"] == "missing")
    raise SystemExit(
        f"Scraper service is missing required configuration and will not start: {missing}.\n"
        "Copy .env.example (repo root) to .env and fill in DATABASE_URL, or set it in this "
        "service's environment."
    ) from None
