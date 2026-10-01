"""Moved to prepora_pipeline.dedupe.normalize — the shared duplicate-detection layer. Re-exported so
existing imports keep working."""
from ..dedupe.normalize import content_hash, normalize_question_text

__all__ = ["content_hash", "normalize_question_text"]
