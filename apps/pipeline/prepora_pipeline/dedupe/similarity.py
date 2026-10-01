"""
Wording similarity: 1 - Levenshtein distance / length of the longer text, over normalized text. The
score every near-duplicate decision is made on — candidates.py's trigram search only narrows down
which questions are worth scoring.
"""
try:
    # Same unit-cost edit distance as _levenshtein_py below, in C. The pure-Python version took
    # ~11ms per comparison on a typical question, run against every same-subject question of
    # similar length on every publish — CPU-bound, so it also serialized concurrent publishes
    # behind Python's GIL. It was the largest single cost of publishing a review batch.
    from rapidfuzz.distance import Levenshtein as _RapidfuzzLevenshtein
except ImportError:  # pragma: no cover — only when rapidfuzz isn't installed
    _RapidfuzzLevenshtein = None


def levenshtein(a: str, b: str) -> int:
    if _RapidfuzzLevenshtein is not None:
        return _RapidfuzzLevenshtein.distance(a, b)
    return _levenshtein_py(a, b)


def _levenshtein_py(a: str, b: str) -> int:
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


# A pair scoring at least `threshold` can differ in length by at most (1 - threshold) of the longer
# text, so anything outside that band can be skipped without scoring it.
def could_reach(a_len: int, b_len: int, threshold: float) -> bool:
    longer = max(a_len, b_len)
    return longer == 0 or min(a_len, b_len) >= longer * threshold
