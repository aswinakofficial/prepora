"""
Stable, deterministic identifiers derived purely from a NormalizedQuestion's own slugs — shared by
publish.py (item 18) and validate.py (item 19), which both need to derive the same
stable_content_id without importing each other (validate must be able to check a batch for
duplicate ids *before* publish ever runs).
"""
from ..contracts import NormalizedQuestion


def _slug_component(value: str) -> str:
    return value.strip().upper().replace(" ", "-").replace("_", "-")


def _year_or_session(normalized: NormalizedQuestion):
    return normalized.year if normalized.year is not None else (normalized.session_label or "v1")


def derive_stable_content_id(normalized: NormalizedQuestion) -> str:
    """
    {EXAM}-{VARIANT}-{YEAR-or-SESSION}-{SUBJECT}-Q{number}, following the convention documented in
    agents/content/schema.md's "Stable IDs" section (e.g. KPSC-AE-2025-CIVIL-Q001), built from the
    slugs a NormalizedQuestion already carries rather than a separate "code" field no table has.
    """
    if normalized.number is None:
        raise ValueError("Cannot derive a stable_content_id without a question number.")
    parts = [
        normalized.exam_slug,
        normalized.exam_variant_slug,
        str(_year_or_session(normalized)),
        normalized.subject_slug,
    ]
    base = "-".join(_slug_component(p) for p in parts)
    return f"{base}-Q{normalized.number:03d}"


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
