"""
The duplicate decision for one question about to be published — the single implementation every
source and every caller shares (publishing, the /dedupe/check endpoint, the audit).

Outcomes:
- exact_duplicate_in_set: the same question (wording, options and answer) is already in this very
  question set. Publishing it is a no-op.
- exact_duplicate_cross_set: the same question is published under another set — another exam, year
  or paper. It's reused, and gains an occurrence in this set.
- conflicting_duplicate: identical wording, but different options or a different correct answer.
  Could be a corrected answer key or a different question reusing a stem; a person decides.
- near_duplicate: wording at least the source profile's threshold similar (0.9 by default) to a
  published question — anywhere in the corpus, not only the same subject. A person decides.
- previously_skipped: a person already decided not to publish exactly this question (wording,
  options and answer), when it was held against this same published question.
- unique: nothing like it is published.

Nothing here writes, and nothing is ever merged silently: the two "a person decides" outcomes are
held by publishing (stages/publish.py) until someone does, and whatever they decide is remembered
— "same" as a question_variants wording (matched exactly from then on), "skip" via
duplicate_reviews (previously_skipped, above) — so the same question is never asked about twice.
"""
from dataclasses import dataclass
from typing import Literal

from ..contracts import NormalizedQuestion
from ..core.db import get_db_connection
from ..stages.stable_id import derive_question_set_slug
from .candidates import Candidate, find_exact, find_similar, within_reach
from .fingerprint import AnswerShape, numbers_in, shape_of, shape_of_published
from .normalize import normalize_question_text
from .profile import DedupeProfile, profile_for
from .similarity import similarity

DedupeOutcome = Literal[
    "exact_duplicate_in_set",
    "exact_duplicate_cross_set",
    "conflicting_duplicate",
    "near_duplicate",
    "previously_skipped",
    "unique",
]

# Outcomes that are held for a person's decision instead of being published.
NEEDS_DECISION: frozenset[str] = frozenset({"near_duplicate", "conflicting_duplicate"})


@dataclass
class DedupeDecision:
    outcome: DedupeOutcome
    reason: str
    existing_question_id: str | None = None
    existing_question_set_id: str | None = None
    similarity_score: float | None = None
    # Held outcomes only — what a reviewer needs to decide "same question, reworded" vs "a
    # different question that happens to be worded alike" (compare "What are the two types of
    # GitHub Actions?" with "…three types…": 90% similar, different answer).
    existing_question_text: str | None = None
    options_match: bool | None = None
    answer_match: bool | None = None
    suggestion: Literal["same", "different"] | None = None


def check_duplicate(normalized: NormalizedQuestion) -> DedupeDecision:
    """Decides on one connection; see decide()."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            return decide(cur, normalized)
    finally:
        conn.close()


def decide(cur, normalized: NormalizedQuestion, profile: DedupeProfile | None = None):
    profile = profile or profile_for(normalized)
    shape = shape_of(normalized)

    exact = find_exact(cur, normalized.question_text)
    if exact:
        return _decide_exact(cur, normalized, shape, exact)

    near = _best_near_match(cur, normalized, profile)
    if near is None:
        return DedupeDecision(outcome="unique", reason="No duplicate or near-duplicate found.")
    candidate, score = near
    if normalize_question_text(candidate.question_text) == normalize_question_text(
        normalized.question_text
    ):
        # Published between the exact lookup above and this one (a concurrent publish of the same
        # question): it's an exact match after all.
        exact = find_exact(cur, normalized.question_text)
        if exact:
            return _decide_exact(cur, normalized, shape, exact)
    if _remembered_decision(cur, candidate.question_id, normalized, shape) == "skipped":
        return _previously_skipped(candidate.question_id)
    existing_shape = shape_of_published(cur, candidate.question_id)
    numbers_match = numbers_in(normalized.question_text) == numbers_in(candidate.question_text)
    return DedupeDecision(
        outcome="near_duplicate",
        reason=(
            f"{score:.0%} similar to existing question {candidate.question_id}; flagged for "
            "human review, never auto-merged."
        ),
        existing_question_id=candidate.question_id,
        similarity_score=score,
        existing_question_text=candidate.question_text,
        options_match=shape.options_match(existing_shape),
        answer_match=shape.answer_match(existing_shape),
        suggestion=(
            "same" if shape.matches(existing_shape) and numbers_match else "different"
        ),
    )


def find_same_question(cur, normalized: NormalizedQuestion) -> str | None:
    """The published question that *is* this one — identical wording (or a confirmed variant of
    it), options and answer — if there is one. Publishing re-runs this under its lock, just before
    it would create the question."""
    shape = shape_of(normalized)
    exact = find_exact(cur, normalized.question_text)
    for question_id in dict.fromkeys(c.question_id for c in exact):
        if shape_of_published(cur, question_id).matches(shape):
            return question_id
    return None


def _decide_exact(cur, normalized, shape: AnswerShape, exact: list[Candidate]):
    set_ids_by_question: dict[str, set[str]] = {}
    for c in exact:
        set_ids_by_question.setdefault(c.question_id, set())
        if c.question_set_id:
            set_ids_by_question[c.question_id].add(c.question_set_id)

    this_set_id = _existing_question_set_id(cur, derive_question_set_slug(normalized))
    shapes = {qid: shape_of_published(cur, qid) for qid in set_ids_by_question}
    same = [qid for qid, s in shapes.items() if s.matches(shape)]
    if same:
        # Prefer the copy already in this set, so a repeat is recognised as one.
        in_set = [qid for qid in same if this_set_id in set_ids_by_question[qid]]
        return _exact(in_set[0] if in_set else same[0], this_set_id if in_set else None)

    existing_id = next(iter(set_ids_by_question))
    remembered = _remembered_decision(cur, existing_id, normalized, shape)
    if remembered == "same":
        return _exact(existing_id, None, reason="A reviewer already decided it's this question.")
    if remembered == "skipped":
        return _previously_skipped(existing_id)
    existing_shape = shapes[existing_id]
    answer_match = shape.answer_match(existing_shape)
    what = "options" if answer_match else "correct answer"
    return DedupeDecision(
        outcome="conflicting_duplicate",
        reason=(
            f"Same wording as existing question {existing_id}, but a different {what}; flagged "
            "for human review."
        ),
        existing_question_id=existing_id,
        similarity_score=1.0,
        existing_question_text=next(c.question_text for c in exact if c.question_id == existing_id),
        options_match=shape.options_match(existing_shape),
        answer_match=answer_match,
        # A changed option list with the same answer is most often a fix to the same question; a
        # changed answer on identical wording could be either, so it leans "different".
        suggestion="same" if answer_match else "different",
    )


def _exact(question_id: str, in_set_id: str | None, *, reason: str | None = None):
    if in_set_id:
        return DedupeDecision(
            outcome="exact_duplicate_in_set",
            reason=reason
            or (
                f"Identical question already exists in this question set (question "
                f"{question_id}); no new question will be created."
            ),
            existing_question_id=question_id,
            existing_question_set_id=in_set_id,
        )
    return DedupeDecision(
        outcome="exact_duplicate_cross_set",
        reason=reason
        or (
            f"Identical question already published as question {question_id} in a different "
            "question set; reusing the canonical question with a new occurrence."
        ),
        existing_question_id=question_id,
    )


def _previously_skipped(question_id: str) -> DedupeDecision:
    return DedupeDecision(
        outcome="previously_skipped",
        reason=(
            f"A reviewer already chose not to publish this question (held against question "
            f"{question_id})."
        ),
        existing_question_id=question_id,
    )


def _best_near_match(cur, normalized, profile: DedupeProfile) -> tuple[Candidate, float] | None:
    threshold = profile.near_duplicate_threshold
    wanted = profile.comparison_text(normalized.question_text)
    if not wanted:
        return None
    best: tuple[Candidate, float] | None = None
    for candidate in find_similar(cur, normalized.question_text, min_similarity=threshold):
        other = profile.comparison_text(candidate.question_text)
        if not within_reach(wanted, other, threshold):
            continue
        score = similarity(wanted, other)
        if score >= threshold and (best is None or score > best[1]):
            best = (candidate, score)
    return best


def _remembered_decision(cur, existing_id: str, normalized, shape: AnswerShape) -> str | None:
    """"same" or "skipped" if a person already decided on exactly this question (wording, options
    and answer) when it was held against `existing_id`."""
    cur.execute(
        "SELECT status, candidate FROM duplicate_reviews WHERE existing_question_id = %s "
        "AND status IN ('same', 'skipped') ORDER BY decided_at DESC NULLS LAST",
        (existing_id,),
    )
    wanted = normalize_question_text(normalized.question_text)
    for status, candidate in cur.fetchall():
        try:
            held = NormalizedQuestion.model_validate(candidate)
        except Exception:  # a candidate stored by an older contract version: can't compare
            continue
        if normalize_question_text(held.question_text) == wanted and shape_of(held).matches(shape):
            return status
    return None


def _existing_question_set_id(cur, slug: str) -> str | None:
    cur.execute("SELECT id FROM question_sets WHERE slug = %s", (slug,))
    row = cur.fetchone()
    return row[0] if row else None


def compare_with_existing(
    cur, normalized: NormalizedQuestion, existing_question_id: str, existing_text: str
) -> tuple[bool, bool, Literal["same", "different"]]:
    """(options_match, answer_match, suggestion) for a possible duplicate. "same" only when the
    options and the correct answer are identical and no number in the wording changed; anything
    else leans "different". Either way a person confirms — this only pre-selects the likely
    choice."""
    shape = shape_of(normalized)
    existing = shape_of_published(cur, existing_question_id)
    numbers_match = numbers_in(normalized.question_text) == numbers_in(existing_text)
    suggestion: Literal["same", "different"] = (
        "same" if shape.matches(existing) and numbers_match else "different"
    )
    return shape.options_match(existing), shape.answer_match(existing), suggestion


def plan_batch(questions: list[NormalizedQuestion]) -> list[list[int]]:
    """
    Publishing order for one batch, as waves of indexes: every question in a wave can be published
    concurrently, and each wave only after the previous one. A question that repeats or nearly
    repeats an earlier one in the same batch goes in a later wave than it, so by the time it's
    checked the earlier one is published and the normal checks see it — published concurrently,
    neither would see the other, and both would be published.
    """
    texts = [profile_for(q).comparison_text(q.question_text) for q in questions]
    thresholds = [profile_for(q).near_duplicate_threshold for q in questions]
    wave = [0] * len(questions)
    for j in range(len(questions)):
        for i in range(j):
            threshold = min(thresholds[i], thresholds[j])
            if texts[i] == texts[j] or (
                within_reach(texts[i], texts[j], threshold)
                and similarity(texts[i], texts[j]) >= threshold
            ):
                wave[j] = max(wave[j], wave[i] + 1)
    waves: list[list[int]] = [[] for _ in range(max(wave, default=-1) + 1)]
    for index, w in enumerate(wave):
        waves[w].append(index)
    return waves
