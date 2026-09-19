from typing import Dict, List
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import BaseScraperHandler


class ExamTopicsHandler(BaseScraperHandler):
    name = "ExamTopics"
    domain_patterns = [r"examtopics\.com"]

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        soup = BeautifulSoup(html, 'html.parser')
        extracted_questions = []
        examtopics_cards = soup.find_all('div', class_='exam-question-card')

        for idx, card in enumerate(examtopics_cards):
            header = card.find('div', class_='card-header')
            q_num = header.get_text(strip=True) if header else f'Question #{idx+1}'
            body = card.find('div', class_='question-body')
            if not body:
                continue

            paragraphs = body.find_all('p', class_='card-text')
            q_text = ""
            for p in paragraphs:
                p_text = p.get_text(" ", strip=True)
                if "Question" in p_text:
                    parts = p_text.split("Question")
                    if len(parts) > 1 and parts[-1].strip():
                        q_text = parts[-1].strip()
                elif not q_text and p_text and "Introductory Info" not in p_text:
                    q_text = p_text

            if not q_text and paragraphs:
                q_text = paragraphs[-1].get_text(" ", strip=True)

            choices = []
            choice_elements = body.find_all('li', class_='multi-choice-item')
            for c in choice_elements:
                clean_c = c.get_text(" ", strip=True)
                if clean_c:
                    choices.append(clean_c)

            answer_span = body.find('span', class_='correct-answer')
            correct_letter = answer_span.get_text(strip=True) if answer_span else ""

            answer_val = choices[0] if choices else "Option A"
            if correct_letter:
                for ch in choices:
                    if ch.startswith(correct_letter) or f" {correct_letter}." in ch or ch.startswith(f"{correct_letter}."):
                        answer_val = ch
                        break

            if q_text and len(q_text) > 10:
                extracted_questions.append({
                    "questionText": f"{q_num}: {q_text}",
                    "options": choices if len(choices) >= 2 else ["Option A", "Option B", "Option C", "Option D"],
                    "answer": answer_val,
                    "explanation": f"Extracted from ExamTopics portal ({target_url})",
                    "exam": exam,
                    "subject": subject,
                })

        return extracted_questions

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html, 'html.parser')
        next_links = []
        # ExamTopics pagination /view/2/, /view/3/, etc.
        for a in soup.find_all('a', href=True):
            href = a['href']
            if '/view/' in href or 'page' in href:
                full_url = urljoin(current_url, href)
                if full_url != current_url and 'examtopics.com/exams/' in full_url:
                    next_links.append(full_url)
        return list(set(next_links))
