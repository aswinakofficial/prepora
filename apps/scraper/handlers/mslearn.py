import re
from typing import Dict, List
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import BaseScraperHandler


class MsLearnHandler(BaseScraperHandler):
    name = "Microsoft Learn"
    domain_patterns = [r"learn\.microsoft\.com", r"microsoft\.com"]

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        soup = BeautifulSoup(html, 'html.parser')
        extracted_questions = []

        # Look for fieldsets or quiz containers in Microsoft Learn Practice Assessment HTML
        containers = soup.find_all(['fieldset', 'div', 'section'], class_=re.compile(r'quiz|assessment|question|fieldset|card', re.I))
        if not containers:
            containers = [soup]

        for idx, fs in enumerate(containers):
            p_tags = fs.find_all('p')
            q_texts = []
            for p in p_tags:
                txt = p.get_text(" ", strip=True)
                if txt and not txt.startswith("Question ") and not txt.startswith("Select "):
                    q_texts.append(txt)
            
            q_text = " ".join(q_texts) if q_texts else ""
            if not q_text:
                header = fs.find(['h2', 'h3', 'h4', 'legend', 'label', 'div'])
                if header:
                    q_text = header.get_text(" ", strip=True)

            if not q_text or len(q_text) < 10:
                continue

            # Extract options/choices
            choices = []
            labels = fs.find_all('label', class_=re.compile(r'quiz-choice|radio|checkbox|choice|option', re.I))
            for lbl in labels:
                c_txt = lbl.get_text(" ", strip=True)
                if c_txt and c_txt not in choices:
                    choices.append(c_txt)

            if not choices:
                inputs = fs.find_all('input', type=['radio', 'checkbox'])
                for inp in inputs:
                    parent_lbl = inp.find_parent('label') or inp.find_next_sibling('label')
                    if parent_lbl:
                        c_txt = parent_lbl.get_text(" ", strip=True)
                        if c_txt and c_txt not in choices:
                            choices.append(c_txt)

            # Rationale / Explanation
            rationale = fs.find(class_=re.compile(r'rationale|explanation|correct', re.I))
            # No placeholder when there's no rationale: a missing explanation stays missing (the
            # review queue flags it) rather than being filled with boilerplate text.
            explanation_text = rationale.get_text(" ", strip=True) if rationale else None
            
            # Extract additional reading links - search for all links that might be resources
            additional_reading_links = []
            
            # First, try to find links in the rationale section
            if rationale:
                links = rationale.find_all('a', href=True)
                for link in links:
                    href = link['href']
                    link_text = link.get_text(strip=True)
                    if link_text and href:
                        # Construct absolute URL if relative
                        if href.startswith("/"):
                            href = f"https://learn.microsoft.com{href}"
                        elif not href.startswith("http"):
                            href = urljoin(target_url, href)
                        
                        additional_reading_links.append({
                            "text": link_text,
                            "url": href
                        })
            
            # Also search for links in sibling elements after rationale (common pattern)
            if rationale and not additional_reading_links:
                # Look for any text containing "Additional Reading"
                all_text = fs.get_text()
                if "Additional Reading" in all_text:
                    # Find all links in the fieldset and filter by those that look like resources
                    all_fs_links = fs.find_all('a', href=True)
                    for link in all_fs_links:
                        link_text = link.get_text(strip=True)
                        href = link['href']
                        # Filter for resource-like links (common keywords)
                        if any(keyword in link_text.lower() for keyword in 
                               ['microsoft', 'learn', 'docs', 'guide', 'tutorial', 'concept', 
                                'pattern', 'architecture', 'dynamics', 'dataverse', 'power', 'module']):
                            if link_text and href:
                                if href.startswith("/"):
                                    href = f"https://learn.microsoft.com{href}"
                                elif not href.startswith("http"):
                                    href = urljoin(target_url, href)
                                
                                # Avoid duplicates
                                if not any(
                                    link["url"] == href for link in additional_reading_links
                                ):
                                    additional_reading_links.append({
                                        "text": link_text,
                                        "url": href
                                    })

            extracted_questions.append({
                "questionText": f"Question #{idx+1}: {q_text}",
                "options": choices if len(choices) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                "answer": choices[0] if choices else "Option A",
                "explanation": explanation_text,
                "additionalReadingLinks": additional_reading_links,
                "exam": exam or "Microsoft Certified: Azure Administrator",
                "subject": subject or "AZ-104 Cloud Architecture",
            })

        # Fallback if specific container structure didn't yield questions
        if not extracted_questions:
            p_tags = soup.find_all('p')
            for idx, p in enumerate(p_tags):
                txt = p.get_text(" ", strip=True)
                if ("?" in txt or "select" in txt.lower() or "which" in txt.lower()) and len(txt) > 20:
                    extracted_questions.append({
                        "questionText": f"Question #{idx+1}: {txt}",
                        "options": ["Option A", "Option B", "Option C", "Option D"],
                        "answer": "Option A",
                        "explanation": f"Extracted from Microsoft Learn page ({target_url})",
                        "exam": exam or "Microsoft Certified: Azure Administrator",
                        "subject": subject or "AZ-104 Cloud Architecture",
                    })

        return extracted_questions

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        next_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'learn.microsoft.com' in href and ('assessment' in href or 'practice' in href or 'certifications' in href):
                next_links.append(urljoin(current_url, href))
        return list(set(next_links))
