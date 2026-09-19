"""
ExtractedQuestion — a connector's parser output, before normalization.

Deliberately mirrors the scraper's current ad hoc shape (see
docs/architecture/prepora-next-level-plan.md §6, "the shape mismatch": `{questionText,
options: string[], answer: str, explanation, exam, subject}`, apps/scraper/handlers/generic.py) —
free-text options, a free-text answer, unresolved exam/subject hints. Bridging this shape into
NormalizedQuestion's structured options and discriminated-union answer is the normalizer's job
(a later pipeline stage), not this contract's — see NormalizedQuestion's docstring.
"""
from pydantic import BaseModel, Field

from .versions import CONTRACT_VERSION


class ExtractedQuestion(BaseModel):
    raw_artifact_sha256: str = Field(
        min_length=64, max_length=64, description="Provenance link back to the source RawArtifact."
    )
    source_slug: str = Field(min_length=1)

    question_text: str = Field(min_length=1)
    options: list[str] = Field(
        default_factory=list, description="Free-text options in source order, no keys assigned yet."
    )
    answer: str | None = Field(
        default=None,
        description="Free-text answer exactly as extracted — not yet resolved to an option key "
        "or typed answer.",
    )
    explanation: str | None = None

    exam_hint: str | None = Field(
        default=None,
        description="Free-text exam name/slug guess from the source, unresolved against the "
        "exams table.",
    )
    subject_hint: str | None = Field(
        default=None,
        description="Free-text subject name/slug guess from the source, unresolved against the "
        "subjects table.",
    )

    contract_version: str = CONTRACT_VERSION
    parser_version: str = Field(
        min_length=1,
        description="The connector parser that produced this record, e.g. 'ms-learn-v3'. Each "
        "connector owns its own version string.",
    )
