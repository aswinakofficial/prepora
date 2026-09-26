"""
IndiaBix normalizer: ExtractedQuestion -> NormalizedQuestion — docs/roadmap/engineering-roadmap.md
item 11's shared contract, bridging the shape mismatch documented in
docs/architecture/prepora-next-level-plan.md §6.

Option keys are assigned in DOM order (A, B, C, ...), matching the visual order a student would
read them in. IndiaBix's extracted answer is already a bare letter (e.g. "B") straight from the
page's own hidden answer field, so resolving it to an mcq answer is a direct lookup rather than
fuzzy text matching against option contents — a real advantage of the ExtractedQuestion/
NormalizedQuestion split: a connector with cleaner source data doesn't have to work harder here
just because a different source's normalizer might need to.
"""
from prepora_pipeline.contracts import (
    ExtractedQuestion,
    McqAnswer,
    NormalizedOption,
    NormalizedQuestion,
    TextAnswer,
)


def normalize(
    extracted: ExtractedQuestion,
    *,
    exam_slug: str,
    exam_variant_slug: str,
    subject_slug: str,
) -> NormalizedQuestion:
    options = [
        NormalizedOption(key=chr(65 + i), text=text) for i, text in enumerate(extracted.options)
    ]
    option_keys = {opt.key for opt in options}

    answer = None
    needs_review = False
    review_note = None

    candidate_key = extracted.answer.strip().upper() if extracted.answer else None
    if candidate_key and candidate_key in option_keys:
        answer = McqAnswer(correct_key=candidate_key)
    elif extracted.answer:
        answer = TextAnswer(answer=extracted.answer)
        needs_review = True
        review_note = (
            f"Answer {extracted.answer!r} did not match a single option key "
            f"({sorted(option_keys)}); needs manual review."
        )
    else:
        needs_review = True
        review_note = "No answer was found on the source page."

    return NormalizedQuestion(
        raw_artifact_sha256=extracted.raw_artifact_sha256,
        source_type="official",
        exam_slug=exam_slug,
        exam_variant_slug=exam_variant_slug,
        subject_slug=subject_slug,
        question_text=extracted.question_text,
        question_type="mcq",
        options=options,
        answer=answer,
        explanation=extracted.explanation,
        needs_review=needs_review,
        review_note=review_note,
        parser_version=extracted.parser_version,
    )
