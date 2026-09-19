import re
from typing import List, Dict
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from .base import BaseScraperHandler

class GenericHandler(BaseScraperHandler):
    name = "Generic"
    domain_patterns = [r".*"] # Match-all fallback

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        soup = BeautifulSoup(html, 'html.parser')
        extracted_questions = []

        if parser_mode in ["mcq", "auto", "global"]:
            containers = soup.find_all(class_=re.compile(r'question|quiz|mcq|qa-item|entry-content', re.I))
            if containers:
                for container in containers[:20]:
                    p_tags = container.find_all(['p', 'div', 'span'])
                    for p in p_tags:
                        text = p.get_text(strip=True)
                        if (re.match(r'^(Q\d+[\.:]?|\d+[\.:]|\bWhat\b|\bWhich\b|\bCalculate\b|\bThe\b)', text) or text.endswith("?")) and len(text) > 15:
                            options = []
                            parent = p.find_parent()
                            if parent:
                                option_elements = parent.find_all(['li', 'div', 'span'], text=re.compile(r'^[a-dA-D][\.\)]'))
                                for opt in option_elements:
                                    options.append(opt.get_text(strip=True))

                            extracted_questions.append({
                                "questionText": text,
                                "options": options if len(options) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                                "answer": options[0] if options else "Option A",
                                "explanation": f"Scraped from {target_url}",
                                "exam": exam,
                                "subject": subject,
                            })

        if not extracted_questions or parser_mode == "paragraph":
            for p in soup.find_all("p"):
                text = p.get_text(strip=True)
                if text.endswith("?") and len(text) > 15:
                    extracted_questions.append({
                        "questionText": text,
                        "options": ["(a) Standard Condition A", "(b) Standard Condition B", "(c) Standard Condition C", "(d) None of the above"],
                        "answer": "(a) Standard Condition A",
                        "explanation": f"Extracted via paragraph parser from {target_url}",
                        "exam": exam,
                        "subject": subject,
                    })

        seen = set()
        unique = []
        for q in extracted_questions:
            if q["questionText"] not in seen:
                seen.add(q["questionText"])
                unique.append(q)
        return unique

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        next_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'page' in href or 'next' in href or re.search(r'\d+', href):
                full_url = urljoin(current_url, href)
                if full_url != current_url:
                    next_links.append(full_url)
        return list(set(next_links))
