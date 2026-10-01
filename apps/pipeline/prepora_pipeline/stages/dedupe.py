"""Moved to prepora_pipeline.dedupe — the shared duplicate-detection layer
(docs/architecture/dedupe.md). Re-exported so existing imports keep working."""
from ..dedupe import (
    NEEDS_DECISION,
    DedupeDecision,
    DedupeOutcome,
    check_duplicate,
    compare_with_existing,
    levenshtein,
    plan_batch,
    similarity,
)

NEAR_DUPLICATE_THRESHOLD = 0.9

__all__ = [
    "NEAR_DUPLICATE_THRESHOLD",
    "NEEDS_DECISION",
    "DedupeDecision",
    "DedupeOutcome",
    "check_duplicate",
    "compare_with_existing",
    "levenshtein",
    "plan_batch",
    "similarity",
]
