import asyncio
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from prepora_pipeline.core.media_store import FilesystemMediaStore  # noqa: E402

from db import insert_scraped_question  # noqa: E402
from ms_learn_media import MediaFetchError, store_question_images  # noqa: E402
from ms_learn_parser import MsLearnParseError, parse_question_fieldset  # noqa: E402

load_dotenv("../../.env")
load_dotenv()

CATALOG_URL = "https://learn.microsoft.com/en-us/credentials/certifications/practice-assessments-for-microsoft-certifications"
USER_DATA_DIR = os.path.expanduser("~/.cache/ms_learn_scraper_profile")
STORAGE_STATE_PATH = os.path.join(USER_DATA_DIR, "storage_state.json")
LOG_FILE_PATH = "/tmp/ms_learn_scraper.log"


async def get_auth_status() -> dict:
    """
    Whether a saved MS Learn session exists that a later scrape can restore. The file merely
    existing isn't enough — an anonymous session once got saved by mistake — so this also
    requires MS Learn's MSAL.js to have recorded a signed-in account (`msal.*account.keys` in
    learn.microsoft.com's localStorage), which an anonymous visit never writes.
    """
    try:
        with open(STORAGE_STATE_PATH) as f:
            state = json.load(f)
    except (FileNotFoundError, ValueError):
        return {"authenticated": False}
    for origin in state.get("origins", []):
        if "learn.microsoft.com" not in origin.get("origin", ""):
            continue
        for item in origin.get("localStorage", []):
            name = item.get("name", "")
            if name.startswith("msal.") and name.endswith("account.keys") and item.get("value") not in (None, "", "[]"):
                return {"authenticated": True}
    return {"authenticated": False}


async def sign_out():
    """Discards the saved MS Learn session so the next scrape requires a fresh interactive login."""
    try:
        os.remove(STORAGE_STATE_PATH)
    except FileNotFoundError:
        pass


def log(msg: str):
    timestamped_msg = f"{msg}"
    sys.stderr.write(timestamped_msg + "\n")
    sys.stderr.flush()
    try:
        with open(LOG_FILE_PATH, "a") as f:
            f.write(timestamped_msg + "\n")
    except Exception:
        pass

def fetch_ms_learn_catalog() -> list:
    """
    Parses the Microsoft Learn Practice Assessment catalog page and extracts
    all available certification practice test URLs and exam titles.
    """
    print(f"[MS LEARN CATALOG]: Fetching practice assessment catalog from {CATALOG_URL}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    catalog_items = []
    try:
        res = requests.get(CATALOG_URL, headers=headers, timeout=15)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")

        # Extract links pointing to assessment / practice test pages
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            text = a_tag.get_text(strip=True)
            
            # Match links for certifications/exams practice assessments
            if "/practice/assessment" in href or ("practice-assessment" in href and "certifications" in href):
                full_url = href if href.startswith("http") else f"https://learn.microsoft.com{href}"
                
                # Try extracting Exam code (e.g., AZ-900, AB-100, AI-102, DP-900, PL-300)
                exam_code_match = re.search(r'\b([A-Z]{2,3}-\d{3,4})\b', text or full_url, re.IGNORECASE)
                exam_code = exam_code_match.group(1).upper() if exam_code_match else "MS-CERT"
                
                if not any(item["url"] == full_url for item in catalog_items):
                    catalog_items.append({
                        "title": text or f"Microsoft Exam {exam_code} Practice Assessment",
                        "exam": exam_code,
                        "url": full_url,
                        "requiresAuth": True
                    })

        # Fallback preset list if catalog HTML structure is dynamically loaded via JavaScript
        if not catalog_items:
            print("[MS LEARN CATALOG]: Static parse empty, injecting curated Microsoft Learn assessment catalog presets...")
            catalog_items = [
                {
                    "title": "Practice Assessment for Exam AB-100: Agentic AI Business Solutions Architect",
                    "exam": "AB-100",
                    "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/ab-100/practice/assessment?assessment-type=practice&assessmentId=1815645847&practice-assessment-type=certification&source=docs",
                    "requiresAuth": True
                },
                {
                    "title": "Practice Assessment for Exam AZ-900: Microsoft Azure Fundamentals",
                    "exam": "AZ-900",
                    "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-900/practice/assessment",
                    "requiresAuth": True
                },
                {
                    "title": "Practice Assessment for Exam AI-102: Designing and Implementing a Microsoft Azure AI Solution",
                    "exam": "AI-102",
                    "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/ai-102/practice/assessment",
                    "requiresAuth": True
                },
                {
                    "title": "Practice Assessment for Exam DP-900: Microsoft Azure Data Fundamentals",
                    "exam": "DP-900",
                    "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/dp-900/practice/assessment",
                    "requiresAuth": True
                },
                {
                    "title": "Practice Assessment for Exam PL-300: Microsoft Power BI Data Analyst",
                    "exam": "PL-300",
                    "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/pl-300/practice/assessment",
                    "requiresAuth": True
                }
            ]

    except Exception as e:
        print(f"[MS LEARN CATALOG ERROR]: {e}")
        catalog_items = [
            {
                "title": "Practice Assessment for Exam AB-100: Agentic AI Solutions",
                "exam": "AB-100",
                "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/ab-100/practice/assessment?assessment-type=practice&assessmentId=1815645847&practice-assessment-type=certification&source=docs",
                "requiresAuth": True
            }
        ]

    notices = exam_retirement_notices([item["exam"] for item in catalog_items])
    for item in catalog_items:
        item["retired"] = notices.get(item["exam"])
    return catalog_items


# ─── Retired exams ───────────────────────────────────────────────────────────────────────────
# Microsoft's practice-assessment catalog keeps listing an exam for a while after the exam itself
# is retired, but its assessment is gone: the link redirects to the Credentials home page (AI-900)
# or loads a page that never shows a question (MB-240). Scraping one used to "complete" with 0
# questions — indistinguishable from success at a glance. The exam's own overview page is the
# reliable signal: it carries a Warning box saying the exam is retired.

_RETIRED = re.compile(r"\b(?:was|were|is|are|has been|have been)\s+retired\b", re.I)
_EXAM_CODE = re.compile(r"\b([A-Z]{2,3}-\d{3,4})\b", re.I)
_RETIREMENT_CACHE_SECONDS = 6 * 60 * 60
_retirement_cache: dict[str, tuple[float, Optional[str]]] = {}


def retirement_notice(page_html: str) -> Optional[str]:
    """
    The retirement sentence(s) from an MS Learn exam page's Warning box — "The AI-900 exam was
    retired on June 30, 2026, and has been replaced by AI-901." — or None if the exam isn't
    retired. Only a past-tense statement counts: "This exam will be retired on …" announces a
    retirement that hasn't happened, and its assessment still works until then.
    """
    soup = BeautifulSoup(page_html, "html.parser")
    for box in soup.find_all("div", class_=re.compile(r"^warning$", re.I)):
        text = re.sub(r"^Warning\s*", "", box.get_text(" ", strip=True))
        if not _RETIRED.search(text):
            continue
        sentences = [
            sentence.strip()
            for sentence in re.findall(r"[^.!?]+[.!?]?", text)
            if re.search(r"retired|replaced by", sentence, re.I)
        ]
        return " ".join(sentences) or "This exam is retired."
    return None


def exam_retirement_notice(exam_code: str) -> Optional[str]:
    """retirement_notice() for an exam code ("AI-900"), cached for a few hours. A page that can't
    be fetched counts as not retired and isn't cached, so it's checked again next time."""
    code = exam_code.upper()
    cached = _retirement_cache.get(code)
    if cached and time.time() - cached[0] < _RETIREMENT_CACHE_SECONDS:
        return cached[1]
    url = f"https://learn.microsoft.com/en-us/credentials/certifications/exams/{code.lower()}/"
    try:
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=10)
    except requests.RequestException as err:
        log(f"[MS LEARN CATALOG WARNING]: Couldn't check whether {code} is retired: {err}")
        return None
    if res.status_code != 200:
        return None
    notice = retirement_notice(res.text)
    _retirement_cache[code] = (time.time(), notice)
    return notice


def exam_retirement_notices(exam_codes: list[str]) -> dict[str, Optional[str]]:
    """exam_retirement_notice() for many codes at once, fetched in parallel (the catalog lists
    ~60 exams; one at a time that's half a minute)."""
    codes = sorted({c.upper() for c in exam_codes if _EXAM_CODE.fullmatch(c)})
    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(zip(codes, pool.map(exam_retirement_notice, codes)))


class AssessmentUnavailable(Exception):
    """The practice assessment showed no questions at all — retired, removed, or never loaded.
    Raised instead of returning an empty list, so the job fails with the reason rather than
    completing with 0 questions."""


def _unavailable_reason(assessment_url: str, exam: str, final_url: str) -> str:
    code_match = _EXAM_CODE.search(f"{exam} {assessment_url}")
    notice = exam_retirement_notice(code_match.group(1)) if code_match else None
    if notice:
        return f"Practice assessment not available — the exam is retired on Microsoft Learn: {notice}"
    if "/practice/assessment" not in final_url:
        return (
            "Practice assessment not available — Microsoft Learn redirected it to "
            f"{final_url}. It may have been removed."
        )
    return "No questions found — the practice assessment page never showed a question."


# MS Learn renders several "Sign in" links (desktop header, mobile header, in-page CTA) and hides
# whichever don't fit the current viewport. query_selector() returns the first match in document
# order — at this crawler's 1400px viewport that's the hidden mobile-header link — so a visibility
# check on that single match wrongly concluded there was no sign-in control at all. Always pick
# the first *visible* match instead.
SIGNIN_SELECTOR = "a.docs-sign-in, a[href*='identity/signin'], button:has-text('Sign in'), a:has-text('Sign in')"

IDENTITY_DOMAINS = (
    "login.microsoftonline.com",
    "login.live.com",
    "account.microsoft.com",
    "login.windows.net",
)

# Only one interactive login window at a time — a second click on "Authenticate" used to start a
# second headful browser polling in parallel with the first, each able to overwrite the other's
# saved storage state.
_auth_lock = asyncio.Lock()


async def _find_visible_signin(page):
    for el in await page.query_selector_all(SIGNIN_SELECTOR):
        try:
            if await el.is_visible():
                return el
        except Exception:
            continue
    return None


# Microsoft reuses id="idSIButton9" for the primary button on every step of its login flow —
# "Next" on the email page, "Sign in" on the password page, "Yes" only on "Stay signed in?". The
# old "#idSIButton9, button:has-text('Yes')" selector therefore clicked "Next"/"Sign in" every
# poll while the admin was still typing, submitting half-entered email/password forms. Only click
# once the page really is the "Stay signed in?" (KMSI) prompt.
KMSI_PAGE_SELECTOR = "#KmsiCheckboxField, #KmsiDescription, input[name='DontShowAgain'], :text('Stay signed in?')"


async def _click_stay_signed_in_yes(page) -> bool:
    try:
        marker = await page.query_selector(KMSI_PAGE_SELECTOR)
        if not marker or not await marker.is_visible():
            return False
        yes = await page.query_selector("#idSIButton9, button:has-text('Yes'), input[type='submit'][value='Yes']")
        if yes and await yes.is_visible():
            await yes.click()
            return True
    except Exception:
        pass
    return False


async def _learn_page_shows_signed_in(page) -> bool:
    """
    Whether MS Learn's own header considers the user signed in. Its sign-in links carry
    `auth-status-determined` once the page's MSAL instance has resolved auth state; until then
    they're not a reliable signal either way, so wait briefly for that before judging.
    """
    try:
        await page.wait_for_selector(".auth-status-determined", state="attached", timeout=10000)
    except Exception:
        pass
    return await _find_visible_signin(page) is None


async def launch_interactive_auth_session():
    """
    Launches a headful Chromium browser window for the admin to sign in to Microsoft Learn using
    the site's own MSAL sign-in flow, and persists the session only once sign-in genuinely
    completed.
    """
    if _auth_lock.locked():
        return {"status": "already_in_progress", "authenticated": False}
    async with _auth_lock:
        return await _run_interactive_auth_session()


async def _run_interactive_auth_session():
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    print("[MS LEARN AUTH]: Launching Playwright browser for Microsoft Account authentication...")
    print(f"[MS LEARN AUTH]: Storage state will be saved to: {STORAGE_STATE_PATH}")

    # A plain launch()+new_context() (rather than launch_persistent_context against a profile
    # directory) lets us close the browser completely once login succeeds, while still reliably
    # handing the exact same cookies + localStorage to whatever later launches a scrape — headless
    # or headful — via context.storage_state(). A persistent profile directory made "close now,
    # resume reliably later" much harder to reason about (ProcessSingleton contention between
    # concurrent launches, ambiguous retention of session-only cookies across relaunches).
    p = await async_playwright().start()
    browser = await p.chromium.launch(headless=False)
    context = await browser.new_context(viewport={"width": 1400, "height": 900})
    # Microsoft's OAuth completion page (identity-redirect.html) calls window.close() on itself —
    # see the same guard in crawl_ms_learn_assessment. Without it here, the login tab could close
    # itself mid-flow, before the admin finished signing in.
    await context.add_init_script("window.close = () => {};")
    page = await context.new_page()
    try:
        # Navigate to the real catalog page and let ITS OWN MSAL.js instance initiate the OAuth
        # redirect, instead of hand-crafting an authorize URL ourselves: a fabricated URL with a
        # hardcoded nonce/state/code_challenge authenticates against Microsoft's identity server,
        # but no MSAL.js instance is expecting that state/PKCE pair, so the page's own token cache
        # never gets populated.
        print(f"[MS LEARN AUTH]: Opening the real catalog page ({CATALOG_URL}) so its own sign-in flow drives the redirect...")
        await page.goto(CATALOG_URL)
        try:
            await page.wait_for_selector(".auth-status-determined", state="attached", timeout=10000)
        except Exception:
            pass

        signin_button = await _find_visible_signin(page)
        if signin_button:
            print("[MS LEARN AUTH]: Clicking the page's own 'Sign in' control...")
            await signin_button.click()
            await page.wait_for_timeout(2000)
        else:
            print("[MS LEARN AUTH]: No visible 'Sign in' control — the admin can use the page's own sign-in in the open window.")

        print("[MS LEARN AUTH]: Waiting for admin to complete Microsoft Online login (up to 180 seconds)...")

        # Success used to be "the tab's URL is on learn.microsoft.com" — which is already true on
        # the catalog page before anyone signs in, so whenever the Sign-in click didn't navigate
        # away (see SIGNIN_SELECTOR), the very first poll reported success, closed the browser and
        # saved an anonymous session. Now success requires all of: the flow actually went through
        # a Microsoft identity page, it came back to learn.microsoft.com, and MS Learn's own header
        # no longer offers "Sign in". Microsoft's flow also hops across several identity domains
        # (login.live.com for FIDO/passkeys) — none of those count as done.
        authenticated = False
        visited_identity = any(d in page.url for d in IDENTITY_DOMAINS)
        for i in range(36):
            await asyncio.sleep(5)

            # Some completions finish in a new tab and close the original one.
            if page.is_closed():
                live_pages = [pg for pg in context.pages if not pg.is_closed()]
                if not live_pages:
                    print("[MS LEARN AUTH]: The login window was closed before sign-in completed.")
                    break
                page = live_pages[-1]

            current_url = page.url
            print(f"[MS LEARN AUTH POLL {i+1}/36]: Current page URL -> {current_url}")

            if any(d in current_url for d in IDENTITY_DOMAINS):
                visited_identity = True
                # Proactively click through "Stay signed in?" — skipping it leaves only a
                # session-only SSO cookie, which doesn't survive into later scrape contexts.
                if await _click_stay_signed_in_yes(page):
                    print("[MS LEARN AUTH]: 'Stay signed in?' prompt detected mid-flow — clicked Yes.")
                continue

            if (
                visited_identity
                and "learn.microsoft.com" in current_url
                and await _learn_page_shows_signed_in(page)
            ):
                print("[MS LEARN AUTH SUCCESS]: MS Learn now shows the account as signed in.")
                authenticated = True
                break

        if authenticated:
            await context.storage_state(path=STORAGE_STATE_PATH)
            print(f"[MS LEARN AUTH]: Saved storage state to {STORAGE_STATE_PATH}")
        else:
            print("[MS LEARN AUTH]: Sign-in not completed — no session saved.")

        return {
            "status": "authenticated" if authenticated else "pending_user_login",
            "authenticated": authenticated,
        }
    finally:
        # Always close fully, whether login succeeded, timed out, or errored — nothing needs to
        # stay open between requests anymore.
        await context.close()
        await browser.close()
        await p.stop()


_EXAM_CODE_PREFIX = re.compile(r"^Exam\s+[A-Z]{2,3}-\d{3,4}\s*:\s*", re.I)


def fetch_exam_overview_metadata(assessment_url: str) -> tuple[str, str, str]:
    """
    Official (title, description, badge logo URL) for the exam an assessment URL belongs to, or
    empty strings for whatever couldn't be found.

    Assessments live under either a certification page
    (.../certifications/ai-business-professional/practice/assessment?...) or an exam page
    (.../certifications/exams/ab-100/practice/assessment?...). The certification page is the best
    source — it has the real name ("Microsoft Certified: AI Business Professional") and the
    certification's own badge — so it's tried first. This used to take *everything* after
    "certifications/" as the certification path, so it fetched the assessment page itself and
    came back with "Practice Assessment" as the description and Microsoft Learn's generic
    share image as the logo. An exam page (/exams/<code>/) redirects to its certification page
    when the exam maps to exactly one; otherwise its own title and the official exam badge are
    used, with the leading "Exam AB-100: " dropped since the code is shown separately.
    """
    meta_urls = []
    cert_match = re.search(r"credentials/certifications/(?!exams/)([a-z0-9-]+)", assessment_url, re.I)
    if cert_match:
        meta_urls.append(f"https://learn.microsoft.com/en-us/credentials/certifications/{cert_match.group(1)}/")
    exam_code_match = re.search(r"\b([a-z]{2,3}-\d{3,4})\b", assessment_url, re.I)
    if exam_code_match:
        meta_urls.append(
            f"https://learn.microsoft.com/en-us/credentials/certifications/exams/{exam_code_match.group(1).lower()}/"
        )

    title = desc = logo = ""
    for meta_url in meta_urls:
        try:
            log(f"[MS LEARN CRAWLER]: Fetching exam overview metadata from {meta_url}...")
            res = requests.get(meta_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=10)
            if res.status_code != 200:
                continue
            soup = BeautifulSoup(res.text, "html.parser")

            h1 = soup.find("h1")
            page_title = _EXAM_CODE_PREFIX.sub("", h1.get_text(" ", strip=True)) if h1 else ""
            # Only a real badge counts — og:image is Microsoft Learn's generic share image on
            # every page, which is what got stored as the "logo" before.
            badge = soup.find("img", attrs={"src": re.compile(r"/badges/", re.I)})
            page_logo = ""
            if badge and badge.get("src"):
                src = badge["src"]
                page_logo = src if src.startswith("http") else f"https://learn.microsoft.com{src}"
            desc_tag = soup.find("meta", attrs={"name": "description"})
            page_desc = desc_tag["content"].strip() if desc_tag and desc_tag.get("content") else ""

            title = title or page_title
            logo = logo or page_logo
            desc = desc or page_desc
            log(f"[MS LEARN CRAWLER]: Overview metadata -> title: {page_title!r} | logo: {page_logo!r}")
            if title and logo and desc:
                break
        except Exception as meta_err:
            log(f"[MS LEARN CRAWLER WARNING]: Could not fetch exam overview metadata from {meta_url}: {meta_err}")
    return title, desc, logo


# Upper bound on questions per run when no max_questions is given — well above any practice
# assessment's length, so it only stops a crawl whose page never reaches its end.
MAX_QUESTIONS_SAFETY_CAP = 200


async def crawl_ms_learn_assessment(
    assessment_url: str,
    exam: str = "MS Learn Assessment",
    subject: str = "Microsoft Certification",
    max_questions: Optional[int] = None,
    headless: bool = False,
    on_progress: Optional[Callable[[int], None]] = None,
    job_id: Optional[str] = None,
    on_total: Optional[Callable[[int], None]] = None,
) -> list:
    """
    Autonomous Playwright crawler that accesses an assessment URL using the saved persistent session and storage_state,
    clicks 'Check Your Answer' on each question to reveal option feedback and rationale,
    extracts all questions, and inserts them into Neon PostgreSQL.
    """
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    log(f"[MS LEARN CRAWLER]: Starting assessment crawl for {assessment_url} (Exam: {exam})")

    new_context_kwargs = {"viewport": {"width": 1400, "height": 900}}
    if os.path.exists(STORAGE_STATE_PATH):
        log(f"[MS LEARN CRAWLER]: Restoring saved session from {STORAGE_STATE_PATH}")
        new_context_kwargs["storage_state"] = STORAGE_STATE_PATH
    else:
        log("[MS LEARN CRAWLER WARNING]: No saved session found — this crawl will hit a fresh login wall.")

    extracted_questions = []

    log(f"[MS LEARN CRAWLER DEBUG]: Launching Chromium (Headless: {headless})...")
    p = await async_playwright().start()
    browser = await p.chromium.launch(headless=headless)
    context = await browser.new_context(**new_context_kwargs)
    # Microsoft's OAuth completion page (identity-redirect.html) is written for popup-style
    # auth and calls window.close() on itself once the handshake finishes. We navigate there
    # directly rather than opening it as a real popup, but Chromium under Playwright's
    # automation flags still honors that call — killing our tab mid-flow right after the
    # account-picker/"Stay signed in?" step (confirmed via repeated "Target page, context or
    # browser has been closed" errors at that exact point). Neutralize it for every page in
    # this context before any navigation happens.
    await context.add_init_script("window.close = () => {};")
    page = await context.new_page()

    try:
        log(f"[MS LEARN CRAWLER DEBUG]: Navigating to assessment page: {assessment_url}...")
        try:
            await page.goto(assessment_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
        except Exception as nav_err:
            log(f"[MS LEARN CRAWLER ERROR]: Navigation timeout or error: {nav_err}")

        log(f"[MS LEARN CRAWLER DEBUG]: Current page URL: {page.url}")
        title_str = await page.title()
        log(f"[MS LEARN CRAWLER DEBUG]: Current page title: '{title_str}'")
        
        # Auto-detect Exam Discipline and Subject from Title if requested
        if exam.lower() == "auto-detect" or subject.lower() == "auto-detect":
            # The tab title is usually just "Practice Assessment | Microsoft Learn"; the page's
            # own heading ("Practice Assessment for Exam AZ-700: ...") carries the exam code.
            heading = await page.query_selector("main h1")
            heading_str = (await heading.inner_text()).strip() if heading else ""
            _exam_match = re.search(r'\b([A-Z]{2,3}-\d{3,4})\b', f"{heading_str} {title_str}", re.IGNORECASE)
            if _exam_match and exam.lower() == "auto-detect":
                exam = f"Exam {_exam_match.group(1).upper()}"
            if subject.lower() == "auto-detect":
                _clean_title = title_str.split(" - ")[0].replace("Practice Assessment for", "").strip()
                subject = _clean_title if _clean_title else "Microsoft Certification"
            log(f"[MS LEARN CRAWLER DEBUG]: Auto-detected Exam: '{exam}' | Subject: '{subject}'")

        exam_title, exam_desc, logo_url = fetch_exam_overview_metadata(assessment_url)


        # Check if page requires user to click Sign-In
        signin_button = await _find_visible_signin(page)
        if signin_button:
            log("[MS LEARN CRAWLER DEBUG]: Unauthenticated landing page detected. Clicking Sign In button...")
            await signin_button.click()
            await page.wait_for_timeout(3000)
            log(f"[MS LEARN CRAWLER DEBUG]: URL after clicking Sign In: {page.url}")

        # Check if auth prompt appeared or redirect to login.microsoftonline.com. One round of
        # tile-click + "Stay signed in?" is not always enough — navigating back to assessment_url
        # can trigger a brand new `prompt=select_account` authorize call (a fresh client-request-id)
        # rather than landing on the assessment, so retry the whole resumption dance a few times
        # before giving up.
        for resume_attempt in range(3):
            if not (
                "login.microsoftonline.com" in page.url
                or "login.live.com" in page.url
                or "identity/signin" in page.url
            ):
                break
            log(
                f"[MS LEARN CRAWLER DEBUG]: Redirected to Microsoft Identity page "
                f"(attempt {resume_attempt + 1}/3): {page.url}. Attempting auto session resumption..."
            )
            try:
                # `[data-test-id='signinOptions']` was confirmed (via screenshot) to match the
                # "Sign-in options" link, which just expands a menu of alternate sign-in methods
                # (passkey/GitHub/org) — not an account-resume tile. Clicking it every single
                # attempt achieved nothing, which is why this resume path never once succeeded.
                # `#newSessionLink` / `div.tile:has-text('Signed in')` remain as the actual
                # candidates for an "already signed in as X" tile, should MSAL ever show one here.
                tile = await page.query_selector("#newSessionLink, div.tile:has-text('Signed in')")
                if tile:
                    tile_text = (await tile.inner_text()).strip().replace("\n", " ")[:120]
                    tile_id = await tile.get_attribute("id")
                    log(
                        f"[MS LEARN CRAWLER DEBUG]: Found active Microsoft session tile "
                        f"(id={tile_id!r}, text={tile_text!r})! Clicking tile to sign in..."
                    )
                    await tile.click()
                    await page.wait_for_timeout(1500)
                    log(
                        f"[MS LEARN CRAWLER DEBUG]: Immediately after tile click — URL: {page.url} "
                        f"| Title: {await page.title()!r}"
                    )
                    try:
                        await page.screenshot(
                            path=f"/tmp/ms_learn_debug_attempt{resume_attempt + 1}_post_tile_click.png"
                        )
                    except Exception:
                        pass

                    # Picking an account is very often followed by a "Stay signed in?" interstitial
                    # (id="idSIButton9" for Yes) before the redirect back to learn.microsoft.com
                    # completes — the previous fixed 4s sleep + immediate re-navigate to
                    # assessment_url never gave this screen a chance to appear, so clicking the
                    # tile looked like it "worked" but actually abandoned the flow mid-step,
                    # bouncing straight back to a fresh login prompt every single time (this is
                    # exactly what the logs showed: every attempt, including ones that had
                    # previously succeeded, hit the same loop).
                    try:
                        await page.wait_for_selector(KMSI_PAGE_SELECTOR, timeout=5000)
                        if await _click_stay_signed_in_yes(page):
                            log("[MS LEARN CRAWLER DEBUG]: 'Stay signed in?' prompt detected — clicked Yes.")
                            await page.wait_for_timeout(1500)
                            log(
                                f"[MS LEARN CRAWLER DEBUG]: Immediately after 'Stay signed in?' click — "
                                f"URL: {page.url} | Title: {await page.title()!r}"
                            )
                        else:
                            log(
                                f"[MS LEARN CRAWLER DEBUG]: No visible 'Stay signed in?' prompt found. "
                                f"Current URL: {page.url} | Title: {await page.title()!r}"
                            )
                    except Exception as stay_signed_in_err:
                        log(
                            f"[MS LEARN CRAWLER DEBUG]: No 'Stay signed in?' interstitial appeared "
                            f"({stay_signed_in_err.__class__.__name__}). Current URL: {page.url} | "
                            f"Title: {await page.title()!r}"
                        )
                    try:
                        await page.screenshot(
                            path=f"/tmp/ms_learn_debug_attempt{resume_attempt + 1}_post_stay_signed_in.png"
                        )
                    except Exception:
                        pass
                else:
                    log(
                        f"[MS LEARN CRAWLER DEBUG]: No session tile found on identity page. "
                        f"Title: {await page.title()!r}"
                    )
                    try:
                        await page.screenshot(
                            path=f"/tmp/ms_learn_debug_attempt{resume_attempt + 1}_no_tile.png"
                        )
                    except Exception:
                        pass

                # Wait for the redirect chain to actually leave Microsoft's identity domain,
                # instead of a fixed sleep that may fire before the chain settles.
                try:
                    await page.wait_for_url(
                        lambda url: "login.microsoftonline.com" not in url
                        and "login.live.com" not in url,
                        timeout=15000,
                    )
                except Exception:
                    log(
                            f"[MS LEARN CRAWLER WARNING]: Still on a Microsoft identity page after "
                            f"15s: {page.url}"
                        )

                # Some Microsoft account-picker/"Stay signed in?" completions finish by opening the
                # result in a new tab and closing the original one (a popup-style OAuth completion)
                # rather than navigating the same page — the log evidence for this was `page.goto`
                # failing with "Target page, context or browser has been closed" immediately after
                # the tile click, even though the browser process itself was still alive. If our
                # page handle died, recover the context's current live page instead of treating
                # this as fatal.
                if page.is_closed():
                    log("[MS LEARN CRAWLER WARNING]: Page closed during account resumption — recovering the context's current page.")
                    live_pages = [p for p in context.pages if not p.is_closed()]
                    if live_pages:
                        page = live_pages[-1]
                        log(f"[MS LEARN CRAWLER DEBUG]: Recovered page. Current URL: {page.url}")
                    else:
                        page = await context.new_page()
                        log("[MS LEARN CRAWLER WARNING]: No live pages left in context — opened a fresh one.")

                if "practice/assessment" not in page.url:
                    log("[MS LEARN CRAWLER DEBUG]: Navigating back to practice assessment after account tile click...")
                    await page.goto(assessment_url, wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(3000)

                if "login.microsoftonline.com" in page.url or "login.live.com" in page.url:
                    log(
                        f"[MS LEARN CRAWLER WARNING]: Session did NOT resume after attempt "
                        f"{resume_attempt + 1}/3 — still on a Microsoft identity page: {page.url}"
                    )
                else:
                    log(f"[MS LEARN CRAWLER DEBUG]: Session resumed! Current URL: {page.url}")
                    await context.storage_state(path=STORAGE_STATE_PATH)
            except Exception as auth_err:
                log(f"[MS LEARN CRAWLER WARNING]: Could not auto-resume Microsoft session: {auth_err}")

        # Wait up to 20s for SPA fieldset to render Question 1
        try:
            log("[MS LEARN CRAWLER DEBUG]: Waiting for assessment fieldset to render...")
            await page.wait_for_selector("fieldset", timeout=20000)
            log("[MS LEARN CRAWLER DEBUG]: Assessment fieldset loaded successfully!")
        except Exception as fieldset_init_err:
            log(f"[MS LEARN CRAWLER WARNING]: Initial fieldset wait failed: {fieldset_init_err}")

        media_store = FilesystemMediaStore()
        prev_question_text = ""
        # No cap by default: the whole assessment is scraped (maximum data, deduplicated on
        # approval). A caller-given max_questions still limits the run; the safety cap only guards
        # against a page that never reaches its end.
        limit = max_questions if max_questions else MAX_QUESTIONS_SAFETY_CAP
        assessment_total: Optional[int] = None
        # Distinct questions reached so far. The end is detected from these rather than from loop
        # iterations: an iteration spent waiting on a slow page transition (same stem re-read)
        # would otherwise count as a question and end the crawl one question early.
        seen_stems: set[str] = set()
        for q_index in range(1, limit + 1):
            if assessment_total is not None and len(seen_stems) >= assessment_total:
                log(f"[MS LEARN CRAWLER]: Reached the end of the assessment ({assessment_total} questions).")
                break
            log(f"[MS LEARN CRAWLER DEBUG]: Processing Question {q_index}/{assessment_total or limit}...")
            await page.wait_for_timeout(1000)

            # Wait for fieldset to appear
            try:
                await page.wait_for_selector("fieldset", timeout=8000)
            except Exception:
                log(f"[MS LEARN CRAWLER DEBUG]: Fieldset selector timed out on Q{q_index}. Checking page content...")
                body_text = (await page.inner_text("body"))[:300].replace('\n', ' ')
                log(f"[MS LEARN CRAWLER DEBUG]: Page Body snippet: {body_text}")
                break

            # "Question 1 of 50": the assessment's real length, read once.
            if assessment_total is None:
                progress_label = await page.query_selector("label.is-size-5")
                total_match = re.search(
                    r"of\s+(\d+)", (await progress_label.inner_text()) if progress_label else ""
                )
                if total_match:
                    assessment_total = min(int(total_match.group(1)), limit)
                    if on_total:
                        on_total(assessment_total)

            fieldset = await page.query_selector("fieldset")
            if not fieldset:
                log(f"[MS LEARN CRAWLER DEBUG]: No fieldset element found on Q{q_index}.")
                break

            # The stem alone identifies the question for "has the page moved on yet?" checks —
            # the fieldset as a whole also contains the (hidden) rationale.
            async def read_stem() -> str:
                stem_el = await page.query_selector("fieldset #question-legend")
                return " ".join((await stem_el.inner_text()).split()) if stem_el else ""

            stem = await read_stem()
            if stem and stem == prev_question_text and q_index > 1:
                log(f"[MS LEARN CRAWLER DEBUG]: Duplicate Q text detected. Waiting for DOM transition on question {q_index}...")
                await page.wait_for_timeout(2500)
                stem = await read_stem()
            prev_question_text = stem
            if stem:
                seen_stems.add(stem)
            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Text: '{stem[:90]}...'")

            # Select options to enable "Check Your Answer" (a multi-select needs more than one).
            inputs = await fieldset.query_selector_all("input[type='radio'], input[type='checkbox'], input.radio-dot")
            for inp in inputs[:3]:
                try:
                    await inp.click(force=True)
                    await page.wait_for_timeout(200)
                except Exception as click_err:
                    log(f"[MS LEARN CRAWLER DEBUG]: Choice selection click error: {click_err}")

            check_ans_btn = await page.query_selector("button#checkUserAnswer, button:has-text('Check Your Answer')")
            if check_ans_btn:
                try:
                    log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Clicking 'Check Your Answer' button...")
                    await check_ans_btn.click()
                    await page.wait_for_selector("fieldset label.quiz-choice.is-correct", timeout=5000)
                except Exception as check_err:
                    log(f"[MS LEARN CRAWLER DEBUG]: Check Answer did not reveal a correct option: {check_err}")

            # Everything about the question — stem, options, correct answer(s), rationale, reading
            # links — comes from the revealed fieldset's structure; see ms_learn_parser.py.
            fieldset = await page.query_selector("fieldset")
            try:
                parsed = parse_question_fieldset(await fieldset.evaluate("el => el.outerHTML"))
            except MsLearnParseError as parse_err:
                log(f"[MS LEARN CRAWLER WARNING]: Q{q_index} skipped — {parse_err}")
                parsed = None

            # Question images are downloaded now, with the signed-in session's cookies, and stored
            # locally — see ms_learn_media.py for why a failed stem/option image drops the question.
            images = []
            if parsed and parsed.images:
                async def fetch_image(url):
                    resp = await context.request.get(url, timeout=20000)
                    return resp.status, await resp.body(), resp.headers.get("content-type")

                try:
                    images = await store_question_images(parsed.images, fetch_image, media_store, log)
                except MediaFetchError as media_err:
                    log(f"[MS LEARN CRAWLER WARNING]: Q{q_index} skipped — {media_err}")
                    parsed = None

            if parsed:
                log(
                    f"[MS LEARN CRAWLER DEBUG]: Q{q_index} {len(parsed.options)} options, correct: "
                    f"{parsed.correct_options}, {len(parsed.reading_links)} reading link(s)"
                )
                if any(sq["questionText"] == parsed.question_text for sq in extracted_questions):
                    log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} skipped because it's a duplicate (page likely didn't transition fast enough).")
                else:
                    extracted_questions.append({
                        "questionText": parsed.question_text,
                        "options": parsed.options,
                        # Multi-answer questions keep the " | "-joined form the review/approval
                        # step already understands (packages/api/src/lib/review-answers.ts).
                        "answer": " | ".join(parsed.correct_options),
                        "explanation": parsed.explanation,
                        "additionalReadingLinks": parsed.reading_links,
                        "images": images,
                        "exam": exam,
                        "subject": subject,
                    })
                    log(f"[MS LEARN CRAWLER SUCCESS]: Extracted Q{q_index}/{assessment_total or limit} successfully!")
                    if on_progress:
                        on_progress(len(extracted_questions))

            # Advance to Next Question with robust visible-element detection and JS click fallback
            clicked_next = False
            
            # Selector candidates for Next button
            next_selectors = [
                "button#next-button",
                "button.next-button",
                "button[data-bi-name='next']",
                "button:has-text('Next question')",
                "button:has-text('Next')",
                "button:has-text('Continue')",
                "button[aria-label*='Next']",
                "button[aria-label*='next']",
                "fieldset ~ div button",
                "form ~ div button",
                "main button"
            ]
            
            for attempt in range(2):
                # 1. Collect all matching candidate elements
                candidates = []
                for selector in next_selectors:
                    try:
                        found_nodes = await page.query_selector_all(selector)
                        candidates.extend(found_nodes)
                    except Exception:
                        pass
                
                # 2. Filter for elements that are actually VISIBLE and ENABLED
                visible_btn = None
                for btn in candidates:
                    try:
                        if await btn.is_visible() and await btn.is_enabled():
                            txt = (await btn.inner_text()).strip().lower()
                            aria = (await btn.get_attribute("aria-label") or "").lower()
                            btn_id = (await btn.get_attribute("id") or "").lower()
                            
                            # Filter out non-next buttons if text is available
                            if txt or aria or btn_id:
                                if "next" in txt or "next" in aria or "next" in btn_id or "continue" in txt or "next" in selector:
                                    visible_btn = btn
                                    break
                            else:
                                visible_btn = btn
                                break
                    except Exception:
                        continue

                # 3. If no specific next button found, look for any visible button near bottom of page/fieldset
                if not visible_btn:
                    try:
                        all_page_btns = await page.query_selector_all("button, a[role='button']")
                        for btn in reversed(all_page_btns):
                            if await btn.is_visible() and await btn.is_enabled():
                                txt = (await btn.inner_text()).strip().lower()
                                aria = (await btn.get_attribute("aria-label") or "").lower()
                                if "next" in txt or "next" in aria or "continue" in txt:
                                    visible_btn = btn
                                    break
                    except Exception:
                        pass

                if visible_btn:
                    try:
                        log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Clicking visible 'Next' button to advance...")
                        await page.evaluate("(el) => el.scrollIntoView({block: 'center', inline: 'center'})", visible_btn)
                        await page.wait_for_timeout(300)
                        
                        # Try standard click first
                        try:
                            await visible_btn.click(timeout=3000)
                        except Exception as click_ex:
                            log(f"[MS LEARN CRAWLER DEBUG]: Standard click failed ({click_ex}), retrying via JS evaluate click...")
                            await page.evaluate("(el) => el.click()", visible_btn)

                        clicked_next = True
                        await page.wait_for_timeout(2500)
                        break
                    except Exception as next_err:
                        log(f"[MS LEARN CRAWLER DEBUG]: Next button click attempt {attempt+1} failed: {next_err}")
                
                # If first attempt didn't find/click a visible button, scroll down and wait
                if not clicked_next and attempt == 0:
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1000)

            if not clicked_next:
                log(f"[MS LEARN CRAWLER DEBUG]: No visible 'Next' button found after Q{q_index}. Assessment completed or end reached.")
                break

        log(f"[MS LEARN CRAWLER]: Extracted {len(extracted_questions)} questions from {assessment_url}")
        if not extracted_questions:
            reason = _unavailable_reason(assessment_url, exam, page.url)
            log(f"[MS LEARN CRAWLER WARNING]: {reason}")
            raise AssessmentUnavailable(reason)

        if extracted_questions:
            inserted_id = insert_scraped_question(
                source_url=assessment_url,
                raw_data=f"MS Learn Playwright Assessment Crawl ({len(extracted_questions)} questions)",
                parsed_data={
                    "extractedElements": extracted_questions,
                    "metadata": {
                        "exam": exam,
                        # The official display name ("Microsoft Certified: AI Business
                        # Professional"). `exam` stays the code-bearing identifier ("Exam AB-730")
                        # that approval uses to match an already-registered exam.
                        "examTitle": exam_title,
                        "subject": subject,
                        "description": exam_desc,
                        "logoUrl": logo_url,
                        "source": "Microsoft Learn Practice Assessment",
                        # Links the batch back to the pipeline job that produced it, so the admin
                        # scraping page can show a run and its review status as one row.
                        "jobId": job_id,
                        # Practice assessments draw questions at random from a pool, so questions
                        # are identified by content (see the pipeline's stable_id.py): approving a
                        # re-scrape adds only the questions not already published.
                        "questionIdentity": "content",
                        # What the published question set is called on the exam page.
                        "questionSetTitle": "Official Microsoft Practice Assessment",
                        "count": len(extracted_questions)
                    }
                },
            )
            if inserted_id:
                log(f"[MS LEARN CRAWLER]: Successfully saved {len(extracted_questions)} questions to the database (id={inserted_id}).")
            else:
                log("[MS LEARN CRAWLER]: Extraction succeeded but the database write failed — see [DB INSERT ERROR] above.")

        return extracted_questions
    finally:
        await context.close()
        await browser.close()
        await p.stop()
