"""
NormalizedQuestion — the shared contract shape every source maps onto, regardless of origin.

This is where ExtractedQuestion's shape mismatch (free-text options, free-text answer) gets bridged
— see docs/architecture/prepora-next-level-plan.md §6. The target shape is deliberately derived from
packages/content/src/schema.ts, which already encodes it correctly for authored Markdown content:
single-letter option keys, a discriminated-union answer, slugged identifiers. A scraped question and
a hand-authored Markdown question both become the same NormalizedQuestion shape, which is the whole
point of normalizing at one stage instead of writing bespoke publish logic per source.

The actual bridging logic (matching a free-text answer string to an option key, resolving an
exam/subject name to a slug) belongs to a connector's normalizer (apps/pipeline's normalize stage,
not yet built) — this module only defines the target type it must produce.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .versions import CONTRACT_VERSION

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

SourceType = Literal["official", "user_submitted", "editorial", "generated", "unknown"]


class NormalizedOption(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z]$", description="A single letter, e.g. 'A'.")
    text: str = Field(min_length=1)


class McqAnswer(BaseModel):
    type: Literal["mcq"] = "mcq"
    correct_key: str = Field(pattern=r"^[A-Za-z]$")


class MultipleCorrectAnswer(BaseModel):
    type: Literal["multiple_correct"] = "multiple_correct"
    correct_keys: list[str] = Field(min_length=1)


class TextAnswer(BaseModel):
    type: Literal["text"] = "text"
    answer: str = Field(min_length=1)


class NumericalAnswer(BaseModel):
    type: Literal["numerical"] = "numerical"
    answer: str = Field(min_length=1)


# Mirrors packages/content/src/schema.ts's AnswerSchema discriminated union exactly, field for
# field, so a NormalizedQuestion round-trips through the same shape whether it came from Python or
# TypeScript.
NormalizedAnswer = Annotated[
    McqAnswer | MultipleCorrectAnswer | TextAnswer | NumericalAnswer,
    Field(discriminator="type"),
]


class NormalizedQuestion(BaseModel):
    # Provenance — where this question came from and what produced it.
    raw_artifact_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    source_type: SourceType = "unknown"
    source_url: str | None = None
    source_document: str | None = None

    # Catalog context — slugs only; resolving these to real organizations/exams/... row IDs
    # (docs/roadmap/engineering-roadmap.md item 10's tables) is the publish stage's job.
    organization_slug: str | None = None
    exam_slug: str = Field(min_length=1)
    exam_variant_slug: str = Field(min_length=1)
    subject_slug: str = Field(min_length=1)
    year: int | None = Field(default=None, ge=1900, le=2100)
    session_label: str | None = None
    shift: str | None = None
    course_slug: str | None = None

    # Question content.
    number: int | None = Field(default=None, gt=0)
    question_text: str = Field(min_length=1)
    question_type: QuestionType = "mcq"
    options: list[NormalizedOption] = Field(default_factory=list)
    answer: NormalizedAnswer | None = None
    explanation: str | None = None
    topic_slug: str | None = None
    difficulty: Difficulty | None = None
    tags: list[str] | None = None

    # Set by the parser/normalizer when the answer is ambiguous or missing — see
    # docs/roadmap/engineering-roadmap.md item 19 for the FLAG FOR HUMAN REVIEW defect this
    # flag exists to eventually close.
    needs_review: bool = False
    review_note: str | None = None

    contract_version: str = CONTRACT_VERSION
    parser_version: str = Field(min_length=1)
