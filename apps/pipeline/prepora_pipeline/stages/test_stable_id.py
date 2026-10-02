"""Tests for stable_id.py's sitting (shift) rule — docs/specs/03-paper-structure-min.md."""
from prepora_pipeline.contracts import McqAnswer, NormalizedOption, NormalizedQuestion

from .stable_id import derive_stable_content_id


def _question(**overrides) -> NormalizedQuestion:
    fields = {
        "exam_slug": "invented-exam",
        "exam_variant_slug": "cs",
        "subject_slug": "computer-science",
        "year": 2099,
        "number": 7,
        "question_text": "Which invented sorting order is stable?",
        "options": [NormalizedOption(key="A", text="One"), NormalizedOption(key="B", text="Two")],
        "answer": McqAnswer(correct_key="A"),
        "parser_version": "test-v1",
    }
    fields.update(overrides)
    return NormalizedQuestion(**fields)


def test_without_a_shift_the_id_is_unchanged():
    assert derive_stable_content_id(_question()) == "INVENTED-EXAM-CS-2099-COMPUTER-SCIENCE-Q007"


def test_a_shift_goes_before_the_question_number():
    assert (
        derive_stable_content_id(_question(shift="cs 1"))
        == "INVENTED-EXAM-CS-2099-COMPUTER-SCIENCE-CS-1-Q007"
    )


def test_two_sittings_of_one_year_get_different_ids():
    assert derive_stable_content_id(_question(shift="CS1")) != derive_stable_content_id(
        _question(shift="CS2")
    )
