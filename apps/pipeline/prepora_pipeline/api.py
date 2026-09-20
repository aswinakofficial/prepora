"""
Minimal HTTP wrapper around apps/pipeline's stages, for callers that cannot shell out to the CLI —
per docs/architecture/prepora-next-level-plan.md §17's "CLI-first, HTTP-second" principle, this
calls the same publish_question() the CLI's `publish` subcommand calls, rather than duplicating it.

The one caller this exists for today: packages/api's admin.router.ts, which runs in a Cloudflare
Worker and therefore cannot spawn subprocesses — it must reach this pipeline over HTTP, the same
way it already reaches apps/scraper (see fetchScraper() and PIPELINE_SERVICE_TOKEN).
"""
import dataclasses

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException

from .contracts import NormalizedQuestion
from .core.security import require_service_token
from .stages.publish import PublishError, publish_question

load_dotenv()

app = FastAPI(
    title="Prepora Pipeline Service",
    dependencies=[Depends(require_service_token)],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Prepora Pipeline Service"}


@app.post("/publish")
async def publish(normalized: NormalizedQuestion):
    try:
        result = publish_question(normalized)
    except PublishError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return dataclasses.asdict(result)
