import os
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
    max_questions: Optional[int] = 50
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

@app.get("/scrape/logs")
async def get_logs_endpoint():
    """
    Returns the latest scraper execution logs for admin progress telemetry.
    """
    log_path = "/tmp/ms_learn_scraper.log"
    logs = []
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                logs = [line.strip() for line in lines[-150:] if line.strip()]
        except Exception as e:
            logs = [f"[LOG ERROR]: Could not read log file: {e}"]
    else:
        logs = ["[SYSTEM]: No execution logs initialized yet. Trigger a scrape job to generate progress telemetry."]
    
    return {
        "status": "success",
        "log_file": log_path,
        "lines_count": len(logs),
        "logs": logs
    }

@app.get("/scrape/ms-learn/catalog")
async def ms_learn_catalog_endpoint():
    """
    Fetches the catalog of Microsoft Learn Practice Assessments and returns available exam tests.
    """
    from ms_learn_catalog_crawler import fetch_ms_learn_catalog
    catalog = fetch_ms_learn_catalog()
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
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch Microsoft Auth session: {str(e)}")

seen_jobs = set()

@app.post("/scrape")
async def scrape_endpoint(req: ScrapeRequest):
    if req.job_id:
        if req.job_id in seen_jobs:
            print(f"[IDEMPOTENCY] Ignoring duplicate scrape job {req.job_id}")
            return {"status": "success", "extracted_count": 0, "db_saved": True, "message": "Duplicate ignored", "extractedElements": []}
        seen_jobs.add(req.job_id)

    if not req.url:
        raise HTTPException(status_code=400, detail="Target URL is required for scraping.")

    # Reject the request up front if the URL isn't safe to fetch server-side
    # (wrong scheme, host not on SCRAPER_ALLOWED_HOSTS, or resolves to a
    # loopback/private/link-local address such as cloud metadata). This
    # covers both branches below — the Playwright path uses page.goto()
    # rather than requests, so it can't route through safe_get().
    assert_safe_url(req.url)

    # SPECIALIZED PLAYWRIGHT BRANCH: Microsoft Learn Assessment Crawler
    if "learn.microsoft.com" in req.url or "microsoft.com" in req.url:
        is_headless = req.headless if req.headless is not None else True
        print(f"[MS LEARN PLAYWRIGHT SCRAPE] Target URL: {req.url} | Headless: {is_headless}")
        try:
            from ms_learn_catalog_crawler import crawl_ms_learn_assessment
            unique_questions = await crawl_ms_learn_assessment(
                assessment_url=req.url,
                exam=req.target_exam or "MS Learn AB-100",
                subject=req.target_subject or "Agentic AI Business Solutions Architect",
                max_questions=req.max_questions or 50,
                headless=is_headless
            )
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
                }
            }
        except Exception as ms_err:
            print(f"[MS LEARN PLAYWRIGHT FALLBACK]: {ms_err}. Falling back to HTTP handler...")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }

    # MODE 1: Specific Target URL Ingestion
    print(f"[TARGET SCRAPE] URL: {req.url} | Mode: {req.parser_mode}")
    try:
        response = safe_get(req.url, headers=headers, timeout=12)
        response.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch target URL: {str(e)}")

    unique_questions = parse_html_for_questions(response.text, req.url, req.target_exam, req.target_subject, req.parser_mode)

    inserted_id = insert_scraped_question(
        source_url=req.url,
        raw_data=response.text[:2000],
        parsed_data={
            "extractedElements": unique_questions,
            "metadata": {
                "exam": req.target_exam,
                "subject": req.target_subject,
                "parserMode": req.parser_mode,
                "count": len(unique_questions)
            }
        },
    )
    db_saved = inserted_id is not None

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
        }
    }
