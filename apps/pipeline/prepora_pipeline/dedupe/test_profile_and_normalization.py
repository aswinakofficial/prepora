"""The shared layer's pure parts: source profiles, and the normalization every implementation —
this one and the TypeScript ports — must agree on (fixtures/normalization.json)."""
import json
from pathlib import Path

import pytest

from prepora_pipeline.contracts import McqAnswer, NormalizedOption, NormalizedQuestion
from prepora_pipeline.dedupe import (
    DEFAULT_PROFILE,
    content_hash,
    effective_identity,
    normalize_question_text,
    profile_for_url,
)
from prepora_pipeline.dedupe.profile import build_profile

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "normalization.json").read_text())


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda c: c["name"])
def test_normalization_matches_the_shared_fixtures(case):
    assert normalize_question_text(case["input"]) == case["normalized"]
    assert content_hash(case["input"]) == case["hash"]


def _question(**extra):
    return NormalizedQuestion(
        exam_slug="az-104",
        exam_variant_slug="standard",
        subject_slug="azure",
        number=1,
        question_text="Which service?",
        options=[NormalizedOption(key="A", text="x"), NormalizedOption(key="B", text="y")],
        answer=McqAnswer(correct_key="A"),
        parser_version="test",
        **extra,
    )


class TestProfiles:
    def test_a_source_is_found_by_its_host(self):
        assert profile_for_url("https://learn.microsoft.com/en-us/credentials/x").name == "ms-learn"
        assert profile_for_url("https://www.indiabix.com/a/b").name == "indiabix"
        assert profile_for_url("https://indiabix.com/a/b").name == "indiabix"

    def test_anything_else_gets_the_default(self):
        assert profile_for_url("https://example.com/q") is DEFAULT_PROFILE
        assert profile_for_url(None) is DEFAULT_PROFILE
        assert profile_for_url("https://learn.microsoft.com.evil.com/x") is DEFAULT_PROFILE

    def test_identity_comes_from_the_source_unless_the_question_sets_it(self):
        ms_learn = "https://learn.microsoft.com/en-us/x"
        assert effective_identity(_question(source_url=ms_learn)) == "content"
        assert effective_identity(_question(source_url=ms_learn, identity="position")) == "position"
        assert effective_identity(_question()) == "position"

    def test_ms_learn_cleaners_strip_only_its_boilerplate(self):
        profile = profile_for_url("https://learn.microsoft.com/")
        assert profile.comparison_text(
            "Question 12 of 50: Which two services? Each correct answer presents a complete "
            "solution. NOTE: Each correct selection is worth one point."
        ) == "which two services"
        assert DEFAULT_PROFILE.comparison_text("Question 12 of 50: Which?") == (
            "question 12 of 50 which"
        )

    def test_unknown_or_invalid_settings_are_rejected(self):
        with pytest.raises(ValueError, match="unknown dedupe settings"):
            build_profile({"name": "x", "base_url": "https://x", "dedupe": {"treshold": 0.9}})
        with pytest.raises(ValueError, match="identity"):
            build_profile({"name": "x", "base_url": "https://x", "dedupe": {"identity": "url"}})
        with pytest.raises(ValueError, match="threshold"):
            build_profile(
                {"name": "x", "base_url": "https://x", "dedupe": {"near_duplicate_threshold": 2}}
            )
