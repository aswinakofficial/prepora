"""
Stable, deterministic identifiers derived purely from a NormalizedQuestion's own slugs — shared by
publish.py (item 18) and validate.py (item 19), which both need to derive the same
stable_content_id without importing each other (validate must be able to check a batch for
duplicate ids *before* publish ever runs).
"""
import hashlib

from ..contracts import NormalizedQuestion
from .content_hash import normalize_question_text


def _slug_component(value: str) -> str:
    return value.strip().upper().replace(" ", "-").replace("_", "-")


def _year_or_session(normalized: NormalizedQuestion):
    return normalized.year if normalized.year is not None else (normalized.session_label or "v1")


def derive_stable_content_id(normalized: NormalizedQuestion) -> str:
    """
    Position identity (the default): {EXAM}-{VARIANT}-{YEAR-or-SESSION}-{SUBJECT}-Q{number},
    following agents/content/schema.md's "Stable IDs" convention (e.g. KPSC-AE-2025-CIVIL-Q001) —
    right for exam papers, where "question 7 of the 2025 paper" is a fixed thing.

    Content identity (identity="content"): ...-C{sha256 of the normalized text}. For sources that
    draw questions at random from a pool (MS Learn practice assessments), a position means nothing:
    a new question that happened to appear 7th used to take the existing Q007's identity and be
    silently dropped as "already published". Hashing the content gives the same question the same
    id in every scrape, and a new question a new one. SHA-256 rather than content_hash()'s 32-bit
    djb2, because this is an identity — a collision would merge two different questions.
    """
    if normalized.identity == "content":
        digest = hashlib.sha256(
            normalize_question_text(normalized.question_text).encode("utf-8")
        ).hexdigest()
        return f"{_stable_base(normalized)}-C{digest[:16].upper()}"
    if normalized.number is None:
        raise ValueError("Cannot derive a stable_content_id without a question number.")
    return f"{_stable_base(normalized)}-Q{normalized.number:03d}"


def _stable_base(normalized: NormalizedQuestion) -> str:
    parts = [
        normalized.exam_slug,
        normalized.exam_variant_slug,
        str(_year_or_session(normalized)),
        normalized.subject_slug,
    ]
    return "-".join(_slug_component(p) for p in parts)


def derive_question_set_slug(normalized: NormalizedQuestion) -> str:
    parts = [
        normalized.exam_slug,
        normalized.exam_variant_slug,
        str(_year_or_session(normalized)),
        normalized.subject_slug,
    ]
    if normalized.shift:
        parts.append(normalized.shift)
    return "-".join(p.lower().replace(" ", "-").replace("_", "-") for p in parts)
