"""
Deterministic quality gate — docs/roadmap/engineering-roadmap.md item 19.

Ports the seven rules from packages/content/src/validate.ts onto NormalizedQuestion, then closes
three gaps that TS version had:

1. multiple_correct answers were never cross-checked against options (only mcq was) — see
   packages/content/src/validate.test.ts's own "a real gap, not this test's concern" test. Fixed
   here: both answer types are checked the same way.
2. exam_slug was never checked against the registered catalog, only against the frontmatter's Zod
   schema shape — a slug that looked valid but named no real exam passed straight through.
3. stable_content_id uniqueness was only ever checked within a single file. validate_question_set()
   checks it across an entire batch.

It also closes the FLAG FOR HUMAN REVIEW defect (docs/architecture/prepora-next-level-plan.md
finding #12) a second, independent way: packages/content/src/parser.ts now recognises the literal
string at parse time and sets needs_review itself, but this stage additionally scans the answer/
question text directly, so a normalizer bug of the exact same shape in any future connector — one
that produces the literal flag string as an ordinary answer instead of setting needs_review — can't
silently bypass quarantine the way the original defect did.

Deterministic validation is authoritative here — any future AI-assisted checks advise, they do not
decide. This module never publishes anything; publish.py calls validate_question() first and
refuses to publish anything that doesn't come back valid, so nothing can reach the database without
passing the gate.
"""
from dataclasses import dataclass, field
from typing import Literal

from ..contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedQuestion,
    TextAnswer,
    ValidatedQuestion,
)
from ..core.db import get_db_connection
from .stable_id import derive_stable_content_id

Severity = Literal["error", "warning"]
Confidence = Literal[
    "verified", "source-confirmed", "needs-review", "community-reported", "ambiguous"
]

FLAG_FOR_HUMAN_REVIEW = "flag for human review"


@dataclass
class ValidationIssue:
    severity: Severity
    code: str
    message: str


@dataclass
class ValidationReport:
    valid: bool
    confidence: Confidence
    issues: list[ValidationIssue] = field(default_factory=list)
    # Set only when valid — the ValidatedQuestion publish.py should use downstream, never a second,
    # independently-constructed copy of the same data.
    validated: ValidatedQuestion | None = None


def _text_mentions_flag(text: str | None) -> bool:
    return bool(text) and FLAG_FOR_HUMAN_REVIEW in text.lower()


def _exam_is_registered(exam_slug: str) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM exams WHERE slug = %s", (exam_slug,))
            return cur.fetchone() is not None
    finally:
        conn.close()


def _confidence_for(normalized: NormalizedQuestion, valid: bool) -> Confidence:
    if not valid:
        return "needs-review"
    if normalized.source_type == "official":
        return "verified"
    if normalized.source_type == "editorial":
        return "source-confirmed"
    if normalized.source_type == "user_submitted":
        return "community-reported"
    return "ambiguous"


def validate_question(
    normalized: NormalizedQuestion, *, batch_stable_ids: set[str] | None = None
) -> ValidationReport:
    """
    Runs every rule against a single NormalizedQuestion. `batch_stable_ids`, when provided, is
    mutated in place by the caller across a whole batch (see validate_question_set) so duplicate
    stable_content_ids are caught across the batch, not just within one question.
    """
    issues: list[ValidationIssue] = []

    if not normalized.question_text or not normalized.question_text.strip():
        issues.append(
            ValidationIssue("error", "MISSING_QUESTION_TEXT", "Question text is empty")
        )

    if normalized.question_type == "mcq" and len(normalized.options) < 2:
        issues.append(
            ValidationIssue(
                "error", "MCQ_MISSING_OPTIONS", "MCQ question must have at least 2 options"
            )
        )

    keys = [opt.key for opt in normalized.options]
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    if dupes:
        issues.append(
            ValidationIssue(
                "error", "DUPLICATE_OPTION_KEYS", f"Duplicate option keys: {', '.join(dupes)}"
            )
        )

    if normalized.answer is None:
        issues.append(ValidationIssue("error", "MISSING_ANSWER", "No answer found"))

    for media in normalized.media:
        if media.placement == "option" and media.option_key not in keys:
            issues.append(
                ValidationIssue(
                    "error",
                    "MEDIA_OPTION_NOT_FOUND",
                    f"Image {media.storage_key} is attached to option {media.option_key!r}, "
                    f"which is not among {keys!r}",
                )
            )
        elif media.placement != "option" and media.option_key is not None:
            issues.append(
                ValidationIssue(
                    "error",
                    "MEDIA_OPTION_KEY_MISPLACED",
                    f"Image {media.storage_key} has an option key but placement "
                    f"{media.placement!r}",
                )
            )

    if isinstance(normalized.answer, McqAnswer) and keys:
        if normalized.answer.correct_key not in keys:
            issues.append(
                ValidationIssue(
                    "error",
                    "INVALID_ANSWER_KEY",
                    f"Answer key {normalized.answer.correct_key!r} not in options {keys!r}",
                )
            )

    # Closes the gap validate.test.ts documents: multiple_correct answers were never checked.
    if isinstance(normalized.answer, MultipleCorrectAnswer) and keys:
        missing = [k for k in normalized.answer.correct_keys if k not in keys]
        if missing:
            issues.append(
                ValidationIssue(
                    "error",
                    "INVALID_ANSWER_KEY",
                    f"Answer keys {missing!r} not in options {keys!r}",
                )
            )

    if not normalized.explanation:
        issues.append(
            ValidationIssue("warning", "MISSING_EXPLANATION", "No explanation provided")
        )

    if normalized.needs_review:
        issues.append(
            ValidationIssue(
                "error",
                "NEEDS_REVIEW",
                normalized.review_note or "Question flagged for human review",
            )
        )

    # The FLAG FOR HUMAN REVIEW defect, checked independently of needs_review — see module
    # docstring. Only reported once even if needs_review is also already (correctly) set.
    flagged_text = None
    if isinstance(normalized.answer, TextAnswer) and _text_mentions_flag(normalized.answer.answer):
        flagged_text = normalized.answer.answer
    elif _text_mentions_flag(normalized.question_text):
        flagged_text = normalized.question_text
    if flagged_text is not None and not normalized.needs_review:
        issues.append(
            ValidationIssue(
                "error",
                "NEEDS_REVIEW",
                f'Answer contains the literal "FLAG FOR HUMAN REVIEW" convention: {flagged_text!r}',
            )
        )

    if not _exam_is_registered(normalized.exam_slug):
        issues.append(
            ValidationIssue(
                "error",
                "EXAM_NOT_REGISTERED",
                f"Exam {normalized.exam_slug!r} is not registered in the catalog. Register it "
                "(and its organization/exam type) before publishing content for it — see "
                "docs/roadmap/engineering-roadmap.md item 10.",
            )
        )

    if normalized.number is not None and batch_stable_ids is not None:
        try:
            stable_id = derive_stable_content_id(normalized)
        except Exception:
            stable_id = None
        if stable_id is not None:
            if stable_id in batch_stable_ids:
                issues.append(
                    ValidationIssue(
                        "error",
                        "DUPLICATE_STABLE_CONTENT_ID",
                        f"{stable_id} appears more than once in this batch",
                    )
                )
            batch_stable_ids.add(stable_id)

    valid = not any(i.severity == "error" for i in issues)

    validated = None
    if valid:
        try:
            validated = ValidatedQuestion(**normalized.model_dump())
        except Exception as exc:
            valid = False
            issues.append(
                ValidationIssue("error", "VALIDATED_QUESTION_CONSTRUCTION_FAILED", str(exc))
            )

    return ValidationReport(
        valid=valid,
        confidence=_confidence_for(normalized, valid),
        issues=issues,
        validated=validated,
    )


def validate_question_set(
    normalized_questions: list[NormalizedQuestion],
) -> list[tuple[NormalizedQuestion, ValidationReport]]:
    """Validates a whole batch, sharing one duplicate-stable-id check across all of it."""
    seen_stable_ids: set[str] = set()
    return [
        (q, validate_question(q, batch_stable_ids=seen_stable_ids)) for q in normalized_questions
    ]
