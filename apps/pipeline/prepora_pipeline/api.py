"""
Minimal HTTP wrapper around apps/pipeline's stages, for callers that cannot shell out to the CLI —
per docs/architecture/prepora-next-level-plan.md §17's "CLI-first, HTTP-second" principle, this
calls the same publish_question() the CLI's `publish` subcommand calls, rather than duplicating it.

The one caller this exists for today: packages/api's admin.router.ts, which runs in a Cloudflare
Worker and therefore cannot spawn subprocesses — it must reach this pipeline over HTTP, the same
way it already reaches apps/scraper (see fetchScraper() and PIPELINE_SERVICE_TOKEN).
"""
import dataclasses
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException

from .contracts import NormalizedQuestion
from .core.security import require_service_token
from .stages.dedupe import check_duplicate
from .stages.publish import HeldResult, PublishError, publish_question

load_dotenv()

app = FastAPI(
    title="Prepora Pipeline Service",
    dependencies=[Depends(require_service_token)],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Prepora Pipeline Service"}


# Plain `def`, not `async def`, for both endpoints below: publish_question() and check_duplicate()
# are blocking psycopg2 code, and an `async def` endpoint runs them directly on the event loop —
# serializing every request, so a caller publishing a review batch concurrently gained nothing.
# FastAPI runs plain `def` endpoints in its threadpool instead; core/db.py's connection pool is
# thread-safe and hands each thread its own connection.
@app.post("/publish")
def publish(
    normalized: NormalizedQuestion,
    on_near_duplicate: Literal["refuse", "hold"] = "refuse",
    link_to_question_id: str | None = None,
    use_new_wording: bool = False,
    publish_as_new: bool = False,
):
    """Publish one question. Query parameters (all optional, see publish_question()):
    on_near_duplicate=hold returns {"held": true, "decision": {...}} for a possible duplicate
    instead of a 422; link_to_question_id (+ use_new_wording) / publish_as_new carry a reviewer's
    decision."""
    try:
        result = publish_question(
            normalized,
            on_near_duplicate=on_near_duplicate,
            link_to_question_id=link_to_question_id,
            use_new_wording=use_new_wording,
            publish_as_new=publish_as_new,
        )
    except PublishError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if isinstance(result, HeldResult):
        return {"held": True, "decision": dataclasses.asdict(result.decision)}
    return {"held": False, **dataclasses.asdict(result)}


@app.post("/dedupe/check")
def dedupe_check(normalized: NormalizedQuestion):
    """
    docs/roadmap/engineering-roadmap.md item 20: the one deduplication implementation, reachable
    over HTTP for callers (packages/api's admin.router.ts) that used to run their own, weaker
    ilike-based check directly against the database instead.
    """
    decision = check_duplicate(normalized)
    return dataclasses.asdict(decision)
