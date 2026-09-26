import re
from typing import Dict, List

from bs4 import BeautifulSoup

from .base import BaseScraperHandler


class IndiaBixHandler(BaseScraperHandler):
    name = "IndiaBIX"
    domain_patterns = [r"indiabix\.com"]

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        soup = BeautifulSoup(html, 'html.parser')
        extracted_questions = []

        containers = soup.find_all('div', class_=re.compile(r'bix-div-container|bix-wrapper', re.I))
        for container in containers:
            q_div = container.find(class_=re.compile(r'bix-td-qtxt|bix-text', re.I))
            q_text = q_div.get_text(" ", strip=True) if q_div else ""

            options = []
            option_divs = container.find_all(class_=re.compile(r'bix-td-option|option-svg', re.I))
            for opt in option_divs:
                opt_txt = opt.get_text(" ", strip=True)
                if opt_txt:
                    options.append(opt_txt)

            ans_div = container.find(class_=re.compile(r'bix-ans-option|flex-row', re.I))
            answer = ans_div.get_text(" ", strip=True) if ans_div else (options[0] if options else "Option A")

            if q_text and len(q_text) > 10:
                extracted_questions.append({
                    "questionText": q_text,
                    "options": options if len(options) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                    "answer": answer,
                    "explanation": f"Extracted from IndiaBIX portal ({target_url})",
                    "exam": exam,
                    "subject": subject,
                })

        return extracted_questions

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        next_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'indiabix.com' in href:
                next_links.append(href)
        return list(set(next_links))
