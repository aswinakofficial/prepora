"""
GATE answer keys (#27) — the official key table, one row per question:

    Q. No. | Session | Question Type | Section | Key/Range | Marks
    19     | 3       | MSQ           | CS-1    | A;C;D     | 1
    61     | 3       | NAT           | CS-1    | 4.24 to 4.26 | 2

2026's header says "Question Type" and 2025's "Q. Type"; both years' tables are otherwise the same
(checked on all four pilot keys, 2026-10-02), so one header profile with both spellings reads them.
Every value is checked: a key letter outside A–D, a range whose lower bound is above its upper, or
an unknown question type raises rather than publishing a wrong answer.
"""
import re
from dataclasses import dataclass
from typing import Literal

from ...core.answer_keys import HeaderProfile, parse_key_table
from ...core.pdf_text import Page

GATE_KEY_PROFILE = HeaderProfile(
    name="gate-2025-2026",
    columns={
        "number": ("Q. No.",),
        "session": ("Session",),
        "qtype": ("Question Type", "Q. Type"),
        "section": ("Section",),
        "key": ("Key/Range",),
        "marks": ("Marks",),
    },
)

QType = Literal["MCQ", "MSQ", "NAT"]
Answer = (
    tuple[Literal["keys"], list[str]]
    | tuple[Literal["ranges"], list[tuple[float, float]]]
    | tuple[Literal["mta"], None]
)


@dataclass(frozen=True)
class GateKeyRow:
    number: int
    session: str  # the exam session (slot) number, e.g. "3"
    section: str  # "GA", or the sitting's own section, e.g. "CS-1"
    marks: int  # 1 or 2
    qtype: QType
    answer: Answer
    raw_key: str  # the cell as printed, e.g. "4.24 to 4.26" — the display text for a NAT answer


class GateKeyError(ValueError):
    pass


_NUMBER = r"-?\d+(?:\.\d+)?"
_RANGE = re.compile(rf"^({_NUMBER})\s*to\s*({_NUMBER})$")


# NFKC leaves typographic minus signs and dashes alone; a key may print any of them.
_MINUS = str.maketrans({"\u2212": "-", "\u2013": "-", "\u2012": "-", "\ufe63": "-"})


def parse_answer_value(qtype: str, raw: str) -> Answer:
    text = " ".join(raw.translate(_MINUS).split())
    if text.upper() == "MTA":
        return ("mta", None)
    if qtype in ("MCQ", "MSQ"):
        letters = [part.strip().upper() for part in re.split(r"[;,]", text)]
        if not letters or any(letter not in ("A", "B", "C", "D") for letter in letters):
            raise GateKeyError(f"{qtype} key {raw!r} isn't a list of options A–D.")
        if len(set(letters)) != len(letters):
            raise GateKeyError(f"{qtype} key {raw!r} repeats an option.")
        if qtype == "MCQ" and len(letters) != 1:
            raise GateKeyError(f"MCQ key {raw!r} has more than one option.")
        return ("keys", letters)
    if qtype == "NAT":
        ranges = []
        for part in re.split(r"\s+OR\s+", text, flags=re.IGNORECASE):
            match = _RANGE.match(part.strip())
            if not match:
                raise GateKeyError(f"NAT key {raw!r} isn't 'X to Y' (optionally 'OR'-joined).")
            lo, hi = float(match.group(1)), float(match.group(2))
            if lo > hi:
                raise GateKeyError(f"NAT key {raw!r} has a range whose lower bound is above it.")
            ranges.append((lo, hi))
        return ("ranges", ranges)
    raise GateKeyError(f"Unknown question type {qtype!r}.")


def parse_answer_key(pages: list[Page]) -> list[GateKeyRow]:
    rows = []
    for row in parse_key_table(pages, GATE_KEY_PROFILE):
        values = row.values
        qtype = values.get("qtype", "").upper()
        raw_key = values.get("key", "")
        marks_text = values.get("marks", "")
        if not re.fullmatch(r"[12]", marks_text):
            raise GateKeyError(f"Q.{row.number}: marks {marks_text!r} isn't 1 or 2.")
        try:
            answer = parse_answer_value(qtype, raw_key)
        except GateKeyError as exc:
            raise GateKeyError(f"Q.{row.number}: {exc}") from exc
        rows.append(
            GateKeyRow(
                number=row.number,
                session=values.get("session", ""),
                section=values.get("section", ""),
                marks=int(marks_text),
                qtype=qtype,  # type: ignore[arg-type]  # checked by parse_answer_value
                answer=answer,
                raw_key=" ".join(raw_key.split()),
            )
        )
    return rows
