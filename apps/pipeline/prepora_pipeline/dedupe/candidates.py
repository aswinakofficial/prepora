"""
Finding the published questions a new one might duplicate — across the whole corpus, every exam
and subject, not just its own.

Exact candidates come from the content_hash index (and question_variants, the wordings a person
already confirmed are the same question), confirmed on the normalized text since the hash is only
32 bits. Similar candidates come from pg_trgm: a GIN trigram index on question_text narrows 50,000
questions to the few dozen with overlapping wording, and only those are scored with Levenshtein
(similarity.py) — the measure every decision is actually made on. The trigram cutoff is
deliberately far below any decision threshold: a 90%-similar pair can share well under half its
trigrams once the edits are spread out, and a miss here is a duplicate nobody reviews.
"""
from dataclasses import dataclass

from .normalize import content_hash, normalize_question_text
from .similarity import could_reach

# pg_trgm similarity (shared trigrams / all trigrams) a question must reach to be scored at all.
TRIGRAM_CUTOFF = 0.3
# The most similar questions scored per check. Real near-duplicates rank near the top; the rest of
# a long tail of loosely similar questions can't reach any decision threshold.
MAX_SIMILAR_CANDIDATES = 50


@dataclass(frozen=True)
class Candidate:
    question_id: str
    question_text: str
    # The question set an exact match already appears in (None for a question without one).
    question_set_id: str | None = None


def find_exact(cur, question_text: str) -> list[Candidate]:
    """Every published question — or confirmed variant wording — with exactly this text, one row
    per (question, set) it appears in."""
    hash_ = content_hash(question_text)
    cur.execute(
        "SELECT q.id, qo.question_set_id, q.question_text FROM questions q "
        "LEFT JOIN question_occurrences qo ON qo.question_id = q.id "
        "WHERE q.content_hash = %s "
        "UNION ALL "
        "SELECT v.question_id, qo.question_set_id, v.question_text FROM question_variants v "
        "LEFT JOIN question_occurrences qo ON qo.question_id = v.question_id "
        "WHERE v.content_hash = %s",
        (hash_, hash_),
    )
    wanted = normalize_question_text(question_text)
    return [
        Candidate(question_id, text, set_id)
        for question_id, set_id, text in cur.fetchall()
        if normalize_question_text(text) == wanted
    ]


def find_similar(cur, question_text: str, *, min_similarity: float) -> list[Candidate]:
    """Questions (or their confirmed variant wordings) whose wording is trigram-similar to this
    one and whose length allows reaching `min_similarity`, most similar first."""
    length = len(question_text)
    # Raw lengths only approximate normalized ones, so the band is widened a little.
    low = int(length * min_similarity * 0.85)
    high = int(length / (min_similarity * 0.85)) + 1
    cur.execute("SET LOCAL pg_trgm.similarity_threshold = %s", (TRIGRAM_CUTOFF,))
    cur.execute(
        "SELECT question_id, question_text FROM ("
        "  SELECT q.id AS question_id, q.question_text, similarity(q.question_text, %(t)s) AS s"
        "  FROM questions q WHERE q.question_text %% %(t)s"
        "  AND length(q.question_text) BETWEEN %(low)s AND %(high)s"
        "  UNION ALL"
        "  SELECT v.question_id, v.question_text, similarity(v.question_text, %(t)s)"
        "  FROM question_variants v WHERE v.question_text %% %(t)s"
        "  AND length(v.question_text) BETWEEN %(low)s AND %(high)s"
        ") c ORDER BY s DESC LIMIT %(limit)s",
        {"t": question_text, "low": low, "high": high, "limit": MAX_SIMILAR_CANDIDATES},
    )
    return [Candidate(question_id, text) for question_id, text in cur.fetchall()]


def within_reach(a: str, b: str, threshold: float) -> bool:
    return could_reach(len(a), len(b), threshold)
