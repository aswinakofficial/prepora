"""
Idempotent, occurrence-aware publishing — docs/roadmap/engineering-roadmap.md item 18.

Publishing the same content twice must produce the same result: one question row, with an
occurrence per (question, question_set) pair rather than a duplicate question. This finally uses
the canonical/occurrence model packages/db/src/schema/questions.ts has had since the first
migration — the old TS publish path
(packages/api/src/routers/admin.router.ts's processReviewItem) never wrote questionOccurrences or
topicId, generated a random slug suffix, and matched answers by string equality against option
text. All three are fixed here.

Scope, stated plainly: this stage requires its input to already resolve to a *registered* exam
(items 10/14) — it does not invent an exam, organization, or exam type from free text, since which
organization or category a new exam belongs to is a real decision this stage has no way to make
safely. A NormalizedQuestion whose exam_slug doesn't match a real, already-registered `exams` row
fails clearly rather than guessing. Exam variants, sessions, subjects, topics, and courses are
lower-risk, generic taxonomy and are created on demand if missing.

Reusing an existing canonical question when the *same content* reappears under a different
stable_content_id (a different exam year, e.g.) is exact-match only here, via
`questions.content_hash` — the same normalize+hash algorithm as
packages/content/src/duplicates.ts's contentHash(). Real near-duplicate detection across
genuinely different phrasings of the same question is
docs/roadmap/engineering-roadmap.md item 20's job, not this one's — this stage's own tests only
require exact-text reuse, which is what "the same question in two exam years produces one question
and two occurrences" actually needs.
"""
from dataclasses import dataclass

from prepora_pipeline.contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedQuestion,
    NumericalAnswer,
    TextAnswer,
)

from ..core.db import get_db_connection


class PublishError(Exception):
    pass


@dataclass
class PublishResult:
    question_id: str
    stable_content_id: str
    question_set_id: str
    question_created: bool
    occurrence_created: bool


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
    normalized = " ".join(question_text.lower().split())
    normalized = "".join(ch for ch in normalized if ch.isalnum() or ch.isspace())
    normalized = normalized.strip()

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


def _slug_component(value: str) -> str:
    return value.strip().upper().replace(" ", "-").replace("_", "-")


def _year_or_session(normalized: NormalizedQuestion):
    return normalized.year if normalized.year is not None else (normalized.session_label or "v1")


def derive_stable_content_id(normalized: NormalizedQuestion) -> str:
    """
    {EXAM}-{VARIANT}-{YEAR-or-SESSION}-{SUBJECT}-Q{number}, following the convention documented in
    agents/content/schema.md's "Stable IDs" section (e.g. KPSC-AE-2025-CIVIL-Q001), built from the
    slugs a NormalizedQuestion already carries rather than a separate "code" field no table has.
    """
    if normalized.number is None:
        raise PublishError("Cannot derive a stable_content_id without a question number.")
    parts = [
        normalized.exam_slug,
        normalized.exam_variant_slug,
        str(_year_or_session(normalized)),
        normalized.subject_slug,
    ]
    base = "-".join(_slug_component(p) for p in parts)
    return f"{base}-Q{normalized.number:03d}"


def derive_question_set_slug(normalized: NormalizedQuestion) -> str:
    parts = [
        normalized.exam_slug,
        normalized.exam_variant_slug,
        str(_year_or_session(normalized)),
        normalized.subject_slug,
    ]
    if normalized.shift:
        parts.append(normalized.shift)
    return "-".join(p.lower().replace(" ", "-").replace("_", "-") for p in parts)


def _humanize(slug: str) -> str:
    return " ".join(word.capitalize() for word in slug.replace("_", "-").split("-"))


def publish_question(normalized: NormalizedQuestion) -> PublishResult:
    if normalized.needs_review:
        raise PublishError(
            f"Question is flagged needs_review ({normalized.review_note!r}) and cannot be "
            "published until resolved."
        )
    if normalized.answer is None:
        raise PublishError("Cannot publish a question with no answer.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            exam_id = _resolve_exam(cur, normalized.exam_slug)
            variant_id = _resolve_or_create_variant(cur, exam_id, normalized.exam_variant_slug)
            session_id = _resolve_or_create_session(
                cur, variant_id, normalized.year, normalized.session_label
            )
            subject_id = _resolve_or_create_subject(cur, normalized.subject_slug)

            topic_id = None
            if normalized.topic_slug:
                topic_id = _resolve_or_create_topic(cur, subject_id, normalized.topic_slug)
            if normalized.course_slug:
                _resolve_or_create_course(cur, variant_id, subject_id, normalized.course_slug)

            question_set_id = _resolve_or_create_question_set(
                cur, variant_id, session_id, subject_id, normalized
            )

            stable_content_id = derive_stable_content_id(normalized)
            question_id, question_created = _resolve_or_create_question(
                cur, stable_content_id, normalized, topic_id
            )

            occurrence_created = _resolve_or_create_occurrence(
                cur, question_id, question_set_id, normalized.number
            )

            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return PublishResult(
        question_id=question_id,
        stable_content_id=stable_content_id,
        question_set_id=question_set_id,
        question_created=question_created,
        occurrence_created=occurrence_created,
    )


def _resolve_exam(cur, exam_slug: str) -> str:
    cur.execute("SELECT id FROM exams WHERE slug = %s", (exam_slug,))
    row = cur.fetchone()
    if row is None:
        raise PublishError(
            f"Exam {exam_slug!r} is not registered in the catalog. Register it (and its "
            "organization/exam type) before publishing content for it — see "
            "docs/roadmap/engineering-roadmap.md item 10."
        )
    return row[0]


def _resolve_or_create_variant(cur, exam_id: str, variant_slug: str) -> str:
    cur.execute(
        "SELECT id FROM exam_variants WHERE exam_id = %s AND slug = %s", (exam_id, variant_slug)
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO exam_variants (exam_id, name, slug) VALUES (%s, %s, %s) RETURNING id",
        (exam_id, _humanize(variant_slug), variant_slug),
    )
    return cur.fetchone()[0]


def _resolve_or_create_session(
    cur, variant_id: str, year: int | None, session_label: str | None
) -> str:
    if year is not None:
        cur.execute(
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND year = %s",
            (variant_id, year),
        )
    elif session_label:
        cur.execute(
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND label = %s",
            (variant_id, session_label),
        )
    else:
        cur.execute(
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND year IS NULL "
            "AND label = 'Version 1'",
            (variant_id,),
        )
    row = cur.fetchone()
    if row:
        return row[0]

    label = session_label or (str(year) if year is not None else "Version 1")
    cur.execute(
        "INSERT INTO exam_sessions (exam_variant_id, label, year) "
        "VALUES (%s, %s, %s) RETURNING id",
        (variant_id, label, year),
    )
    return cur.fetchone()[0]


def _resolve_or_create_subject(cur, subject_slug: str) -> str:
    cur.execute("SELECT id FROM subjects WHERE slug = %s", (subject_slug,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO subjects (name, slug) VALUES (%s, %s) RETURNING id",
        (_humanize(subject_slug), subject_slug),
    )
    return cur.fetchone()[0]


def _resolve_or_create_topic(cur, subject_id: str, topic_slug: str) -> str:
    cur.execute(
        "SELECT id FROM topics WHERE subject_id = %s AND slug = %s", (subject_id, topic_slug)
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO topics (subject_id, name, slug) VALUES (%s, %s, %s) RETURNING id",
        (subject_id, _humanize(topic_slug), topic_slug),
    )
    return cur.fetchone()[0]


def _resolve_or_create_course(cur, variant_id: str, subject_id: str, course_slug: str) -> str:
    cur.execute(
        "SELECT id FROM courses WHERE exam_variant_id = %s AND subject_id = %s",
        (variant_id, subject_id),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO courses (exam_variant_id, subject_id, code) "
        "VALUES (%s, %s, %s) RETURNING id",
        (variant_id, subject_id, course_slug),
    )
    return cur.fetchone()[0]


def _resolve_or_create_question_set(
    cur, variant_id: str, session_id: str, subject_id: str, normalized: NormalizedQuestion
) -> str:
    slug = derive_question_set_slug(normalized)
    cur.execute("SELECT id FROM question_sets WHERE slug = %s", (slug,))
    row = cur.fetchone()
    if row:
        return row[0]

    title_parts = [_humanize(normalized.exam_slug), _humanize(normalized.exam_variant_slug)]
    if normalized.year:
        title_parts.append(str(normalized.year))
    elif normalized.session_label:
        title_parts.append(normalized.session_label)
    title_parts.append(_humanize(normalized.subject_slug))
    title = " ".join(title_parts)

    cur.execute(
        "INSERT INTO question_sets "
        "(exam_variant_id, exam_session_id, subject_id, shift_label, title, slug, source_type, "
        "source_url, source_document, publication_status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'published') RETURNING id",
        (
            variant_id,
            session_id,
            subject_id,
            normalized.shift,
            title,
            slug,
            normalized.source_type,
            normalized.source_url,
            normalized.source_document,
        ),
    )
    return cur.fetchone()[0]


def _resolve_or_create_question(
    cur, stable_content_id: str, normalized: NormalizedQuestion, topic_id: str | None
) -> tuple[str, bool]:
    cur.execute("SELECT id FROM questions WHERE stable_content_id = %s", (stable_content_id,))
    row = cur.fetchone()
    if row:
        return row[0], False

    hash_ = content_hash(normalized.question_text)
    cur.execute("SELECT id FROM questions WHERE content_hash = %s", (hash_,))
    row = cur.fetchone()
    if row:
        # The exact same question content, previously published under a different
        # stable_content_id (typically: a different exam year) — reuse the canonical row rather
        # than creating a duplicate. Fuzzy/near-duplicate reuse across different phrasings is item
        # 20's job, not this exact-match check's.
        return row[0], False

    slug = stable_content_id.lower()
    cur.execute(
        "INSERT INTO questions "
        "(stable_content_id, content_hash, slug, question_text, question_type, explanation, "
        "difficulty, topic_id, status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'published') RETURNING id",
        (
            stable_content_id,
            hash_,
            slug,
            normalized.question_text,
            normalized.question_type,
            normalized.explanation,
            normalized.difficulty,
            topic_id,
        ),
    )
    question_id = cur.fetchone()[0]

    option_id_by_key = {}
    for i, opt in enumerate(normalized.options):
        cur.execute(
            "INSERT INTO question_options (question_id, option_key, option_text, sequence) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (question_id, opt.key, opt.text, i),
        )
        option_id_by_key[opt.key] = cur.fetchone()[0]

    _insert_answers(cur, question_id, normalized.answer, option_id_by_key)

    return question_id, True


def _insert_answers(cur, question_id: str, answer, option_id_by_key: dict[str, str]) -> None:
    if isinstance(answer, McqAnswer):
        option_id = option_id_by_key.get(answer.correct_key)
        if option_id is None:
            raise PublishError(
                f"mcq answer key {answer.correct_key!r} is not among this question's options "
                f"{sorted(option_id_by_key)!r} — never matched by string equality on option "
                "text (item 18's own fix)."
            )
        cur.execute(
            "INSERT INTO question_answers (question_id, correct_option_id) VALUES (%s, %s)",
            (question_id, option_id),
        )
    elif isinstance(answer, MultipleCorrectAnswer):
        missing = [k for k in answer.correct_keys if k not in option_id_by_key]
        if missing:
            raise PublishError(
                f"multiple_correct answer keys {missing!r} are not among this question's "
                f"options {sorted(option_id_by_key)!r}."
            )
        for key in answer.correct_keys:
            cur.execute(
                "INSERT INTO question_answers (question_id, correct_option_id, is_correct) "
                "VALUES (%s, %s, true)",
                (question_id, option_id_by_key[key]),
            )
    elif isinstance(answer, TextAnswer):
        cur.execute(
            "INSERT INTO question_answers (question_id, text_answer) VALUES (%s, %s)",
            (question_id, answer.answer),
        )
    elif isinstance(answer, NumericalAnswer):
        cur.execute(
            "INSERT INTO question_answers (question_id, numerical_answer) VALUES (%s, %s)",
            (question_id, answer.answer),
        )
    else:
        raise PublishError(f"Unknown answer type: {type(answer)!r}")


def _resolve_or_create_occurrence(
    cur, question_id: str, question_set_id: str, original_question_number: int | None
) -> bool:
    cur.execute(
        "SELECT id FROM question_occurrences WHERE question_id = %s AND question_set_id = %s",
        (question_id, question_set_id),
    )
    if cur.fetchone():
        return False
    cur.execute(
        "INSERT INTO question_occurrences "
        "(question_id, question_set_id, original_question_number) VALUES (%s, %s, %s)",
        (question_id, question_set_id, original_question_number),
    )
    return True
