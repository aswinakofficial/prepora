"""
Markdown normalizer: ParsedQuestion + frontmatter -> NormalizedQuestion —
docs/roadmap/engineering-roadmap.md item 22.

Nearly a direct field mapping rather than the bridging work a scraped-HTML normalizer does
(see connectors/indiabix/normalizer.py) — parser.py already produces options with real keys and a
correctly-typed answer, since Markdown was never ambiguous. The one real piece of normalization
this stage does is resolving `**Topic:** Strength of Materials` (a human-readable heading, per
agents/content/schema.md) into a slug, since NormalizedQuestion.topic_slug expects one.
"""
import re

from prepora_pipeline.contracts import NormalizedOption, NormalizedQuestion

from .parser import MarkdownFrontmatter, ParsedQuestion


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")


# Who stands behind a hand-authored answer (docs/specs/03-paper-structure-min.md): only a paper
# marked "official" carries the official key; anything else was answered by a person, so it's never
# labelled as an official key.
_PROVENANCE = {"official": "official_final", "user_submitted": "community"}


def normalize(
    frontmatter: MarkdownFrontmatter,
    parsed: ParsedQuestion,
    *,
    source_document: str,
    raw_artifact_sha256: str | None = None,
) -> NormalizedQuestion:
    return NormalizedQuestion(
        raw_artifact_sha256=raw_artifact_sha256,
        source_type=frontmatter.source_type,
        source_url=frontmatter.source_url,
        source_document=frontmatter.source_document or source_document,
        organization_slug=frontmatter.organization,
        exam_slug=frontmatter.exam,
        exam_variant_slug=frontmatter.exam_variant,
        subject_slug=frontmatter.subject,
        year=frontmatter.year,
        session_label=frontmatter.session_label,
        shift=frontmatter.shift,
        course_slug=frontmatter.course,
        number=parsed.number,
        question_text=parsed.question_text,
        question_type=parsed.question_type,
        options=[NormalizedOption(key=key, text=text) for key, text in parsed.options],
        answer=parsed.answer,
        answer_provenance=_PROVENANCE.get(frontmatter.source_type, "reviewer"),
        paper_kind="past_paper" if frontmatter.source_type == "official" else "model_paper",
        explanation=parsed.explanation,
        topic_slug=_slugify(parsed.topic) if parsed.topic else None,
        difficulty=parsed.difficulty,
        tags=parsed.tags,
        needs_review=parsed.needs_review,
        review_note=parsed.review_note,
        parser_version="markdown-v1",
    )
