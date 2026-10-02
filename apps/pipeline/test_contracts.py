"""
Tests for the five pipeline contracts — docs/roadmap/engineering-roadmap.md item 11.

Three kinds, per the roadmap's own testing note:
- Unit: each contract rejects malformed input with a useful message.
- Round-trip: serialize then deserialize preserves every field.
- Conformance (test_conformance.py, separate file): CanonicalQuestion maps cleanly onto the
  Drizzle schema, checked against a live migrated database.
"""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from prepora_pipeline.contracts import (
    CanonicalAnswer,
    CanonicalOption,
    CanonicalQuestion,
    ExtractedQuestion,
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedOption,
    NormalizedQuestion,
    NumericalAnswer,
    RawArtifact,
    ValidatedQuestion,
)

SHA = "a" * 64


def valid_raw_artifact_kwargs():
    return dict(
        sha256=SHA,
        source_slug="ms-learn",
        source_url="https://learn.microsoft.com/exam/az-900",
        fetched_at=datetime.now(timezone.utc),
        content_type="text/html",
        storage_key="raw/ms-learn/az-900/a.html",
    )


def valid_extracted_kwargs():
    return dict(
        raw_artifact_sha256=SHA,
        source_slug="ms-learn",
        question_text="What is Azure?",
        options=["A cloud platform", "A database", "A programming language"],
        answer="A cloud platform",
        parser_version="ms-learn-v1",
    )


def valid_normalized_kwargs():
    return dict(
        exam_slug="az-900-azure-fundamentals",
        exam_variant_slug="standard",
        subject_slug="azure-fundamentals",
        question_text="What is Azure?",
        options=[
            NormalizedOption(key="A", text="A cloud platform"),
            NormalizedOption(key="B", text="A database"),
        ],
        answer=McqAnswer(correct_key="A"),
        parser_version="ms-learn-v1",
    )


def valid_canonical_kwargs():
    return dict(
        stable_content_id="AZ900-Q1",
        slug="what-is-azure",
        question_text="What is Azure?",
        options=[
            CanonicalOption(key="A", text="A cloud platform", sequence=0),
            CanonicalOption(key="B", text="A database", sequence=1),
        ],
        answer=CanonicalAnswer(correct_option_key="A"),
        exam_slug="az-900-azure-fundamentals",
        exam_variant_slug="standard",
        subject_slug="azure-fundamentals",
        question_set_slug="az-900-set-1",
        parser_version="ms-learn-v1",
    )


class TestRawArtifact:
    def test_accepts_valid_input(self):
        RawArtifact(**valid_raw_artifact_kwargs())

    def test_rejects_short_sha256(self):
        kwargs = valid_raw_artifact_kwargs()
        kwargs["sha256"] = "not-a-real-hash"
        with pytest.raises(ValidationError, match="sha256"):
            RawArtifact(**kwargs)

    def test_rejects_missing_fetched_at(self):
        kwargs = valid_raw_artifact_kwargs()
        del kwargs["fetched_at"]
        with pytest.raises(ValidationError, match="fetched_at"):
            RawArtifact(**kwargs)

    def test_round_trip_preserves_every_field(self):
        original = RawArtifact(**valid_raw_artifact_kwargs())
        restored = RawArtifact.model_validate_json(original.model_dump_json())
        assert restored == original


class TestExtractedQuestion:
    def test_accepts_valid_input(self):
        ExtractedQuestion(**valid_extracted_kwargs())

    def test_rejects_empty_question_text(self):
        kwargs = valid_extracted_kwargs()
        kwargs["question_text"] = ""
        with pytest.raises(ValidationError, match="question_text"):
            ExtractedQuestion(**kwargs)

    def test_rejects_missing_parser_version(self):
        kwargs = valid_extracted_kwargs()
        del kwargs["parser_version"]
        with pytest.raises(ValidationError, match="parser_version"):
            ExtractedQuestion(**kwargs)

    def test_round_trip_preserves_every_field(self):
        original = ExtractedQuestion(**valid_extracted_kwargs())
        restored = ExtractedQuestion.model_validate_json(original.model_dump_json())
        assert restored == original


class TestNormalizedQuestion:
    def test_accepts_valid_input(self):
        NormalizedQuestion(**valid_normalized_kwargs())

    def test_answer_is_optional_unlike_validated_question(self):
        kwargs = valid_normalized_kwargs()
        del kwargs["answer"]
        # Should not raise — this is what distinguishes it from ValidatedQuestion.
        NormalizedQuestion(**kwargs)

    def test_rejects_invalid_option_key(self):
        with pytest.raises(ValidationError, match="key"):
            NormalizedOption(key="AB", text="too long")

    def test_rejects_unknown_answer_type(self):
        kwargs = valid_normalized_kwargs()
        kwargs["answer"] = {"type": "essay", "answer": "not a real answer type"}
        with pytest.raises(ValidationError):
            NormalizedQuestion(**kwargs)

    def test_round_trip_preserves_every_field(self):
        original = NormalizedQuestion(**valid_normalized_kwargs())
        restored = NormalizedQuestion.model_validate_json(original.model_dump_json())
        assert restored == original

    def test_round_trip_preserves_discriminated_answer_type(self):
        kwargs = valid_normalized_kwargs()
        kwargs["answer"] = MultipleCorrectAnswer(correct_keys=["A", "B"])
        original = NormalizedQuestion(**kwargs)
        restored = NormalizedQuestion.model_validate_json(original.model_dump_json())
        assert isinstance(restored.answer, MultipleCorrectAnswer)
        assert restored.answer.correct_keys == ["A", "B"]


    def test_v5_fields_default_to_a_scored_past_paper_with_a_final_official_key(self):
        q = NormalizedQuestion(**valid_normalized_kwargs())
        assert (q.answer_status, q.answer_provenance, q.paper_kind, q.key_status) == (
            "scored",
            "official_final",
            "past_paper",
            "final",
        )
        assert q.contract_version == "5"

    def test_numeric_ranges_round_trip(self):
        kwargs = valid_normalized_kwargs()
        kwargs["question_type"] = "numerical"
        kwargs["options"] = []
        kwargs["answer"] = NumericalAnswer(
            answer="-0.61 to -0.57 OR 0.57 to 0.61", ranges=[(-0.61, -0.57), (0.57, 0.61)]
        )
        original = NormalizedQuestion(**kwargs)
        restored = NormalizedQuestion.model_validate_json(original.model_dump_json())
        assert restored.answer.ranges == [(-0.61, -0.57), (0.57, 0.61)]

    def test_rejects_a_numeric_range_whose_lower_bound_is_above_its_upper(self):
        with pytest.raises(ValidationError, match="lower bound above"):
            NumericalAnswer(answer="4.26 to 4.24", ranges=[(4.26, 4.24)])


class TestValidatedQuestion:
    def test_accepts_valid_input(self):
        ValidatedQuestion(**valid_normalized_kwargs())

    def test_no_answer_is_allowed_only_when_the_question_is_not_scored(self):
        kwargs = valid_normalized_kwargs()
        del kwargs["answer"]
        for status in ("marks_to_all", "dropped", "cancelled"):
            assert ValidatedQuestion(**kwargs, answer_status=status).answer is None
        with pytest.raises(ValidationError, match="scored question needs an answer"):
            ValidatedQuestion(**kwargs, answer_status="scored")

    def test_rejects_missing_answer(self):
        kwargs = valid_normalized_kwargs()
        del kwargs["answer"]
        with pytest.raises(ValidationError, match="answer"):
            ValidatedQuestion(**kwargs)

    def test_rejects_duplicate_option_keys(self):
        kwargs = valid_normalized_kwargs()
        kwargs["options"] = [
            NormalizedOption(key="A", text="one"),
            NormalizedOption(key="A", text="two"),
        ]
        with pytest.raises(ValidationError, match="Duplicate option keys"):
            ValidatedQuestion(**kwargs)

    def test_rejects_mcq_answer_key_not_in_options(self):
        kwargs = valid_normalized_kwargs()
        kwargs["answer"] = McqAnswer(correct_key="Z")
        with pytest.raises(ValidationError, match="not among the question's options"):
            ValidatedQuestion(**kwargs)

    def test_rejects_multiple_correct_key_not_in_options(self):
        kwargs = valid_normalized_kwargs()
        kwargs["answer"] = MultipleCorrectAnswer(correct_keys=["A", "Z"])
        with pytest.raises(ValidationError, match="not among the question's options"):
            ValidatedQuestion(**kwargs)

    def test_round_trip_preserves_every_field(self):
        original = ValidatedQuestion(**valid_normalized_kwargs())
        restored = ValidatedQuestion.model_validate_json(original.model_dump_json())
        assert restored == original


class TestCanonicalQuestion:
    def test_accepts_valid_input(self):
        CanonicalQuestion(**valid_canonical_kwargs())

    def test_rejects_missing_stable_content_id(self):
        kwargs = valid_canonical_kwargs()
        del kwargs["stable_content_id"]
        with pytest.raises(ValidationError, match="stable_content_id"):
            CanonicalQuestion(**kwargs)

    def test_rejects_duplicate_option_keys(self):
        kwargs = valid_canonical_kwargs()
        kwargs["options"] = [
            CanonicalOption(key="A", text="one", sequence=0),
            CanonicalOption(key="A", text="two", sequence=1),
        ]
        with pytest.raises(ValidationError, match="Duplicate option keys"):
            CanonicalQuestion(**kwargs)

    def test_rejects_answer_key_not_in_options(self):
        kwargs = valid_canonical_kwargs()
        kwargs["answer"] = CanonicalAnswer(correct_option_key="Z")
        with pytest.raises(ValidationError, match="not among this question's options"):
            CanonicalQuestion(**kwargs)

    def test_answer_rejects_having_no_answer_form_at_all(self):
        with pytest.raises(ValidationError, match="needs at least one"):
            CanonicalAnswer(correct_option_key=None, text_answer=None, numerical_answer=None)

    def test_round_trip_preserves_every_field(self):
        original = CanonicalQuestion(**valid_canonical_kwargs())
        restored = CanonicalQuestion.model_validate_json(original.model_dump_json())
        assert restored == original

    def test_version_stamps_are_present(self):
        cq = CanonicalQuestion(**valid_canonical_kwargs())
        assert cq.contract_version
        assert cq.pipeline_version
        assert cq.parser_version
