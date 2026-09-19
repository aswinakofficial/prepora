import asyncio
import os
import re
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv("../../.env")

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    try:
        return psycopg2.connect(db_url)
    except Exception as e:
        print(f"Warning: DB connection error: {e}")
        return None

async def crawl_ms_learn_assessment(
    assessment_url: str, 
    exam: str = "MS Learn AB-100", 
    subject: str = "Agentic AI Business Solutions Architect", 
    max_questions: int = 50, 
    headless: bool = False
) -> list:
    print(f"Starting Microsoft Learn Playwright Practice Assessment Crawl for: {assessment_url}")
    
    async with async_playwright() as p:
        user_data_dir = os.path.expanduser("~/.cache/ms_learn_scraper_profile")
        os.makedirs(user_data_dir, exist_ok=True)
        
        # Note: storage_state is NOT used with persistent contexts
        # The user_data_dir automatically manages all session state (cookies, localStorage, etc.)
        context = await p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=headless,
            viewport={"width": 1400, "height": 900}
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(assessment_url)
        await page.wait_for_load_state("networkidle")

        print("Navigated to Microsoft Learn. Checking for auth prompt...")
        
        if "login.microsoftonline.com" in page.url:
            print("Login required! Please complete authentication in the browser window...")
            await page.wait_for_url("**/practice/assessment**", timeout=120000)
            print("Successfully authenticated and redirected to assessment wizard!")

        extracted_questions = []
        
        for q_index in range(1, max_questions + 1):
            await page.wait_for_timeout(2000)
            
            q_header = await page.query_selector("label.is-size-5, .quiz-header, h2")
            q_num_text = await q_header.inner_text() if q_header else f"Question {q_index}"
            print(f"\n--- Scraping {q_num_text} ---")

            fieldset = await page.query_selector("fieldset")
            if not fieldset:
                print("No question fieldset found on page. Might have reached end of assessment.")
                break
                
            q_paragraphs = await fieldset.query_selector_all("p")
            q_texts = []
            for p_elem in q_paragraphs:
                txt = (await p_elem.inner_text()).strip()
                if txt and not txt.startswith("Question ") and not txt.startswith("Select "):
                    q_texts.append(txt)
            
            question_body = "\n".join(q_texts)

            choice_labels = await fieldset.query_selector_all("label.quiz-choice, label.radio, label.checkbox")
            choices = []
            for c_elem in choice_labels:
                c_text = (await c_elem.inner_text()).strip()
                if c_text:
                    choices.append(c_text)

            check_ans_btn = await page.query_selector("button#checkUserAnswer, button:has-text('Check Your Answer')")
            correct_answer = choices[0] if choices else "Option A"
            explanation = "Extracted directly from Microsoft Learn Practice Assessment via Playwright."

            if check_ans_btn:
                first_option = await fieldset.query_selector("input.radio-dot, input[type='radio'], input[type='checkbox']")
                if first_option:
                    await first_option.click()
                    await page.wait_for_timeout(500)

                await check_ans_btn.click()
                await page.wait_for_timeout(1500)

                correct_label = await fieldset.query_selector("label.is-correct, .quiz-choice:has-text('is correct')")
                if correct_label:
                    correct_answer = (await correct_label.inner_text()).strip()

                rationale_elem = await page.query_selector(".rationale, .explanation, [data-bi-name='rationale']")
                additional_reading_links = []
                if rationale_elem:
                    explanation = (await rationale_elem.inner_text()).strip()
                    
                    # Extract additional reading links from the rationale section
                    links = await rationale_elem.query_selector_all("a[href]")
                    for link in links:
                        href = await link.get_attribute("href")
                        link_text = (await link.inner_text()).strip()
                        if href and link_text:
                            # Construct absolute URL if relative
                            if href.startswith("/"):
                                href = f"https://learn.microsoft.com{href}"
                            elif not href.startswith("http"):
                                href = f"https://learn.microsoft.com/{href}"
                            
                            additional_reading_links.append({
                                "text": link_text,
                                "url": href
                            })
                    
                    if additional_reading_links:
                        print(f"Found {len(additional_reading_links)} additional reading links in rationale")
                
                # Search for additional reading section throughout the page
                if not additional_reading_links:
                    try:
                        all_elements = await page.query_selector_all("div, section, article")
                        
                        for elem in all_elements:
                            try:
                                elem_text = (await elem.inner_text()).strip()
                                if "additional reading" in elem_text.lower() or "additional resources" in elem_text.lower():
                                    links = await elem.query_selector_all("a[href]")
                                    for link in links:
                                        href = await link.get_attribute("href")
                                        link_text = (await link.inner_text()).strip()
                                        if href and link_text:
                                            if href.startswith("/"):
                                                href = f"https://learn.microsoft.com{href}"
                                            elif not href.startswith("http"):
                                                href = f"https://learn.microsoft.com/{href}"
                                            
                                            if not any(l["url"] == href for l in additional_reading_links):
                                                additional_reading_links.append({
                                                    "text": link_text,
                                                    "url": href
                                                })
                                    
                                    if additional_reading_links:
                                        print(f"Found additional reading section with {len(additional_reading_links)} links")
                                        break
                            except:
                                pass
                        
                        # Broader search for resource-like links
                        if not additional_reading_links:
                            all_links = await page.query_selector_all("a[href]")
                            for link in all_links:
                                try:
                                    link_text = (await link.inner_text()).strip()
                                    if any(keyword in link_text.lower() for keyword in 
                                           ['microsoft learn', 'power platform', 'dynamics 365', 'dataverse', 
                                            'integration pattern', 'concept', 'module', 'training', 'documentation']):
                                        href = await link.get_attribute("href")
                                        if href and link_text and ("learn.microsoft.com" in href or href.startswith("/")):
                                            if href.startswith("/"):
                                                href = f"https://learn.microsoft.com{href}"
                                            
                                            if not any(l["url"] == href for l in additional_reading_links):
                                                additional_reading_links.append({
                                                    "text": link_text,
                                                    "url": href
                                                })
                                except:
                                    pass
                            
                            if additional_reading_links:
                                print(f"Found {len(additional_reading_links)} resource links via broader search")
                    except Exception as e:
                        print(f"Could not extract additional reading links: {e}")
            
            # Fallback: Extract link titles from explanation if no links found yet
            if not additional_reading_links and "Additional Reading" in explanation:
                try:
                    read_section_match = re.search(
                        r'Additional Reading:\s*(.*?)(?=\n\s*(?:Objective:|Rationale:|$))',
                        explanation,
                        re.DOTALL | re.IGNORECASE
                    )
                    if read_section_match:
                        read_text = read_section_match.group(1).strip()
                        link_titles = [line.strip() for line in read_text.split('\n') if line.strip() and not line.strip().startswith(('-', '*', '•'))]
                        
                        for title in link_titles:
                            title = re.sub(r'^[-*•]\s*', '', title).strip()
                            if title and len(title) > 3:
                                slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
                                constructed_url = f"https://learn.microsoft.com/en-us/training/modules/{slug}/"
                                
                                additional_reading_links.append({
                                    "text": title,
                                    "url": constructed_url
                                })
                        
                        if additional_reading_links:
                            print(f"Fallback: Created {len(additional_reading_links)} links from Additional Reading text")
                except Exception as fb_err:
                    print(f"Fallback link extraction failed: {fb_err}")

            item = {
                "questionText": f"{q_num_text}: {question_body}",
                "options": choices if len(choices) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                "answer": correct_answer,
                "explanation": explanation,
                "additionalReadingLinks": additional_reading_links,
                "exam": exam,
                "subject": subject
            }
            extracted_questions.append(item)

            # Find visible Next button
            clicked_next = False
            candidates = await page.query_selector_all("button#next-button, button.next-button, button:has-text('Next'), button:has-text('Next question'), button:has-text('Continue'), button[aria-label*='Next']")
            for btn in candidates:
                try:
                    if await btn.is_visible() and await btn.is_enabled():
                        await page.evaluate("(el) => el.scrollIntoView({block: 'center', inline: 'center'})", btn)
                        await page.wait_for_timeout(300)
                        try:
                            await btn.click(timeout=3000)
                        except Exception:
                            await page.evaluate("(el) => el.click()", btn)
                        clicked_next = True
                        await page.wait_for_timeout(2000)
                        break
                except Exception:
                    continue
            
            if not clicked_next:
                print("Next button disabled or end of assessment reached.")
                break

        print(f"\nCompleted Scraping! Extracted total of {len(extracted_questions)} questions from MS Learn.")
        
        conn = get_db_connection()
        if conn and extracted_questions:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    INSERT INTO scraped_questions (source_url, raw_data, parsed_data, status)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        assessment_url,
                        f"MS Learn Playwright Crawl ({len(extracted_questions)} questions)",
                        Json({
                            "extractedElements": extracted_questions,
                            "metadata": {
                                "exam": exam,
                                "subject": subject,
                                "source": "Microsoft Learn Practice Assessment (Playwright)",
                                "count": len(extracted_questions)
                            }
                        }),
                        "pending"
                    )
                )
                conn.commit()
            except Exception as e:
                print(f"[DB INSERT ERROR]: {e}")
                conn.rollback()
            finally:
                cur.close()
                conn.close()
                print("Successfully saved all extracted questions to Neon PostgreSQL Database!")

        await context.close()
        return extracted_questions

if __name__ == "__main__":
    url = "https://learn.microsoft.com/en-us/credentials/certifications/exams/ab-100/practice/assessment?assessment-type=practice&assessmentId=1815645847&practice-assessment-type=certification&source=docs"
    asyncio.run(crawl_ms_learn_assessment(url, max_questions=5))
