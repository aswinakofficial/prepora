"""
Stable, deterministic identifiers derived purely from a NormalizedQuestion's own slugs — shared by
publish.py (item 18) and validate.py (item 19), which both need to derive the same
stable_content_id without importing each other (validate must be able to check a batch for
duplicate ids *before* publish ever runs).
"""
import hashlib

from ..contracts import NormalizedQuestion
from ..dedupe.fingerprint import shape_of
from ..dedupe.normalize import normalize_question_text
from ..dedupe.profile import effective_identity


def _slug_component(value: str) -> str:
    return value.strip().upper().replace(" ", "-").replace("_", "-")


def _year_or_session(normalized: NormalizedQuestion):
    return normalized.year if normalized.year is not None else (normalized.session_label or "v1")


def derive_stable_content_id(normalized: NormalizedQuestion, *, distinct: bool = False) -> str:
    """
    Position identity (the default): {EXAM}-{VARIANT}-{YEAR-or-SESSION}-{SUBJECT}-Q{number}, with
    -{SHIFT} before -Q{number} when the paper has a sitting (docs/specs/03-paper-structure-min.md),
    following agents/content/schema.md's "Stable IDs" convention (e.g. KPSC-AE-2025-CIVIL-Q001) —
    right for exam papers, where "question 7 of the 2025 paper" is a fixed thing.

    Content identity (identity="content"): ...-C{sha256 of the normalized text}. For sources that
    draw questions at random from a pool (MS Learn practice assessments), a position means nothing:
    a new question that happened to appear 7th used to take the existing Q007's identity and be
    silently dropped as "already published". Hashing the content gives the same question the same
    id in every scrape, and a new question a new one. SHA-256 rather than content_hash()'s 32-bit
    djb2, because this is an identity — a collision would merge two different questions.

    The identity mode is the question's own if its producer set one, else its source's
    (dedupe/profile.py's effective_identity()).

    distinct=True: a reviewer decided this is a different question from one with the same id —
    identical wording with different options or answer (dedupe's "conflicting_duplicate"). The id
    then also covers the options and answer, so both can exist.
    """
    if effective_identity(normalized) == "content":
        digest = hashlib.sha256(
            normalize_question_text(normalized.question_text).encode("utf-8")
        ).hexdigest()
        stable_id = f"{_stable_base(normalized)}-C{digest[:16].upper()}"
    else:
        if normalized.number is None:
            raise ValueError("Cannot derive a stable_content_id without a question number.")
        # The sitting, when there is one, so GATE's CS-1 and CS-2 of one year don't collide. IDs
        # without a shift are unchanged.
        sitting = f"-{_slug_component(normalized.shift)}" if normalized.shift else ""
        stable_id = f"{_stable_base(normalized)}{sitting}-Q{normalized.number:03d}"
    if distinct:
        shape = shape_of(normalized)
        signature = "\x1f".join(sorted(shape.options)) + "\x1e" + "\x1f".join(sorted(shape.correct))
        stable_id += f"-D{hashlib.sha256(signature.encode('utf-8')).hexdigest()[:8].upper()}"
    return stable_id


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
