"""
Deduplication — docs/roadmap/engineering-roadmap.md item 20.

Ports packages/content/src/duplicates.ts's two-stage approach — a normalized content hash for
exact matches, then Levenshtein similarity at 0.9 for near matches — and extends it the two ways
the TS version structurally cannot (docs/architecture/prepora-next-level-plan.md finding #13):

1. It compares across the whole corpus via the `questions.content_hash` index and a subject-scoped
   query, not an in-memory `Question[]` scoped to whatever one file or one scrape batch happened to
   be parsed together. `check-duplicates.ts` only ever sees one file at a time, so a question
   repeated in the 2023 and 2024 papers — two different files — was never even compared.
2. It carries exam/variant/year context through NormalizedQuestion, so it can make the distinction
   the TS version structurally cannot: the same question appearing in a different exam or year is a
   legitimate occurrence (item 18), not a duplicate to drop.

Three outcomes, matching the roadmap's own framing:
- "exact_duplicate_in_set": identical content already exists in the *same* question set (paper) —
  a real duplicate. publish_question() lets this proceed (the existing (question, question_set)
  unique constraint absorbs it as a no-op occurrence), but now with an explicit, reportable reason
  attached instead of silently doing nothing.
- "exact_duplicate_cross_set": identical content already published under a *different* question
  set — the same question in a different exam or year. publish_question() reuses the canonical
  question and adds a new occurrence, exactly as item 18 already does; this stage is what decides
  that reuse is correct, rather than publish.py silently assuming any content_hash match is fine.
- "near_duplicate": similarity >= 0.9 but < 1 against an existing question. Per the content rules'
  "never merge silently" principle, this is never auto-merged and never auto-published —
  publish_question() refuses and surfaces it for human review.
- "unique": no match of any kind.

Performance: comparing a candidate against every question in a 50,000-row corpus with Levenshtein
per pair is not viable — see this item's own performance test. Near-duplicate comparison is
therefore scoped to the candidate's own subject first (a near-duplicate of a thermodynamics
question is never going to be a question about SQL joins) via question_occurrences -> question_sets
(which always carries a subject_id — see publish.py), so Levenshtein only ever runs against that
subject's questions, not the whole table.
"""
from dataclasses import dataclass
from typing import Literal

from ..contracts import NormalizedQuestion
from ..core.db import get_db_connection
from .content_hash import content_hash
from .stable_id import derive_question_set_slug

DedupeOutcome = Literal[
    "exact_duplicate_in_set", "exact_duplicate_cross_set", "near_duplicate", "unique"
]

NEAR_DUPLICATE_THRESHOLD = 0.9

# A near-duplicate pair can't differ much in length once punctuation/whitespace is normalized, so
# this is a deliberately loose prefilter to shrink the candidate set before running Levenshtein at
# all — not a substitute for the similarity check itself.
_LENGTH_BAND_TOLERANCE = 0.2


@dataclass
class DedupeDecision:
    outcome: DedupeOutcome
    reason: str
    existing_question_id: str | None = None
    existing_question_set_id: str | None = None
    similarity_score: float | None = None


def _normalize_text(text: str) -> str:
    normalized = " ".join(text.lower().split())
    return "".join(ch for ch in normalized if ch.isalnum() or ch.isspace()).strip()


def levenshtein(a: str, b: str) -> int:
    """Wagner-Fischer edit distance, O(min(m, n)) space — a > b doesn't matter, only the smaller
    dimension needs to be the row we keep, so swap to guarantee the tighter of the two."""
    if len(a) < len(b):
        a, b = b, a
    if not b:
        return len(a)

    previous_row = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current_row = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            current_row.append(
                min(
                    current_row[j - 1] + 1,  # insertion
                    previous_row[j] + 1,  # deletion
                    previous_row[j - 1] + cost,  # substitution
                )
            )
        previous_row = current_row
    return previous_row[-1]


def similarity(a: str, b: str) -> float:
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return 1 - levenshtein(a, b) / max_len


def _existing_question_set_id(cur, slug: str) -> str | None:
    cur.execute("SELECT id FROM question_sets WHERE slug = %s", (slug,))
    row = cur.fetchone()
    return row[0] if row else None


def _find_exact_duplicate(cur, hash_: str) -> list[tuple[str, str | None]]:
    """Every (question_id, question_set_id) pair sharing this content hash, via the
    questions_content_hash_idx — a question with no occurrence yet still returns one row with a
    None set id."""
    cur.execute(
        "SELECT q.id, qo.question_set_id FROM questions q "
        "LEFT JOIN question_occurrences qo ON qo.question_id = q.id "
        "WHERE q.content_hash = %s",
        (hash_,),
    )
    return cur.fetchall()


def _find_near_duplicate(cur, normalized: NormalizedQuestion) -> tuple[str, float] | None:
    normalized_text = _normalize_text(normalized.question_text)
    length = len(normalized_text)
    if length == 0:
        return None
    low = int(length * (1 - _LENGTH_BAND_TOLERANCE))
    high = int(length * (1 + _LENGTH_BAND_TOLERANCE)) + 1

    cur.execute(
        "SELECT DISTINCT q.id, q.question_text FROM questions q "
        "JOIN question_occurrences qo ON qo.question_id = q.id "
        "JOIN question_sets qs ON qs.id = qo.question_set_id "
        "WHERE qs.subject_id = (SELECT id FROM subjects WHERE slug = %s) "
        "AND length(q.question_text) BETWEEN %s AND %s",
        (normalized.subject_slug, low, high),
    )
    candidates = cur.fetchall()

    best: tuple[str, float] | None = None
    for candidate_id, candidate_text in candidates:
        score = similarity(normalized_text, _normalize_text(candidate_text))
        if NEAR_DUPLICATE_THRESHOLD <= score < 1 and (best is None or score > best[1]):
            best = (candidate_id, score)
    return best


def check_duplicate(normalized: NormalizedQuestion) -> DedupeDecision:
    """
    The single source of truth for "has this content been seen before, and what does that mean" —
    replaces packages/api/src/routers/admin.router.ts's separate, weaker ilike-based check, which
    only ever compared a scraped item's first 30 characters against `questions.questionText` with
    no exam/year awareness at all.

    Everything runs on one connection/cursor rather than one per lookup — a remote Postgres
    connection's own round-trip latency is real and adds up, and this stage sits in front of
    every publish, so it's worth not paying for it twice or three times over per check.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            question_set_id = _existing_question_set_id(cur, derive_question_set_slug(normalized))
            hash_ = content_hash(normalized.question_text)
            matches = _find_exact_duplicate(cur, hash_)
            near = None if matches else _find_near_duplicate(cur, normalized)
    finally:
        conn.close()

    if matches:
        existing_question_id = matches[0][0]
        existing_set_ids = {set_id for _, set_id in matches if set_id is not None}
        if question_set_id is not None and question_set_id in existing_set_ids:
            return DedupeDecision(
                outcome="exact_duplicate_in_set",
                reason=(
                    f"Identical question already exists in this question set (question "
                    f"{existing_question_id}); no new question will be created."
                ),
                existing_question_id=existing_question_id,
                existing_question_set_id=question_set_id,
            )
        return DedupeDecision(
            outcome="exact_duplicate_cross_set",
            reason=(
                f"Identical content already published as question {existing_question_id} in a "
                "different question set; reusing the canonical question with a new occurrence."
            ),
            existing_question_id=existing_question_id,
        )

    if near is not None:
        existing_id, score = near
        return DedupeDecision(
            outcome="near_duplicate",
            reason=(
                f"{score:.0%} similar to existing question {existing_id}; flagged for human "
                "review, never auto-merged."
            ),
            existing_question_id=existing_id,
            similarity_score=score,
        )

    return DedupeDecision(outcome="unique", reason="No duplicate or near-duplicate found.")
