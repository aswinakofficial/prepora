"""
IndiaBix parser: raw HTML -> ExtractedQuestion — docs/roadmap/engineering-roadmap.md item 15.

Ported from apps/scraper/handlers/indiabix.py, with one real correction discovered while capturing
this connector's fixture: the page embeds the correct answer explicitly in a hidden input
(`input.jq-hdnakq[value]`, e.g. value="B"), so the answer is read from that field instead of
scraping the "Answer: Option X" display text the way the original handler's looser
`bix-ans-option|flex-row` selector did. Questions whose options render as images rather than text
(some IndiaBix pages use image options for pages containing formulas/diagrams) are skipped rather
than padded with fabricated "Option A/B/C/D" placeholder text, which is what the original handler
did — see docs/architecture/prepora-next-level-plan.md finding #3 on fabricated content.
"""
from bs4 import BeautifulSoup

from prepora_pipeline.contracts import ExtractedQuestion, RawArtifact

PARSER_VERSION = "indiabix-v1"


def extract(
    content: bytes,
    artifact: RawArtifact,
    *,
    exam_hint: str | None = None,
    subject_hint: str | None = None,
) -> list[ExtractedQuestion]:
    soup = BeautifulSoup(content, "html.parser")
    questions: list[ExtractedQuestion] = []

    for container in soup.find_all("div", class_="bix-div-container"):
        q_div = container.find(class_="bix-td-qtxt")
        question_text = q_div.get_text(" ", strip=True) if q_div else ""
        if not question_text or len(question_text) <= 10:
            continue

        option_vals = container.find_all(class_="bix-td-option-val")
        options = [o.get_text(" ", strip=True) for o in option_vals]
        if len(options) < 2 or any(not opt for opt in options):
            # An empty option text means it rendered as an image — not representable as a
            # free-text option; skip this question rather than fabricate placeholder text.
            continue

        hidden = container.find("input", class_="jq-hdnakq")
        answer = hidden.get("value") if hidden else None

        explanation_div = container.find(class_="bix-ans-description")
        explanation = explanation_div.get_text(" ", strip=True) if explanation_div else None

        questions.append(
            ExtractedQuestion(
                raw_artifact_sha256=artifact.sha256,
                source_slug=artifact.source_slug,
                question_text=question_text,
                options=options,
                answer=answer,
                explanation=explanation,
                exam_hint=exam_hint,
                subject_hint=subject_hint,
                parser_version=PARSER_VERSION,
            )
        )

    return questions
