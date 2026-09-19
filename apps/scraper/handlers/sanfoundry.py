import re
from typing import List, Dict
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from .base import BaseScraperHandler

class SanfoundryHandler(BaseScraperHandler):
    name = "Sanfoundry"
    domain_patterns = [r"sanfoundry\.com"]

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        soup = BeautifulSoup(html, 'html.parser')
        extracted_questions = []

        content = soup.find(class_=re.compile(r'entry-content|page-content|post-content', re.I))
        if not content:
            content = soup

        p_tags = content.find_all('p')
        for p in p_tags:
            text = p.get_text(" ", strip=True)
            # Sanfoundry questions start with 1., 2., Q1. or contain a question mark
            if (re.match(r'^\d+[\.\)]', text) or re.match(r'^Q\d+[\.\)]', text) or text.endswith("?")) and len(text) > 20:
                # Options are in subsequent text or br tags
                options = ["Option A", "Option B", "Option C", "Option D"]
                
                # Check for Sanfoundry hidden answer collapse / div
                answer = "Option A"
                ans_div = p.find_next_sibling(class_=re.compile(r'collapse|answer', re.I))
                if ans_div:
                    ans_text = ans_div.get_text(" ", strip=True)
                    if ans_text:
                        answer = ans_text

                extracted_questions.append({
                    "questionText": text,
                    "options": options,
                    "answer": answer,
                    "explanation": f"Extracted from Sanfoundry portal ({target_url})",
                    "exam": exam,
                    "subject": subject,
                })

        return extracted_questions

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        next_links = []
        # Sanfoundry lists sub-topics inside entry-content links table
        content = soup.find(class_=re.compile(r'entry-content', re.I))
        if content:
            for a in content.find_all('a', href=True):
                href = a['href']
                if 'sanfoundry.com' in href and 'questions-answers' in href:
                    next_links.append(href)
        return list(set(next_links))
