"""
Service-to-service authentication for apps/pipeline's HTTP API.

Cloudflare Workers (where packages/api's admin.router.ts runs) cannot spawn subprocesses, so
delegating from TS to this pipeline has to go over HTTP rather than a CLI shell-out — this module
is that boundary's auth. Mirrors apps/scraper's security.py's require_service_token exactly (same
env var, same bearer-token, fail-closed shape) rather than importing it, since apps/pipeline is
meant to be depended on, not the other way around — apps/scraper already imports *from*
apps/pipeline (see its main.py/security.py's sys.path bridge comment).
"""
import os
from typing import Optional

from fastapi import Header, HTTPException

SERVICE_TOKEN_ENV = "PIPELINE_SERVICE_TOKEN"


async def require_service_token(authorization: Optional[str] = Header(None)) -> None:
    token = os.getenv(SERVICE_TOKEN_ENV)
    if not token:
        raise HTTPException(
            status_code=503,
            detail=(
                f"{SERVICE_TOKEN_ENV} is not configured on the pipeline service. "
                "Set it in apps/pipeline's environment before this service will accept any request."
            ),
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")

    presented = authorization[len("Bearer "):]
    if presented != token:
        raise HTTPException(status_code=401, detail="Invalid service token.")
