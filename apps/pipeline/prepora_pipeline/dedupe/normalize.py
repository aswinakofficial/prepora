"""
Text normalization and content hashing: what "the same text" means everywhere in Prepora.

The one definition, shared by publishing (stages/publish.py), duplicate detection (dedupe/check.py)
and — as step-for-step ports verified against fixtures/normalization.json — the TypeScript review
preview (packages/api/src/lib/review-dedupe.ts) and the Markdown contribution checker
(packages/content/src/duplicates.ts). Changing it changes every stored content_hash's meaning, so
it's versioned: bump NORMALIZATION_VERSION and update the fixtures together.

Source-specific text cleanup (an MS Learn "Question 3 of 50:" prefix, say) never goes here: it
belongs to that source's DedupeProfile (dedupe/profile.py), and only ever affects similarity
scoring, never a stored hash.
"""

import unicodedata

# 2: combining marks are kept, and text is NFC-normalized first. Version 1 dropped marks (not
# alphanumeric on their own), which erased Malayalam and Devanagari vowel signs — "കേരളം" and
# "കരളം" normalized alike. No question published under version 1 contained any, so no stored
# hash changed.
NORMALIZATION_VERSION = 2


def normalize_question_text(question_text: str) -> str:
    """
    The comparison form of a question's text: NFC (so a precomposed and a decomposed "é" are the
    same), lowercase, whitespace collapsed, and everything but letters, combining marks, digits and
    spaces stripped. Two questions are "the same content" exactly when these are equal —
    content_hash() below is only a fast, collision-prone index into that comparison.

    Whitespace is collapsed *before* punctuation is stripped, so "it — which" keeps two spaces
    where the dash was. A quirk, but every stored hash depends on it.
    """
    normalized = " ".join(unicodedata.normalize("NFC", question_text).lower().split())
    normalized = "".join(ch for ch in normalized if _kept(ch))
    return normalized.strip()


def _kept(ch: str) -> bool:
    return ch.isalnum() or ch.isspace() or unicodedata.category(ch).startswith("M")


def content_hash(question_text: str) -> str:
    """
    Port of packages/content/src/duplicates.ts's contentHash(): lowercase, collapse whitespace,
    strip punctuation, then a djb2 hash rendered in base36 — deliberately the exact same algorithm
    so "identical content" means the same thing in both languages. Verified against the TS
    implementation for plain-ASCII input, which is what both are actually exercised against today.

    Unicode letters, marks and digits are kept ("café", Malayalam script), matching the TypeScript
    ports' [\\p{L}\\p{M}\\p{N}] — the TS contentHash() used to strip them with an ASCII-only
    \\w. Hashing runs over code points, so text outside the Basic Multilingual Plane (emoji)
    hashes differently in JS, which iterates UTF-16 units; fixtures/normalization.json keeps to
    the BMP.
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
