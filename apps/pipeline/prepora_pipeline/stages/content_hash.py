"""
Exact-duplicate content hashing — shared by publish.py (item 18) and dedupe.py (item 20), which
both need it without importing each other.
"""


def normalize_question_text(question_text: str) -> str:
    """
    The comparison form of a question's text: lowercase, whitespace collapsed, punctuation
    stripped. Two questions are "the same content" exactly when these are equal — content_hash()
    below is only a fast, collision-prone index into that comparison.
    """
    normalized = " ".join(question_text.lower().split())
    normalized = "".join(ch for ch in normalized if ch.isalnum() or ch.isspace())
    return normalized.strip()


def content_hash(question_text: str) -> str:
    """
    Port of packages/content/src/duplicates.ts's contentHash(): lowercase, collapse whitespace,
    strip punctuation, then a djb2 hash rendered in base36 — deliberately the exact same algorithm
    so "identical content" means the same thing in both languages. Verified against the TS
    implementation for plain-ASCII input, which is what both are actually exercised against today.

    Known divergence: JS's `\\w` in `[^\\w\\s]` is ASCII-only, so it strips accented/non-Latin
    letters entirely; Python's str.isalnum() is Unicode-aware and keeps them. "café" normalizes to
    "caf" in TS but "café" in Python, producing different hashes for identical non-ASCII text. Not
    fixed here — no content in either pipeline is non-ASCII yet, and picking a single correct
    Unicode-normalization behavior for both is a real design decision, not a one-line fix.
    """
    normalized = normalize_question_text(question_text)

    h = 5381
    for ch in normalized:
        h = ((h << 5) + h) ^ ord(ch)
        h &= 0xFFFFFFFF
    return _to_base36(h)


def _to_base36(n: int) -> str:
    if n == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = []
    while n:
        n, rem = divmod(n, 36)
        out.append(digits[rem])
    return "".join(reversed(out))
