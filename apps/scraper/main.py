import asyncio
import sys
import uuid
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_db_connection, insert_scraped_question
from handlers import get_handler_for_url
from security import assert_safe_url, cors_allowed_origins, require_service_token, safe_get

load_dotenv()

# Importing settings validates required configuration (DATABASE_URL) immediately — this service
# refuses to start at all rather than start in a state where its core job (persisting scraped
# content) will silently fail on every request. See settings.py and roadmap item 7.
import settings as _settings  # noqa: F401,E402 — imported after load_dotenv() for its validation side effect

# apps/pipeline is the eventual home for this service (docs/architecture/prepora-next-level-plan.md
# §17 — "apps/pipeline absorbs apps/scraper"), and its durable job model
# (docs/roadmap/engineering-roadmap.md item 13) is what this service's job tracking needs today, not
# a second, drifting copy of the same ~250 lines. Importing it by path rather than duplicating it is
# a deliberate, temporary bridge until that merge happens.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from prepora_pipeline.core import (  # noqa: E402
    cancel_queued_run,
    claim_next_queued_job,
    complete_job,
    create_job,
    finalize_job,
    get_job,
    record_stage,
    requeue_interrupted_jobs,
    stage_run,
    start_job,
)

# Every endpoint on this service requires a valid PIPELINE_SERVICE_TOKEN
# bearer token (see security.py). There is no unauthenticated endpoint,
# including /health — this service has no legitimate public caller.
app = FastAPI(
    title="Prepora Web Scraper Microservice Engine",
    dependencies=[Depends(require_service_token)],
)

# CORS origins are configured, not wildcarded — see SCRAPER_CORS_ORIGINS
# in .env.example. Wildcard origins combined with credentials (the prior
# configuration) is both an invalid combination browsers reject and a
# signal this was never exercised as designed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScrapeRequest(BaseModel):
    url: str
    parser_mode: Optional[str] = "mcq" # "mcq" | "paragraph" | "auto"
    target_exam: Optional[str] = "Kerala PSC AE Civil"
    target_subject: Optional[str] = "Strength of Materials"
    # None = no cap: scrape the whole assessment (the default).
    max_questions: Optional[int] = None
    job_id: Optional[str] = None
    headless: Optional[bool] = True


def parse_html_for_questions(html: str, target_url: str, exam: str, subject: str, parser_mode: str) -> List[dict]:
    handler = get_handler_for_url(target_url)
    return handler.parse_questions(html, target_url, exam, subject, parser_mode)

@app.get("/health")
async def health_check():
    db_conn = get_db_connection()
    db_status = "connected" if db_conn else "disconnected"
    if db_conn:
        db_conn.close()
    return {
        "status": "healthy",
        "service": "Prepora Scraper Engine (Modular Handlers active)",
        "db_status": db_status,
        "capabilities": ["target_url_scrape", "modular_site_adapters", "ms_learn_catalog_discovery", "playwright_persistent_auth", "headless_mode_toggle", "live_logs_telemetry"]
    }

@app.get("/scrape/ms-learn/catalog")
async def ms_learn_catalog_endpoint():
    """
    Fetches the catalog of Microsoft Learn Practice Assessments and returns available exam tests.
    """
    from ms_learn_catalog_crawler import fetch_ms_learn_catalog
    # Blocking HTTP (the catalog plus each exam's retirement check) — off the event loop, which
    # the queue worker's crawl shares.
    catalog = await asyncio.to_thread(fetch_ms_learn_catalog)
    return {
        "status": "success",
        "catalog_count": len(catalog),
        "catalog": catalog
    }

@app.post("/scrape/ms-learn/auth")
async def ms_learn_auth_endpoint():
    """
    Launches an interactive Playwright browser window to allow the admin to log in with their Microsoft Account.
    Saves persistent session storage for automated scraping.
    """
    from ms_learn_catalog_crawler import launch_interactive_auth_session
    try:
        res = await launch_interactive_auth_session()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch Microsoft Auth session: {str(e)}")
    if res.get("status") == "already_in_progress":
        raise HTTPException(
            status_code=409,
            detail="A Microsoft sign-in window is already open — finish signing in there.",
        )
    return res

@app.get("/scrape/ms-learn/auth/status")
async def ms_learn_auth_status_endpoint():
    """Whether an authenticated MS Learn tab from a previous login is still open and reusable."""
    from ms_learn_catalog_crawler import get_auth_status
    return await get_auth_status()

@app.post("/scrape/ms-learn/auth/signout")
async def ms_learn_auth_signout_endpoint():
    """Closes the currently open authenticated MS Learn tab, discarding the session."""
    from ms_learn_catalog_crawler import sign_out
    await sign_out()
    return {"status": "signed_out"}

@app.post("/scrape")
async def scrape_endpoint(req: ScrapeRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="Target URL is required for scraping.")

    # Reject the request up front if the URL isn't safe to fetch server-side
    # (wrong scheme, host not on SCRAPER_ALLOWED_HOSTS, or resolves to a
    # loopback/private/link-local address such as cloud metadata). This
    # covers both branches below — the Playwright path uses page.goto()
    # rather than requests, so it can't route through safe_get().
    assert_safe_url(req.url)

    is_ms_learn = "learn.microsoft.com" in req.url or "microsoft.com" in req.url

    # A database-backed job record replaces the old in-memory `seen_jobs` set (docs/roadmap/
    # engineering-roadmap.md item 13) — create_job() is itself idempotent on req.job_id, so a
    # resubmission with the same job_id returns the same job row rather than creating a second
    # one. Whether it's a genuine resubmission (vs. a fresh job) is decided by the job's status:
    # a freshly-created job is always "queued"; anything else means a prior request already
    # claimed and progressed this job_id.
    job_id = create_job(
        source_id="ms-learn" if is_ms_learn else "generic",
        job_type="scrape",
        trigger_type="manual",
        configuration={
            "url": req.url,
            "parser_mode": req.parser_mode,
            "target_exam": req.target_exam,
            "target_subject": req.target_subject,
            "max_questions": req.max_questions,
        },
        idempotency_key=req.job_id,
    )
    if get_job(job_id).status != "queued":
        print(f"[IDEMPOTENCY] Ignoring duplicate scrape job {req.job_id!r} (pipeline job {job_id})")
        return {
            "status": "success",
            "extracted_count": 0,
            "db_saved": True,
            "message": "Duplicate ignored",
            "extractedElements": [],
            "job_id": job_id,
        }

    start_job(job_id)
    return await run_scrape(job_id, req)


async def run_scrape(job_id: str, req: ScrapeRequest) -> dict:
    """Runs one scrape for an already-started job: the single-exam POST /scrape above, and the
    queue worker below for bulk runs. Records progress and the final status on the job."""
    is_ms_learn = "learn.microsoft.com" in req.url or "microsoft.com" in req.url

    # SPECIALIZED PLAYWRIGHT BRANCH: Microsoft Learn Assessment Crawler
    if is_ms_learn:
        is_headless = req.headless if req.headless is not None else True
        print(f"[MS LEARN PLAYWRIGHT SCRAPE] Target URL: {req.url} | Headless: {is_headless}")
        from ms_learn_catalog_crawler import AssessmentUnavailable, crawl_ms_learn_assessment

        try:
            with stage_run(job_id, "scrape") as counts:
                # A single crawl can take several minutes (up to 50 questions, each a real
                # browser interaction) — without this, the stage row sits at all-zero "running"
                # for the whole duration and only reflects real progress once the entire crawl
                # finishes. record_stage's upsert is safe to call repeatedly mid-flight, so the
                # admin UI's existing 1.5s poll picks up live counts for free.
                # Replaced by the assessment's real length ("Question 1 of N") once the crawler
                # has read it.
                counts.discovered = req.max_questions or 0

                def report_progress(processed: int) -> None:
                    counts.processed = processed
                    record_stage(job_id, "scrape", "running", counts=counts)

                def report_total(total: int) -> None:
                    counts.discovered = total
                    record_stage(job_id, "scrape", "running", counts=counts)

                unique_questions = await crawl_ms_learn_assessment(
                    assessment_url=req.url,
                    exam=req.target_exam or "MS Learn AB-100",
                    subject=req.target_subject or "Agentic AI Business Solutions Architect",
                    max_questions=req.max_questions,
                    headless=is_headless,
                    on_progress=report_progress,
                    on_total=report_total,
                    job_id=job_id,
                )
                counts.processed = len(unique_questions)
            finalize_job(job_id)
            return {
                "status": "success",
                "mode": "playwright_ms_learn",
                "url": req.url,
                "extracted_count": len(unique_questions),
                "db_saved": True,
                "extractedElements": unique_questions,
                "metadata": {
                    "targetExam": req.target_exam,
                    "targetSubject": req.target_subject,
                    "engine": "Playwright Dynamic Web Crawler"
                },
                "job_id": job_id,
            }
        except AssessmentUnavailable as unavailable:
            # Nothing to fall back to: the generic HTML handler can't find questions on a page that
            # has none. Fail the job with the reason (stage_run recorded it on the stage too), but
            # not via finalize_job: that would count a failed crawl against MS Learn's source
            # health, and Microsoft answered fine — the exam is just retired.
            complete_job(job_id, "failed", error_summary=str(unavailable))
            raise HTTPException(status_code=422, detail=str(unavailable)) from unavailable
        except Exception as ms_err:
            # stage_run already recorded the "scrape" stage as failed with this error — the job
            # itself stays open (not finalized) since we're falling through to the generic
            # handler under the same job, not abandoning it.
            print(f"[MS LEARN PLAYWRIGHT FALLBACK]: {ms_err}. Falling back to HTTP handler...")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }

    # MODE 1: Specific Target URL Ingestion
    print(f"[TARGET SCRAPE] URL: {req.url} | Mode: {req.parser_mode}")
    try:
        with stage_run(job_id, "fetch_and_parse") as counts:
            try:
                response = safe_get(req.url, headers=headers, timeout=12)
                response.raise_for_status()
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to fetch target URL: {str(e)}") from e

            unique_questions = parse_html_for_questions(response.text, req.url, req.target_exam, req.target_subject, req.parser_mode)
            counts.processed = len(unique_questions)
    except HTTPException:
        finalize_job(job_id)
        raise
    except Exception as e:
        finalize_job(job_id)
        raise HTTPException(status_code=400, detail=f"Scrape failed: {str(e)}") from e

    with stage_run(job_id, "publish") as counts:
        inserted_id = insert_scraped_question(
            source_url=req.url,
            raw_data=response.text[:2000],
            parsed_data={
                "extractedElements": unique_questions,
                "metadata": {
                    "exam": req.target_exam,
                    "subject": req.target_subject,
                    "parserMode": req.parser_mode,
                    "count": len(unique_questions),
                    "jobId": job_id,
                }
            },
        )
        db_saved = inserted_id is not None
        counts.processed = 1 if db_saved else 0
        counts.failed = 0 if db_saved else 1

    finalize_job(job_id)

    return {
        "status": "success",
        "mode": "target_url",
        "url": req.url,
        "extracted_count": len(unique_questions),
        "db_saved": db_saved,
        "extractedElements": unique_questions,
        "metadata": {
            "targetExam": req.target_exam,
            "targetSubject": req.target_subject,
            "parserMode": req.parser_mode,
        },
        "job_id": job_id,
    }


# ─── Queued bulk runs ─────────────────────────────────────────────────────────────────────────
# "Scrape these 43 exams" used to be a loop in the admin's browser tab, so refreshing or closing the
# page silently stopped the run. Now the admin page queues every exam as a job in one request
# (POST /scrape/queue) and this service works through the queue on its own — one exam at a time,
# surviving page refreshes and, via requeue at startup, its own restarts.

QUEUE_JOB_TYPE = "scrape"
QUEUE_IDLE_SECONDS = 3


class QueueItem(BaseModel):
    url: str
    target_exam: Optional[str] = None
    target_subject: Optional[str] = "Microsoft Certification"


class QueueRequest(BaseModel):
    items: List[QueueItem]
    max_questions: Optional[int] = None
    headless: Optional[bool] = True
    requested_by: Optional[str] = None


@app.post("/scrape/queue")
async def queue_scrape_run(req: QueueRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="Nothing to scrape.")
    for item in req.items:
        assert_safe_url(item.url)  # refuse the whole run up front rather than failing mid-way
    run_id = str(uuid.uuid4())
    for position, item in enumerate(req.items):
        is_ms_learn = "microsoft.com" in item.url
        create_job(
            source_id="ms-learn" if is_ms_learn else "generic",
            job_type=QUEUE_JOB_TYPE,
            trigger_type="bulk",
            requested_by=req.requested_by,
            configuration={
                "url": item.url,
                "parser_mode": "mcq",
                "target_exam": item.target_exam,
                "target_subject": item.target_subject,
                "max_questions": req.max_questions,
                "headless": req.headless,
            },
            run_id=run_id,
            run_position=position,
        )
    print(f"[SCRAPE QUEUE] Queued run {run_id} with {len(req.items)} job(s)")
    return {"run_id": run_id, "queued": len(req.items)}


@app.post("/scrape/queue/{run_id}/cancel")
async def cancel_scrape_run(run_id: str):
    cancelled = cancel_queued_run(run_id)
    print(f"[SCRAPE QUEUE] Cancelled {cancelled} queued job(s) in run {run_id}")
    return {"run_id": run_id, "cancelled": cancelled}


async def queue_worker() -> None:
    """Claims queued bulk-run jobs one at a time and scrapes them. A failure is recorded on that job
    and the worker moves on to the next, so one bad exam never stalls the rest of the run."""
    requeued = await asyncio.to_thread(requeue_interrupted_jobs, job_type=QUEUE_JOB_TYPE)
    if requeued:
        print(f"[SCRAPE QUEUE] Re-queued {requeued} job(s) interrupted by a restart")
    while True:
        try:
            job = await asyncio.to_thread(claim_next_queued_job, job_type=QUEUE_JOB_TYPE)
        except Exception as err:  # database briefly unreachable: back off and try again
            print(f"[SCRAPE QUEUE] Couldn't check the queue: {err}")
            await asyncio.sleep(QUEUE_IDLE_SECONDS * 5)
            continue
        if job is None:
            await asyncio.sleep(QUEUE_IDLE_SECONDS)
            continue
        config = job.configuration or {}
        print(f"[SCRAPE QUEUE] Starting job {job.id}: {config.get('target_exam')} {config.get('url')}")
        try:
            await run_scrape(
                job.id,
                ScrapeRequest(
                    url=config["url"],
                    parser_mode=config.get("parser_mode") or "mcq",
                    target_exam=config.get("target_exam"),
                    target_subject=config.get("target_subject"),
                    max_questions=config.get("max_questions"),
                    job_id=job.id,
                    headless=config.get("headless", True),
                ),
            )
        except Exception as err:
            detail = getattr(err, "detail", None) or str(err)
            print(f"[SCRAPE QUEUE] Job {job.id} failed: {detail}")
            await asyncio.to_thread(complete_job, job.id, "failed", error_summary=str(detail)[:500])


@app.on_event("startup")
async def start_queue_worker() -> None:
    app.state.queue_worker = asyncio.create_task(queue_worker())

