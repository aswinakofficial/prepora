"""
CanonicalQuestion — the final, DB-ready shape a validated question takes just before publishing.

Field names below are chosen to map directly onto packages/db/src/schema/questions.ts's `questions`,
`question_options`, and `question_answers` tables (see test_conformance.py, which checks this
mapping against a live migrated database — this is the R1 mitigation in
docs/architecture/prepora-next-level-plan.md §20: "a schema-conformance test runs the Python
contracts against a migrated test database in CI"). Fields that require a runtime database lookup to
resolve — topic_id, question_id, correct_option_id, question_set_id — stay as slugs/keys here and
are resolved by the publish stage (docs/roadmap/engineering-roadmap.md item 18), which is the only
place that can look them up.
"""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .versions import CONTRACT_VERSION, PIPELINE_VERSION

QuestionType = Literal[
    "mcq",
    "multiple_correct",
    "true_false",
    "fill_blank",
    "descriptive",
    "numerical",
    "assertion_reason",
    "match_following",
]

Difficulty = Literal["easy", "medium", "hard", "expert"]

# Mirrors packages/db/src/schema/shared.ts's aiSourceEnum — this is `questions.source_label`.
SourceLabel = Literal["verified", "ai_generated", "community"]


class CanonicalOption(BaseModel):
    """Maps onto question_options: option_key, option_text, sequence."""

    key: str = Field(pattern=r"^[A-Za-z]$")
    text: str = Field(min_length=1)
    sequence: int = Field(ge=0)


class CanonicalAnswer(BaseModel):
    """
    Maps onto question_answers. correct_option_key is not a DB column — it is resolved to
    correct_option_id by the publish stage after this question's options are inserted and their
    keys are known, which is exactly why answer keys must never be matched by string equality
    (see docs/roadmap/engineering-roadmap.md item 18).
    """

    correct_option_key: str | None = Field(default=None, pattern=r"^[A-Za-z]$")
    text_answer: str | None = None
    numerical_answer: str | None = None
    is_correct: bool = True

    @model_validator(mode="after")
    def _require_one_answer_form(self) -> "CanonicalAnswer":
        if not any([self.correct_option_key, self.text_answer, self.numerical_answer]):
            raise ValueError(
                "CanonicalAnswer needs at least one of correct_option_key, text_answer, "
                "or numerical_answer"
            )
        return self


class CanonicalQuestion(BaseModel):
    # questions table.
    stable_content_id: str = Field(
        min_length=1,
        description="e.g. 'KPSC-AE-2025-CIVIL-Q001' — the idempotency key publishing keys off "
        "(item 18).",
    )
    slug: str = Field(min_length=1)
    question_text: str = Field(min_length=1)
    question_type: QuestionType = "mcq"
    explanation: str | None = None
    source_label: SourceLabel = "verified"
    difficulty: Difficulty | None = None
    difficulty_source: str | None = None
    topic_slug: str | None = Field(
        default=None, description="Resolved to questions.topic_id by the publish stage."
    )

    # question_options / question_answers.
    options: list[CanonicalOption] = Field(default_factory=list)
    answer: CanonicalAnswer

    # question_occurrences + the question_sets/exam_sessions it publishes into (item 10's shape).
    exam_slug: str = Field(min_length=1)
    exam_variant_slug: str = Field(min_length=1)
    subject_slug: str = Field(min_length=1)
    question_set_slug: str = Field(min_length=1)
    session_label: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    shift_label: str | None = None
    original_question_number: int | None = Field(default=None, gt=0)
    page_number: int | None = Field(default=None, gt=0)
    source_reference: str | None = None

    contract_version: str = CONTRACT_VERSION
    parser_version: str = Field(min_length=1)
    pipeline_version: str = PIPELINE_VERSION

    @model_validator(mode="after")
    def _check_option_keys(self) -> "CanonicalQuestion":
        keys = [opt.key for opt in self.options]
        if len(keys) != len(set(keys)):
            raise ValueError(f"Duplicate option keys in a canonical question: {keys!r}")
        correct_key = self.answer.correct_option_key
        if correct_key is not None and correct_key not in keys:
            raise ValueError(
                f"answer.correct_option_key {correct_key!r} is not among this question's "
                f"options {keys!r}"
            )
        return self
