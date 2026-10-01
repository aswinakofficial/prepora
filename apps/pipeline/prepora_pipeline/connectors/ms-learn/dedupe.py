"""
MS Learn's part of duplicate detection (docs/architecture/dedupe.md): text Microsoft wraps around
practice-assessment questions that says nothing about the question itself. Stripped only for
similarity scoring — never from stored text — so two questions differing only in these don't look
less alike than they are, and two different questions sharing them don't look more alike.
"""
import re

# "Question 12 of 50: " — the crawler's parser strips it, but older batches may still carry it.
_COUNTER = re.compile(r"^\s*question\s+\d+\s+of\s+\d+\s*:?\s*", re.I)

# Fixed answering instructions appended to multi-answer questions.
_INSTRUCTIONS = re.compile(
    r"\s*(?:each correct (?:answer|selection) (?:presents|is worth)[^.]*\.|"
    r"note:\s*each correct selection is worth one point\.)",
    re.I,
)


def strip_question_counter(text: str) -> str:
    return _COUNTER.sub("", text)


def strip_answering_instructions(text: str) -> str:
    return _INSTRUCTIONS.sub("", text)


COMPARISON_CLEANERS = (strip_question_counter, strip_answering_instructions)
