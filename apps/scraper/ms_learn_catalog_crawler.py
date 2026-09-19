import asyncio
import os
import re
import json
import subprocess
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

import sys

load_dotenv("../../.env")
load_dotenv()

CATALOG_URL = "https://learn.microsoft.com/en-us/credentials/certifications/practice-assessments-for-microsoft-certifications"
USER_DATA_DIR = os.path.expanduser("~/.cache/ms_learn_scraper_profile")
LOG_FILE_PATH = "/tmp/ms_learn_scraper.log"

def log(msg: str):
    timestamped_msg = f"{msg}"
    sys.stderr.write(timestamped_msg + "\n")
    sys.stderr.flush()
    try:
        with open(LOG_FILE_PATH, "a") as f:
            f.write(timestamped_msg + "\n")
    except Exception:
        pass

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    try:
        clean_url = re.sub(r'[\?&]channel_binding=[^&]+', '', db_url)
        return psycopg2.connect(clean_url)
    except Exception as e:
        log(f"[DB CONNECTION WARNING]: {e}")
        return None

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

    return catalog_items

async def launch_interactive_auth_session():
    """
    Launches a headful Chromium browser window for the admin to sign in to Microsoft Learn using official MSAL OAuth.
    Waits for full OAuth redirect completion back to learn.microsoft.com and persists session state.
    """
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    print(f"[MS LEARN AUTH]: Launching Playwright browser for Microsoft Account authentication...")
    print(f"[MS LEARN AUTH]: Profile directory: {USER_DATA_DIR}")

    msal_auth_url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?"
        "client_id=18fbca16-2224-45f6-85b0-f7bf2b39b3f3"
        "&scope=openid%20profile%20email%20offline_access"
        "&redirect_uri=https%3A%2F%2Flearn.microsoft.com%2F_themes%2Fdocs.theme%2Fmaster%2Fen-us%2F_themes%2Fglobal%2Fidentity-redirect.html"
        "&client-request-id=01a0763d-4a99-7aa1-9895-79514834e746"
        "&response_mode=fragment&client_info=1&clidata=1&prompt=select_account"
        "&nonce=438a0c5a-3d6f-4ea6-994e-bb45ad670687"
        "&state=eyJpZCI6IjAxYTA3NjNkLTRhOWItNzE0Yy04YTRiLTUxMDU0YTgzNmI3MSIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D%7Chttps%253A%252F%252Flearn.microsoft.com%252Fen-us%252Fcredentials%252Fcertifications%252Fpractice-assessments-for-microsoft-certifications%253Fsource%253Ddocs"
        "&x-client-SKU=msal.js.browser&x-client-VER=5.6.3&response_type=code"
        "&code_challenge=6XXeqNStbWaOctoU7hrU-_ieXQW0JMeFvtsa33jfwFQ&code_challenge_method=S256"
    )

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False,
            viewport={"width": 1400, "height": 900}
        )
        page = context.pages[0] if context.pages else await context.new_page()
        
        print(f"[MS LEARN AUTH]: Opening Microsoft OAuth login page...")
        await page.goto(msal_auth_url)
        await page.wait_for_timeout(3000)

        print("[MS LEARN AUTH]: Waiting for admin to complete Microsoft Online login (up to 180 seconds)...")
        
        authenticated = False
        # Poll up to 180s: Wait for user to finish login and redirect to learn.microsoft.com
        for i in range(36):
            current_url = page.url
            print(f"[MS LEARN AUTH POLL {i+1}/36]: Current page URL -> {current_url}")
            
            # User completed Microsoft Online OAuth flow and returned to learn.microsoft.com
            if "login.microsoftonline.com" not in current_url:
                auth_cookies = await context.cookies()
                ms_cookies = [c for c in auth_cookies if "microsoft" in c.get("domain", "")]
                
                # Check for redirected domain or auth cookies
                if "learn.microsoft.com" in current_url or len(ms_cookies) >= 3:
                    print(f"[MS LEARN AUTH SUCCESS]: Successfully authenticated into Microsoft Learn! Found {len(ms_cookies)} session cookies.")
                    authenticated = True
                    break
            
            await asyncio.sleep(5)

        # Save storage state
        storage_state_path = os.path.join(USER_DATA_DIR, "storage_state.json")
        await context.storage_state(path=storage_state_path)
        print(f"[MS LEARN AUTH]: Saved storage state to {storage_state_path}")
        
        await context.close()
        return {
            "status": "authenticated" if authenticated else "pending_user_login",
            "authenticated": authenticated,
            "profile_dir": USER_DATA_DIR
        }

async def crawl_ms_learn_assessment(
    assessment_url: str, 
    exam: str = "MS Learn Assessment", 
    subject: str = "Microsoft Certification", 
    max_questions: int = 50, 
    headless: bool = False
) -> list:
    """
    Autonomous Playwright crawler that accesses an assessment URL using the saved persistent session and storage_state,
    clicks 'Check Your Answer' on each question to reveal option feedback and rationale,
    extracts all questions, and inserts them into Neon PostgreSQL.
    """
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    storage_state_path = os.path.join(USER_DATA_DIR, "storage_state.json")
    log(f"[MS LEARN CRAWLER]: Starting assessment crawl for {assessment_url} (Exam: {exam})")

    context_kwargs = {}
    if os.path.exists(storage_state_path):
        log(f"[MS LEARN CRAWLER]: Loading persisted auth state from {storage_state_path}")
        context_kwargs["storage_state"] = storage_state_path
    else:
        log(f"[MS LEARN CRAWLER WARNING]: No storage_state.json found in {USER_DATA_DIR}. Session might be unauthenticated.")

    extracted_questions = []

    async with async_playwright() as p:
        log(f"[MS LEARN CRAWLER DEBUG]: Launching Chromium persistent context (Headless: {headless}, UserDataDir: {USER_DATA_DIR})...")
        # Note: storage_state is not used with persistent contexts - state is automatically managed via user_data_dir
        context = await p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=headless,
            viewport={"width": 1400, "height": 900}
        )
        page = context.pages[0] if context.pages else await context.new_page()
        
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
            _exam_match = re.search(r'\b([A-Z]{2,3}-\d{3,4})\b', title_str, re.IGNORECASE)
            if _exam_match and exam.lower() == "auto-detect":
                exam = f"Exam {_exam_match.group(1).upper()}"
            if subject.lower() == "auto-detect":
                _clean_title = title_str.split(" - ")[0].replace("Practice Assessment for", "").strip()
                subject = _clean_title if _clean_title else "Microsoft Certification"
            log(f"[MS LEARN CRAWLER DEBUG]: Auto-detected Exam: '{exam}' | Subject: '{subject}'")

        # Fetch official exam metadata (description, logo badge, and official title) from Microsoft Learn certification/exam page
        exam_desc = ""
        logo_url = ""
        try:
            # Determine potential metadata URLs (either certification page or exam code page)
            meta_urls = []
            if "credentials/certifications/" in assessment_url and "/exams/" not in assessment_url:
                cert_slug_path = assessment_url.split("credentials/certifications/")[1].split("?")[0].strip("/")
                meta_urls.append(f"https://learn.microsoft.com/en-us/credentials/certifications/{cert_slug_path}/")

            exam_code_match = re.search(r'\b([a-z]{2,3}-\d{3,4})\b', assessment_url, re.I)
            if exam_code_match:
                base_exam_code = exam_code_match.group(1).lower()
                meta_urls.append(f"https://learn.microsoft.com/en-us/credentials/certifications/exams/{base_exam_code}/")

            for meta_url in meta_urls:
                log(f"[MS LEARN CRAWLER]: Fetching exam overview metadata from {meta_url}...")
                meta_res = requests.get(meta_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=10)
                if meta_res.status_code == 200:
                    meta_soup = BeautifulSoup(meta_res.text, "html.parser")
                    
                    # 1. Extract Official Title (e.g. Microsoft Certified: AI Transformation Leader)
                    h1_tag = meta_soup.find("h1")
                    og_title_tag = meta_soup.find("meta", attrs={"property": "og:title"})
                    official_title = (h1_tag.get_text(strip=True) if h1_tag else "") or (og_title_tag["content"] if og_title_tag else "")
                    
                    if official_title and not exam or exam.lower().startswith("ms learn"):
                        exam = official_title
                        if ":" in official_title:
                            subject = official_title.split(":", 1)[1].strip()
                        elif "-" in official_title:
                            subject = official_title.split("-", 1)[1].strip()
                        log(f"[MS LEARN CRAWLER]: Extracted Official Title: '{exam}' | Subject: '{subject}'")

                    # 2. Extract Logo / Badge SVG URL
                    badge_img = meta_soup.find("img", attrs={"src": re.compile(r"badges|certification|badge", re.I)})
                    if badge_img and badge_img.get("src"):
                        raw_src = badge_img["src"]
                        logo_url = raw_src if raw_src.startswith("http") else f"https://learn.microsoft.com{raw_src}"
                        log(f"[MS LEARN CRAWLER]: Extracted Badge Logo URL: '{logo_url}'")
                    else:
                        og_img = meta_soup.find("meta", attrs={"property": "og:image"})
                        if og_img and og_img.get("content"):
                            logo_url = og_img["content"]

                    # 3. Extract Exam Description
                    desc_tag = meta_soup.find("meta", attrs={"name": "description"}) or meta_soup.find("meta", attrs={"property": "og:description"})
                    if desc_tag and desc_tag.get("content"):
                        exam_desc = desc_tag["content"].strip()
                        log(f"[MS LEARN CRAWLER]: Extracted Exam Description ({len(exam_desc)} chars): '{exam_desc[:100]}...'")

                    if logo_url or exam_desc:
                        break
        except Exception as meta_err:
            log(f"[MS LEARN CRAWLER WARNING]: Could not fetch exam overview metadata: {meta_err}")


        # Check if page requires user to click Sign-In
        signin_button = await page.query_selector("a[href*='identity/signin'], button:has-text('Sign in'), a:has-text('Sign in')")
        if signin_button and await signin_button.is_visible():
            log("[MS LEARN CRAWLER DEBUG]: Unauthenticated landing page detected. Clicking Sign In button...")
            await signin_button.click()
            await page.wait_for_timeout(3000)
            log(f"[MS LEARN CRAWLER DEBUG]: URL after clicking Sign In: {page.url}")

        # Check if auth prompt appeared or redirect to login.microsoftonline.com
        if "login.microsoftonline.com" in page.url or "login.live.com" in page.url or "identity/signin" in page.url:
            log(f"[MS LEARN CRAWLER DEBUG]: Redirected to Microsoft Identity page: {page.url}. Attempting auto session resumption...")
            try:
                tile = await page.query_selector("#newSessionLink, [data-test-id='signinOptions'], div.tile:has-text('Signed in')")
                if tile:
                    log("[MS LEARN CRAWLER DEBUG]: Found active Microsoft session tile! Clicking tile to sign in...")
                    await tile.click()
                    await page.wait_for_timeout(4000)

                if "practice/assessment" not in page.url:
                    log("[MS LEARN CRAWLER DEBUG]: Navigating back to practice assessment after account tile click...")
                    await page.goto(assessment_url, wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(3000)

                log(f"[MS LEARN CRAWLER DEBUG]: Session resumed! Current URL: {page.url}")
                await context.storage_state(path=storage_state_path)
            except Exception as auth_err:
                log(f"[MS LEARN CRAWLER WARNING]: Could not auto-resume Microsoft session: {auth_err}")

        # Wait up to 20s for SPA fieldset to render Question 1
        try:
            log("[MS LEARN CRAWLER DEBUG]: Waiting for assessment fieldset to render...")
            await page.wait_for_selector("fieldset", timeout=20000)
            log("[MS LEARN CRAWLER DEBUG]: Assessment fieldset loaded successfully!")
        except Exception as fieldset_init_err:
            log(f"[MS LEARN CRAWLER WARNING]: Initial fieldset wait failed: {fieldset_init_err}")

        prev_question_text = ""
        for q_index in range(1, max_questions + 1):
            log(f"[MS LEARN CRAWLER DEBUG]: Processing Question {q_index}/{max_questions}...")
            await page.wait_for_timeout(1000)

            # Wait for fieldset to appear
            try:
                await page.wait_for_selector("fieldset", timeout=8000)
            except Exception:
                log(f"[MS LEARN CRAWLER DEBUG]: Fieldset selector timed out on Q{q_index}. Checking page content...")
                body_text = (await page.inner_text("body"))[:300].replace('\n', ' ')
                log(f"[MS LEARN CRAWLER DEBUG]: Page Body snippet: {body_text}")
                break

            fieldset = await page.query_selector("fieldset")
            if not fieldset:
                log(f"[MS LEARN CRAWLER DEBUG]: No fieldset element found on Q{q_index}.")
                break

            # Extract Question Header & Text
            q_header = await page.query_selector("h2, .quiz-header, label.is-size-5, legend")
            q_title = (await q_header.inner_text()).strip() if q_header else f"Question {q_index}"
            
            q_paragraphs = await fieldset.query_selector_all("p")
            q_texts = []
            for p_elem in q_paragraphs:
                txt = (await p_elem.inner_text()).strip()
                if txt and not txt.startswith("Question ") and not txt.startswith("Select "):
                    q_texts.append(txt)

            question_body = "\n".join(q_texts)
            full_q_text = f"{q_title}: {question_body}".strip() if question_body else q_title

            # Avoid duplicate extractions if DOM has not updated yet
            if full_q_text == prev_question_text and q_index > 1:
                log(f"[MS LEARN CRAWLER DEBUG]: Duplicate Q text detected. Waiting for DOM transition on question {q_index}...")
                await page.wait_for_timeout(2500)
                fieldset = await page.query_selector("fieldset")
                if fieldset:
                    q_paragraphs = await fieldset.query_selector_all("p")
                    question_body = "\n".join([(await p.inner_text()).strip() for p in q_paragraphs])
                    full_q_text = f"{q_title}: {question_body}".strip()

            prev_question_text = full_q_text
            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Text: '{full_q_text[:90]}...'")

            # Extract choices
            choice_labels = await fieldset.query_selector_all("label.quiz-choice, label.radio, label.checkbox, label[for*='choice']")
            choices = []
            for c_elem in choice_labels:
                c_text = (await c_elem.inner_text()).strip()
                if c_text and c_text not in choices:
                    choices.append(c_text)
            
            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Extracted {len(choices)} choices: {choices}")

            # Select options to enable "Check Your Answer" (could be a checkbox needing multiple selections)
            inputs = await fieldset.query_selector_all("input[type='radio'], input[type='checkbox'], input.radio-dot")
            if inputs:
                for inp in inputs[:3]: # Click up to 3 inputs to satisfy multi-selects
                    try:
                        await inp.click(force=True)
                        await page.wait_for_timeout(200)
                    except Exception as click_err:
                        log(f"[MS LEARN CRAWLER DEBUG]: Choice selection click error: {click_err}")

            # Click Check Your Answer
            check_ans_btn = await page.query_selector("button#checkUserAnswer, button:has-text('Check Your Answer')")
            correct_answer = choices[0] if choices else "Option A"
            explanation = "Extracted directly from Microsoft Learn Practice Assessment."

            if check_ans_btn:
                try:
                    log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Clicking 'Check Your Answer' button...")
                    await check_ans_btn.click()
                    await page.wait_for_timeout(1500)

                    correct_labels = await fieldset.query_selector_all("label.is-correct, .quiz-choice:has-text('is correct'), .is-success")
                    if correct_labels:
                        correct_answers_list = []
                        for c_lbl in correct_labels:
                            c_txt = (await c_lbl.inner_text()).strip()
                            if c_txt and c_txt not in correct_answers_list:
                                correct_answers_list.append(c_txt)
                        if correct_answers_list:
                            correct_answer = " | ".join(correct_answers_list)
                            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Correct Answer Identified: '{correct_answer}'")

                    rationale_elem = await page.query_selector(".rationale, .explanation, [data-bi-name='rationale'], div.margin-block-xs")
                    if rationale_elem:
                        explanation = (await rationale_elem.inner_text()).strip()
                        log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Rationale Extracted: '{explanation[:80]}...'")
                except Exception as check_err:
                    log(f"[MS LEARN CRAWLER DEBUG]: Check Answer click error: {check_err}")

            # Extract additional reading links - search in multiple locations
            additional_reading_links = []
            
            # Search for additional reading links on page after Check Answer
            try:
                # Look for any element that might contain additional resources
                # Common patterns: divs with "additional", links after specific containers, etc.
                all_elements = await page.query_selector_all("div, section, article")
                
                for elem in all_elements:
                    try:
                        elem_text = (await elem.inner_text()).strip()
                        # Check if this element contains "Additional Reading"
                        if "additional reading" in elem_text.lower() or "additional resources" in elem_text.lower():
                            # Found the additional reading section, extract links from it
                            links = await elem.query_selector_all("a[href]")
                            for link in links:
                                href = await link.get_attribute("href")
                                link_text = (await link.inner_text()).strip()
                                if href and link_text:
                                    # Construct absolute URL if relative
                                    if href.startswith("/"):
                                        href = f"https://learn.microsoft.com{href}"
                                    elif not href.startswith("http"):
                                        href = f"https://learn.microsoft.com/{href}"
                                    
                                    # Avoid duplicates
                                    if not any(l["url"] == href for l in additional_reading_links):
                                        additional_reading_links.append({
                                            "text": link_text,
                                            "url": href
                                        })
                            
                            if additional_reading_links:
                                log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Found additional reading section with {len(additional_reading_links)} links")
                                break
                    except:
                        pass
                
                # If still no links found, do a broader search for resource-like links
                if not additional_reading_links:
                    try:
                        all_links = await page.query_selector_all("a[href]")
                        for link in all_links:
                            try:
                                link_text = (await link.inner_text()).strip()
                                # Look for links that seem like learning resources
                                if any(keyword in link_text.lower() for keyword in 
                                       ['microsoft learn', 'power platform', 'dynamics 365', 'dataverse', 
                                        'integration pattern', 'concept', 'module', 'training', 'documentation']):
                                    href = await link.get_attribute("href")
                                    if href and link_text and ("learn.microsoft.com" in href or href.startswith("/")):
                                        if href.startswith("/"):
                                            href = f"https://learn.microsoft.com{href}"
                                        
                                        # Avoid duplicates
                                        if not any(l["url"] == href for l in additional_reading_links):
                                            additional_reading_links.append({
                                                "text": link_text,
                                                "url": href
                                            })
                            except:
                                pass
                        
                        if additional_reading_links:
                            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Found {len(additional_reading_links)} resource links via broader search")
                    except Exception as e:
                        log(f"[MS LEARN CRAWLER DEBUG]: Broader link search failed: {e}")
                        
            except Exception as link_err:
                log(f"[MS LEARN CRAWLER DEBUG]: Could not extract additional reading links: {link_err}")

            # Perform Cleaning & Normalization
            clean_q_text = re.sub(r'^Question\s+\d+(\s+of\s+\d+)?:?\s*', '', full_q_text.strip(), flags=re.IGNORECASE)
            
            # Extract Rationale / Objective / Additional Reading if concatenated
            combined_body = f"{full_q_text}\n{explanation}"
            explanation_parts = []
            
            rat_match = re.search(r'Rationale:\s*(.*?)(?=\n\s*(?:Objective:|What This Item Tests:|Additional Reading:)|$)', combined_body, re.DOTALL | re.IGNORECASE)
            if rat_match:
                explanation_parts.append(f"Rationale:\n{rat_match.group(1).strip()}")
            elif explanation and not explanation.startswith("Extracted directly"):
                explanation_parts.append(explanation)
                
            obj_match = re.search(r'Objective:\s*(.*?)(?=\n\s*(?:What This Item Tests:|Additional Reading:|Rationale:)|$)', combined_body, re.DOTALL | re.IGNORECASE)
            if obj_match:
                explanation_parts.append(f"Objective:\n{obj_match.group(1).strip()}")

            read_match = re.search(r'Additional Reading:\s*(.*?)(?=\n\s*(?:Objective:|What This Item Tests:|Rationale:)|$)', combined_body, re.DOTALL | re.IGNORECASE)
            if read_match:
                explanation_parts.append(f"Additional Reading:\n{read_match.group(1).strip()}")

            # Strip metadata from clean_q_text
            clean_q_text = re.split(r'\n\s*(?:Objective:|What This Item Tests:|Additional Reading:|Rationale:)', clean_q_text)[0].strip()

            # Strip options if concatenated into clean_q_text
            for choice in choices:
                if choice and len(choice) > 3:
                    clean_q_text = clean_q_text.replace(choice, "").strip()

            paragraphs = [p.strip() for p in clean_q_text.split('\n') if p.strip() and not re.match(r'^Question\s+\d+', p, re.I)]
            final_question_text = '\n\n'.join(paragraphs) if paragraphs else clean_q_text
            final_explanation = '\n\n'.join(explanation_parts) if explanation_parts else "Extracted directly from Microsoft Learn Practice Assessment."

            # Fallback: Extract link titles from "Additional Reading:" section if no links found yet
            if not additional_reading_links and "Additional Reading" in final_explanation:
                try:
                    # Parse the Additional Reading section text
                    read_section_match = re.search(
                        r'Additional Reading:\s*(.*?)(?=\n\s*(?:Objective:|Rationale:|$))',
                        final_explanation,
                        re.DOTALL | re.IGNORECASE
                    )
                    if read_section_match:
                        read_text = read_section_match.group(1).strip()
                        # Split by newlines to get individual link titles
                        link_titles = [line.strip() for line in read_text.split('\n') if line.strip() and not line.strip().startswith(('-', '*', '•'))]
                        
                        for title in link_titles:
                            # Remove bullets/dashes if present
                            title = re.sub(r'^[-*•]\s*', '', title).strip()
                            if title and len(title) > 3:
                                # Try to construct a reasonable URL based on the title
                                # This is a best-effort fallback when actual links aren't found
                                slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
                                constructed_url = f"https://learn.microsoft.com/en-us/training/modules/{slug}/"
                                
                                additional_reading_links.append({
                                    "text": title,
                                    "url": constructed_url
                                })
                        
                        if additional_reading_links:
                            log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} Fallback: Created {len(additional_reading_links)} links from Additional Reading text")
                except Exception as fb_err:
                    log(f"[MS LEARN CRAWLER DEBUG]: Fallback link extraction failed: {fb_err}")

            is_duplicate = any(sq["questionText"] == final_question_text for sq in extracted_questions)
            if not is_duplicate:
                extracted_questions.append({
                    "questionText": final_question_text,
                    "options": choices if len(choices) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                    "answer": correct_answer,
                    "explanation": final_explanation,
                    "additionalReadingLinks": additional_reading_links,
                    "exam": exam,
                    "subject": subject
                })
                log(f"[MS LEARN CRAWLER SUCCESS]: Extracted Q{q_index}/{max_questions} successfully!")
            else:
                log(f"[MS LEARN CRAWLER DEBUG]: Q{q_index} skipped because it's a duplicate (page likely didn't transition fast enough).")

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

        if extracted_questions:
            db_url = os.getenv("DATABASE_URL")
            if db_url:
                try:
                    clean_url = re.sub(r'[\?&]channel_binding=[^&]+', '', db_url)
                    http_url = "https://ep-bold-morning-b3ghyghm-pooler.c-4.ap-southeast-1.aws.neon.tech/sql"
                    payload = {
                        "query": "INSERT INTO scraped_questions (source_url, raw_data, parsed_data, status) VALUES ($1, $2, $3, $4) RETURNING id",
                        "params": [
                            assessment_url,
                            f"MS Learn Playwright Assessment Crawl ({len(extracted_questions)} questions)",
                            json.dumps({
                                "extractedElements": extracted_questions,
                                "metadata": {
                                    "exam": exam,
                                    "subject": subject,
                                    "description": exam_desc,
                                    "logoUrl": logo_url,
                                    "source": "Microsoft Learn Practice Assessment",
                                    "count": len(extracted_questions)
                                }
                            }),
                            "pending"
                        ]
                    }
                    cmd = [
                        "curl", "-4", "-s", "-X", "POST", http_url,
                        "-H", f"Neon-Connection-String: {clean_url}",
                        "-H", "Content-Type: application/json",
                        "-d", json.dumps(payload)
                    ]
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    if res.returncode == 0 and "rows" in res.stdout:
                        log(f"[MS LEARN CRAWLER]: Successfully saved {len(extracted_questions)} questions to Neon DB via HTTP API!")
                    else:
                        conn = get_db_connection()
                        if conn:
                            cur = conn.cursor()
                            cur.execute(
                                "INSERT INTO scraped_questions (source_url, raw_data, parsed_data, status) VALUES (%s, %s, %s, %s)",
                                (
                                    assessment_url,
                                    f"MS Learn Playwright Assessment Crawl ({len(extracted_questions)} questions)",
                                    Json({
                                        "extractedElements": extracted_questions,
                                        "metadata": {
                                            "exam": exam,
                                            "subject": subject,
                                            "description": exam_desc,
                                            "logoUrl": logo_url,
                                            "source": "Microsoft Learn Practice Assessment",
                                            "count": len(extracted_questions)
                                        }
                                    }),
                                    "pending"
                                )
                            )
                            conn.commit()
                            cur.close()
                            conn.close()
                            log("[MS LEARN CRAWLER]: Successfully saved questions via psycopg2!")
                except Exception as db_err:
                    log(f"[MS LEARN CRAWLER DB ERROR]: {db_err}")

        await context.close()
        return extracted_questions
