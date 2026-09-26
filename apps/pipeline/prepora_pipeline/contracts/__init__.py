"""
The five pipeline contracts — see docs/roadmap/engineering-roadmap.md item 11.

RawArtifact -> ExtractedQuestion -> NormalizedQuestion -> ValidatedQuestion -> CanonicalQuestion
"""
from .canonical_question import CanonicalAnswer, CanonicalOption, CanonicalQuestion
from .extracted_question import ExtractedQuestion
from .normalized_question import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedAnswer,
    NormalizedMedia,
    NormalizedOption,
    NormalizedQuestion,
    NumericalAnswer,
    TextAnswer,
)
from .raw_artifact import RawArtifact
from .validated_question import ValidatedQuestion
from .versions import CONTRACT_VERSION, PIPELINE_VERSION

__all__ = [
    "CONTRACT_VERSION",
    "PIPELINE_VERSION",
    "RawArtifact",
    "ExtractedQuestion",
    "NormalizedQuestion",
    "NormalizedMedia",
    "NormalizedOption",
    "NormalizedAnswer",
    "McqAnswer",
    "MultipleCorrectAnswer",
    "TextAnswer",
    "NumericalAnswer",
    "ValidatedQuestion",
    "CanonicalQuestion",
    "CanonicalOption",
    "CanonicalAnswer",
]
