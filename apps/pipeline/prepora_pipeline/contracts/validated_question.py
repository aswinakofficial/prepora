"""
ValidatedQuestion — a NormalizedQuestion that has passed the pipeline's structural invariants.

This contract enforces only what is true of *any* valid question regardless of business rule
specifics: an answer is present, option keys aren't duplicated, and an mcq/multiple_correct answer's
key(s) actually exist among the options. The deterministic quality gate itself — the seven rules
ported from packages/content/src/validate.ts, the FLAG FOR HUMAN REVIEW defect fix, confidence
labels, and quarantine reasons — is docs/roadmap/engineering-roadmap.md item 19's job
(apps/pipeline/prepora_pipeline/stages/validate.py, not yet built). That stage constructs a
ValidatedQuestion from a NormalizedQuestion after applying its own rules; this module only defines
the target type and the invariants a validator can't skip.
"""
from pydantic import model_validator

from .normalized_question import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedAnswer,
    NormalizedQuestion,
)


class ValidatedQuestion(NormalizedQuestion):
    # Required for a scored question — MISSING_ANSWER is not representable once validated. Only a
    # question whose key gave marks to everyone, or dropped or cancelled it, has none.
    answer: NormalizedAnswer | None = None

    @model_validator(mode="after")
    def _check_option_keys(self) -> "ValidatedQuestion":
        if self.answer is None and self.answer_status == "scored":
            raise ValueError("A scored question needs an answer.")

        keys = [opt.key for opt in self.options]
        if len(keys) != len(set(keys)):
            raise ValueError(f"Duplicate option keys in a validated question: {keys!r}")

        if isinstance(self.answer, McqAnswer) and self.answer.correct_key not in keys:
            raise ValueError(
                f"mcq answer key {self.answer.correct_key!r} is not among the question's "
                f"options {keys!r}"
            )
        if isinstance(self.answer, MultipleCorrectAnswer):
            missing = [k for k in self.answer.correct_keys if k not in keys]
            if missing:
                raise ValueError(
                    f"multiple_correct answer keys {missing!r} are not among the question's "
                    f"options {keys!r}"
                )

        return self
