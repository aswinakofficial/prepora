"""
The shared duplicate-detection layer — see docs/architecture/dedupe.md.

Source-agnostic: nothing in this package knows about any particular source. What differs per
source (identity mode, thresholds, text a source wraps around its questions) is declared by that
source's connector and reaches this layer only as a DedupeProfile (profile.py).
"""
from .check import (
    NEEDS_DECISION,
    DedupeDecision,
    DedupeOutcome,
    check_duplicate,
    compare_with_existing,
    decide,
    find_same_question,
    plan_batch,
)
from .fingerprint import AnswerShape, shape_of, shape_of_published
from .normalize import NORMALIZATION_VERSION, content_hash, normalize_question_text
from .profile import (
    DEFAULT_PROFILE,
    DedupeProfile,
    effective_identity,
    profile_for,
    profile_for_url,
)
from .similarity import levenshtein, similarity

__all__ = [
    "AnswerShape",
    "DEFAULT_PROFILE",
    "DedupeDecision",
    "DedupeOutcome",
    "DedupeProfile",
    "NEEDS_DECISION",
    "NORMALIZATION_VERSION",
    "check_duplicate",
    "compare_with_existing",
    "content_hash",
    "decide",
    "effective_identity",
    "find_same_question",
    "levenshtein",
    "normalize_question_text",
    "plan_batch",
    "profile_for",
    "profile_for_url",
    "shape_of",
    "shape_of_published",
    "similarity",
]
