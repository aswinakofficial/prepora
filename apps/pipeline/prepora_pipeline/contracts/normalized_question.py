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

from pydantic import BaseModel, Field, field_validator

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

# docs/specs/03-paper-structure-min.md — mirror packages/db/src/schema/shared.ts's enums of the
# same names.
AnswerStatus = Literal["scored", "marks_to_all", "dropped", "cancelled"]
AnswerProvenance = Literal[
    "official_final",
    "official_provisional",
    "official_sample_key",
    "reviewer",
    "ai_suggested_confirmed",
    "community",
]
PaperKind = Literal["past_paper", "official_practice", "sample_paper", "model_paper"]
KeyStatus = Literal["none", "provisional", "final", "revised"]


class NormalizedOption(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z]$", description="A single letter, e.g. 'A'.")
    text: str = Field(min_length=1)


class NormalizedMedia(BaseModel):
    """An image belonging to the question, already stored in the media store
    (prepora_pipeline/core/media_store.py) — publishing records it, it never fetches anything."""

    placement: Literal["question", "option", "explanation"]
    option_key: str | None = Field(default=None, pattern=r"^[A-Za-z]$")
    storage_key: str = Field(pattern=r"^[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$")
    mime_type: str = Field(pattern=r"^image/(png|jpeg|gif|webp|svg\+xml)$")
    alt_text: str | None = Field(default=None, max_length=500)
    size_bytes: int | None = Field(default=None, ge=0)
    source_url: str | None = None


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
    answer: str = Field(min_length=1)  # for display, e.g. "4.24 to 4.26"
    # Accepted ranges, inclusive — "-0.61 to -0.57 OR 0.57 to 0.61" is two. Unset: `answer` is
    # compared as text.
    ranges: list[tuple[float, float]] | None = None

    @field_validator("ranges")
    @classmethod
    def _ranges_are_ordered(cls, ranges):
        for lo, hi in ranges or []:
            if lo > hi:
                raise ValueError(f"Numeric range {lo} to {hi} has its lower bound above its upper.")
        return ranges


# Mirrors packages/content/src/schema.ts's AnswerSchema discriminated union field for field, so a
# NormalizedQuestion round-trips through the same shape whether it came from Python or TypeScript —
# except NumericalAnswer.ranges, which authored Markdown content has no use for yet.
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
    # Human-readable name for the question set this question belongs to, used only when publishing
    # creates that set — it never renames an existing one, and it isn't part of the set's slug.
    question_set_title: str | None = Field(default=None, max_length=200)

    # How the question is identified across runs (stages/stable_id.py): "position" for exam papers,
    # where number N of a given paper is a fixed question; "content" for sources that draw
    # questions at random from a pool (MS Learn), where only the text identifies a question.
    # Unset means "whatever this question's source declares" (dedupe/profile.py's
    # effective_identity), so a producer doesn't have to know — "position" if the source declares
    # nothing.
    identity: Literal["position", "content"] | None = None

    # Question content.
    number: int | None = Field(default=None, gt=0)
    # Facts about the question in this paper (docs/specs/03-paper-structure-min.md): its section
    # ("General Aptitude"), its number as printed ("Q.31"), and its marks.
    section: str | None = None
    number_label: str | None = None
    marks: float | None = None
    negative_marks: float | None = None
    question_text: str = Field(min_length=1)
    question_type: QuestionType = "mcq"
    options: list[NormalizedOption] = Field(default_factory=list)
    answer: NormalizedAnswer | None = None
    # Not "scored" when the official key gave marks to everyone, or dropped or cancelled the
    # question — then there's honestly no answer, and `answer` may be None.
    answer_status: AnswerStatus = "scored"
    # Who says `answer` is right, and what kind of paper this is and how settled its key.
    answer_provenance: AnswerProvenance = "official_final"
    paper_kind: PaperKind = "past_paper"
    key_status: KeyStatus = "final"
    explanation: str | None = None
    topic_slug: str | None = None
    # Images in the stem, an option or the explanation, in display order.
    media: list[NormalizedMedia] = Field(default_factory=list)
    difficulty: Difficulty | None = None
    tags: list[str] | None = None

    # Set by the parser/normalizer when the answer is ambiguous or missing — see
    # docs/roadmap/engineering-roadmap.md item 19 for the FLAG FOR HUMAN REVIEW defect this
    # flag exists to eventually close.
    needs_review: bool = False
    review_note: str | None = None

    contract_version: str = CONTRACT_VERSION
    parser_version: str = Field(min_length=1)
