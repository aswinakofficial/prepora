"""
Markdown connector parser — docs/roadmap/engineering-roadmap.md item 22.

A direct port of packages/content/src/parser.ts, preserving the format contract in
agents/content/schema.md exactly (packages/content stays in the repository as that format spec and
a reference implementation — this module is the executing path). Two documented drifts are fixed
here (and, since packages/content is meant to stay a meaningful reference, in parser.ts itself,
before this port): `**Tags:**` is specified but was never parsed, and `FLAG FOR HUMAN REVIEW` was
not recognised (that one was already fixed in parser.ts by item 19; this is just porting the fixed
version forward).

Markdown's options and answer are already unambiguous and structured — a letter-keyed option list,
a typed answer — unlike a scraped HTML page's free text. That is why this parser targets
NormalizedQuestion's own answer types (McqAnswer/MultipleCorrectAnswer/TextAnswer/NumericalAnswer)
directly rather than routing through ExtractedQuestion's free-text shape: ExtractedQuestion exists
specifically to carry an *unresolved* answer/options pair through to a normalizer that has to guess
at structure, and Markdown was never unresolved to begin with. Forcing it through that shape would
mean discarding real option keys just to reconstruct them positionally a moment later.
"""
import re
from dataclasses import dataclass
from typing import Literal

import yaml
from pydantic import BaseModel, Field, ValidationError

from prepora_pipeline.contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedAnswer,
    NumericalAnswer,
    TextAnswer,
)


class MarkdownParseError(Exception):
    pass


class MarkdownFrontmatter(BaseModel):
    """Mirrors packages/content/src/schema.ts's QuestionSetFrontmatterSchema field for field."""

    id: str = Field(min_length=1)
    organization: str | None = None
    exam: str = Field(min_length=1)
    exam_variant: str = Field(min_length=1)
    year: int | None = Field(default=None, ge=1900, le=2100)
    session_label: str | None = None
    shift: str | None = None
    course: str | None = None
    subject: str = Field(min_length=1)
    title: str = Field(min_length=1)
    source_type: Literal["official", "user_submitted", "editorial", "generated", "unknown"] = (
        "official"
    )
    source_url: str | None = None
    source_document: str | None = None


@dataclass
class ParsedQuestion:
    number: int
    question_text: str
    question_type: str
    options: list[tuple[str, str]]  # (key, text)
    answer: NormalizedAnswer | None
    explanation: str | None
    topic: str | None
    difficulty: str | None
    tags: list[str] | None
    needs_review: bool
    review_note: str | None


@dataclass
class ParsedMarkdown:
    frontmatter: MarkdownFrontmatter
    questions: list[ParsedQuestion]


_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.DOTALL)
_ANSWER_LINE_RE = re.compile(r"^\*{0,2}Answer[:\s*]*\*{0,2}:?\s*(.+)", re.IGNORECASE)
_FLAG_RE = re.compile(r"^FLAG FOR HUMAN REVIEW\b\s*[-—]*\s*(.*)$", re.IGNORECASE)
_EXPLANATION_LINE_RE = re.compile(r"^\*{0,2}Explanation[:\s*]*\*{0,2}:?\s*", re.IGNORECASE)
_TOPIC_LINE_RE = re.compile(r"^\*{0,2}Topic[:\s*]*\*{0,2}:?\s*", re.IGNORECASE)
_DIFFICULTY_LINE_RE = re.compile(r"^\*{0,2}Difficulty[:\s*]*\*{0,2}:?\s*", re.IGNORECASE)
_TAGS_LINE_RE = re.compile(r"^\*{0,2}Tags[:\s*]*\*{0,2}:?\s*", re.IGNORECASE)
_OPTION_LINE_RE = re.compile(r"^[-*]\s*([A-Za-z])[.)]\s+(.+)$")
_QUESTION_HEADING_RE = re.compile(r"^#\s+Question\s+(\d+)", re.IGNORECASE)


def _parse_option_line(line: str) -> tuple[str, str] | None:
    match = _OPTION_LINE_RE.match(line)
    if not match:
        return None
    return match.group(1).upper(), match.group(2).strip()


def _parse_answer_line(line: str) -> NormalizedAnswer | None:
    match = _ANSWER_LINE_RE.match(line)
    if not match:
        return None
    raw = match.group(1).strip()

    if "," in raw or re.search(r"\band\b", raw, re.IGNORECASE):
        candidates = re.split(r"[,\s]+and\s+|,\s*", raw, flags=re.IGNORECASE)
        keys = [k.strip().upper() for k in candidates]
        keys = [k for k in keys if re.fullmatch(r"[A-Z]", k)]
        if len(keys) > 1:
            return MultipleCorrectAnswer(correct_keys=keys)

    if re.fullmatch(r"[A-Za-z]", raw):
        return McqAnswer(correct_key=raw.upper())
    if re.fullmatch(r"[-\d.]+", raw):
        return NumericalAnswer(answer=raw)
    return TextAnswer(answer=raw)


def _parse_question_block(raw_lines: list[str], question_number: int) -> ParsedQuestion:
    lines = [line.strip() for line in raw_lines]
    question_text_lines: list[str] = []
    options: list[tuple[str, str]] = []
    answer: NormalizedAnswer | None = None
    explanation: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    tags: list[str] | None = None
    needs_review = False
    review_note: str | None = None
    mode: Literal["question", "options", "explanation"] = "question"

    for line in lines:
        if not line:
            continue

        answer_match = _ANSWER_LINE_RE.match(line)
        if answer_match:
            raw = answer_match.group(1).strip()
            flag_match = _FLAG_RE.match(raw)
            if flag_match:
                needs_review = True
                review_note = (
                    flag_match.group(1).strip() or "Flagged for human review by content agent"
                )
            else:
                parsed = _parse_answer_line(line)
                if parsed is not None:
                    answer = parsed
                else:
                    needs_review = True
                    review_note = f'Could not parse answer: "{line}"'
            mode = "explanation"
            continue

        if _EXPLANATION_LINE_RE.match(line):
            mode = "explanation"
            inline = _EXPLANATION_LINE_RE.sub("", line).strip()
            if inline:
                explanation = inline
            continue

        if _TOPIC_LINE_RE.match(line):
            topic = _TOPIC_LINE_RE.sub("", line).strip()
            continue

        if _DIFFICULTY_LINE_RE.match(line):
            raw_difficulty = _DIFFICULTY_LINE_RE.sub("", line).strip().lower()
            if raw_difficulty in ("easy", "medium", "hard", "expert"):
                difficulty = raw_difficulty
            continue

        # Tags line — specified in agents/content/schema.md but never parsed until this item.
        if _TAGS_LINE_RE.match(line):
            raw_tags = _TAGS_LINE_RE.sub("", line).strip()
            parsed_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            if parsed_tags:
                tags = parsed_tags
            continue

        option = _parse_option_line(line)
        if option:
            options.append(option)
            mode = "options"
            continue

        if mode == "explanation":
            explanation = f"{explanation}\n{line}" if explanation else line
            continue

        if mode == "question":
            question_text_lines.append(line)

    if isinstance(answer, McqAnswer) and options:
        option_keys = [key for key, _ in options]
        if answer.correct_key not in option_keys:
            needs_review = True
            review_note = f"Answer key {answer.correct_key!r} not in options {option_keys!r}"

    if answer is None:
        needs_review = True
        review_note = review_note or "No answer found"

    return ParsedQuestion(
        number=question_number,
        question_text="\n".join(question_text_lines).strip(),
        question_type="mcq" if options else "descriptive",
        options=options,
        answer=answer,
        explanation=explanation.strip() if explanation else None,
        topic=topic,
        difficulty=difficulty,
        tags=tags,
        needs_review=needs_review,
        review_note=review_note,
    )


def parse_markdown(markdown: str) -> ParsedMarkdown:
    """
    Parses a Prepora-format Markdown string (agents/content/schema.md) into frontmatter + a list of
    parsed questions. Raises MarkdownParseError on malformed frontmatter or a file with no question
    blocks at all — mirrors parsePreporaMarkdown's error cases exactly.
    """
    match = _FRONTMATTER_RE.match(markdown)
    if not match:
        raise MarkdownParseError("No YAML frontmatter block found (expected leading --- ... ---).")

    frontmatter_raw = yaml.safe_load(match.group(1)) or {}
    content = match.group(2)

    try:
        frontmatter = MarkdownFrontmatter(**frontmatter_raw)
    except ValidationError as exc:
        raise MarkdownParseError(f"Frontmatter: {exc}") from exc

    question_blocks: list[tuple[int, list[str]]] = []
    current_block: list[str] = []
    current_number = 0

    # A block only has real content once it has a non-blank line — a bare truthiness check on the
    # list would count a blank line between a trailing "---" and the next "# Question N" heading
    # as content, producing a phantom empty, needs-review question between every real pair. This
    # is exactly the shape of agents/content/schema.md's own File Structure example (and both
    # files in agents/content/examples/): headings *and* a trailing "---" together. See
    # packages/content/src/parser.ts's identical fix for the same bug in the reference
    # implementation — found by running the real example files through this parser, not just
    # synthetic snippets that only ever used one separator style at a time.
    def _has_content(block: list[str]) -> bool:
        return any(line.strip() for line in block)

    for line in content.split("\n"):
        heading = _QUESTION_HEADING_RE.match(line)
        if heading:
            if _has_content(current_block) and current_number > 0:
                question_blocks.append((current_number, current_block))
            current_number = int(heading.group(1))
            current_block = []
        elif line.strip() == "---":
            if _has_content(current_block) and current_number > 0:
                question_blocks.append((current_number, current_block))
                current_block = []
                current_number += 1
        else:
            current_block.append(line)

    if _has_content(current_block) and current_number > 0:
        question_blocks.append((current_number, current_block))

    if not question_blocks:
        raise MarkdownParseError("No questions found in content")

    questions = [_parse_question_block(lines, number) for number, lines in question_blocks]
    return ParsedMarkdown(frontmatter=frontmatter, questions=questions)
