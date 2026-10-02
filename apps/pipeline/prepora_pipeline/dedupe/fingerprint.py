"""
What a question *is*, beyond its wording: its options and its correct answer, normalized.

Two questions with identical wording are only the same question when these match too. MS Learn and
exam papers both reuse stems ("Which portal should you use?" after the same scenario) with
different options or a different answer; matching on the wording alone would silently fold the
second question into the first and it would never be published.
"""
from dataclasses import dataclass

from ..contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedQuestion,
    NumericalAnswer,
    TextAnswer,
)
from .normalize import normalize_question_text

NUMBER_WORDS = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "first", "second", "third", "fourth", "fifth", "single", "double",
    "triple", "once", "twice",
}


@dataclass(frozen=True)
class AnswerShape:
    """A question's options and correct answer(s), each normalized; option order is ignored."""

    options: frozenset[str]
    correct: frozenset[str]

    def options_match(self, other: "AnswerShape") -> bool:
        return self.options == other.options

    def answer_match(self, other: "AnswerShape") -> bool:
        return self.correct == other.correct

    def matches(self, other: "AnswerShape") -> bool:
        return self.options_match(other) and self.answer_match(other)


def range_text(lo, hi) -> str:
    """A numeric range as one comparable string, the same whether the bounds are the contract's
    floats or the database's Decimals ("4.24..4.26")."""
    return f"{float(lo)}..{float(hi)}"


def shape_of(question: NormalizedQuestion) -> AnswerShape:
    by_key = {opt.key: normalize_question_text(opt.text) for opt in question.options}
    answer = question.answer
    if isinstance(answer, McqAnswer):
        correct = {by_key[answer.correct_key]} if answer.correct_key in by_key else set()
    elif isinstance(answer, MultipleCorrectAnswer):
        correct = {by_key[k] for k in answer.correct_keys if k in by_key}
    elif isinstance(answer, NumericalAnswer) and answer.ranges:
        correct = {range_text(lo, hi) for lo, hi in answer.ranges}
    elif isinstance(answer, (TextAnswer, NumericalAnswer)):
        correct = {normalize_question_text(str(answer.answer))}
    else:
        correct = set()
    return AnswerShape(frozenset(by_key.values()), frozenset(correct))


def shape_of_published(cur, question_id: str) -> AnswerShape:
    cur.execute(
        "SELECT o.option_text, EXISTS (SELECT 1 FROM question_answers a "
        "WHERE a.correct_option_id = o.id) FROM question_options o WHERE o.question_id = %s",
        (question_id,),
    )
    options: set[str] = set()
    correct: set[str] = set()
    for text, is_correct in cur.fetchall():
        options.add(normalize_question_text(text))
        if is_correct:
            correct.add(normalize_question_text(text))
    cur.execute(
        "SELECT text_answer, numerical_answer, numeric_min, numeric_max FROM question_answers "
        "WHERE question_id = %s AND correct_option_id IS NULL",
        (question_id,),
    )
    for text_answer, numerical_answer, numeric_min, numeric_max in cur.fetchall():
        if numeric_min is not None and numeric_max is not None:
            correct.add(range_text(numeric_min, numeric_max))
            continue
        value = text_answer if text_answer is not None else numerical_answer
        if value is not None:
            correct.add(normalize_question_text(str(value)))
    return AnswerShape(frozenset(options), frozenset(correct))


def numbers_in(text: str) -> list[str]:
    """Digits and number words, in order — one of them changing ("two types" → "three types")
    usually means a different question, however similar the rest of the wording is."""
    return [
        t for t in normalize_question_text(text).split() if t.isdigit() or t in NUMBER_WORDS
    ]
