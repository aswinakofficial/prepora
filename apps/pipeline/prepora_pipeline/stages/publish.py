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
packages/content/src/duplicates.ts's contentHash(). Deciding *whether* a match should be reused,
absorbed as an in-paper repeat, or refused as an unconfirmed near-duplicate is
docs/roadmap/engineering-roadmap.md item 20's job (stages/dedupe.py) — this stage calls
check_duplicate() and trusts its answer rather than re-deciding on its own.
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
from .content_hash import content_hash, normalize_question_text
from .dedupe import DedupeDecision, check_duplicate
from .stable_id import derive_question_set_slug, derive_stable_content_id
from .validate import validate_question


class PublishError(Exception):
    pass


@dataclass
class PublishResult:
    question_id: str
    stable_content_id: str
    question_set_id: str
    question_created: bool
    occurrence_created: bool
    dedupe_outcome: str


@dataclass
class HeldResult:
    """publish_question(..., on_near_duplicate="hold") found a possible duplicate: nothing was
    written, and `decision` carries what a reviewer needs to decide (see dedupe.DedupeDecision)."""

    decision: DedupeDecision


def _humanize(slug: str) -> str:
    return " ".join(word.capitalize() for word in slug.replace("_", "-").split("-"))


def publish_question(
    normalized: NormalizedQuestion,
    *,
    on_near_duplicate: str = "refuse",
    link_to_question_id: str | None = None,
    publish_as_new: bool = False,
) -> PublishResult | HeldResult:
    """Publish one question.

    A near duplicate (very similar to, but not the same as, a published question) is never merged
    or published silently. By default it's refused with PublishError; with
    on_near_duplicate="hold" nothing is written and a HeldResult describes the match, so the caller
    can queue it for a person. That person's decision then comes back as either
    link_to_question_id (same question: add this set as another occurrence of it, and remember
    the wording as a variant) or publish_as_new=True (a different question: skip the near-duplicate
    gate).
    """
    # docs/roadmap/engineering-roadmap.md item 19: nothing publishes without passing the
    # deterministic quality gate first — this replaces the narrower needs_review/answer-None
    # checks this function used to do inline, since validate_question() covers both plus every
    # other rule (duplicate option keys, invalid answer keys, an unregistered exam, ...).
    report = validate_question(normalized)
    if not report.valid:
        reasons = "; ".join(
            f"{i.code}: {i.message}" for i in report.issues if i.severity == "error"
        )
        raise PublishError(f"Question failed the quality gate ({reasons}).")
    validated = report.validated
    assert validated is not None  # guaranteed whenever report.valid is True

    # docs/roadmap/engineering-roadmap.md item 20: a near-duplicate is never auto-published, no
    # matter how confident validate_question was — "never merge silently" applies here too.
    # Exact duplicates (in or across question sets) are allowed through: publish_question's own
    # content_hash lookup below is what actually reuses the canonical question or absorbs an
    # in-set repeat as a no-op occurrence; this decision is what makes that reuse an intentional,
    # reportable outcome rather than an unexamined side effect.
    if link_to_question_id is not None:
        # A reviewer decided this is the same question as an existing one — no dedupe check left
        # to make; the existing question is reused below.
        dedupe_decision = DedupeDecision(
            outcome="exact_duplicate_cross_set",
            reason=f"Linked by a reviewer to existing question {link_to_question_id}.",
            existing_question_id=link_to_question_id,
        )
    else:
        dedupe_decision = check_duplicate(validated)
        if dedupe_decision.outcome == "near_duplicate" and not publish_as_new:
            if on_near_duplicate == "hold":
                return HeldResult(decision=dedupe_decision)
            raise PublishError(
                f"Question failed the deduplication gate ({dedupe_decision.reason})"
            )

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            exam_id = _resolve_exam(cur, validated.exam_slug)
            variant_id = _resolve_or_create_variant(cur, exam_id, validated.exam_variant_slug)
            session_id = _resolve_or_create_session(
                cur, variant_id, validated.year, validated.session_label
            )
            subject_id = _resolve_or_create_subject(cur, validated.subject_slug)

            topic_id = None
            if validated.topic_slug:
                topic_id = _resolve_or_create_topic(cur, subject_id, validated.topic_slug)
            if validated.course_slug:
                _resolve_or_create_course(cur, variant_id, subject_id, validated.course_slug)

            question_set_id = _resolve_or_create_question_set(
                cur, variant_id, session_id, subject_id, validated
            )

            try:
                stable_content_id = derive_stable_content_id(validated)
            except ValueError as exc:
                raise PublishError(str(exc)) from exc
            if link_to_question_id is not None:
                question_id, question_created = _link_to_existing_question(
                    cur, link_to_question_id, validated
                )
            else:
                question_id, question_created = _resolve_or_create_question(
                    cur, stable_content_id, validated, topic_id
                )

            occurrence_created = _resolve_or_create_occurrence(
                cur,
                question_id,
                question_set_id,
                # Pool sources have no fixed numbering: a question new to the set goes after the
                # ones already in it, whatever position it had in this particular scrape.
                None if validated.identity == "content" else validated.number,
            )
            _record_media(cur, question_id, validated.media)

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
        dedupe_outcome=dedupe_decision.outcome,
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


# Race-safe find-or-create. Callers publish many questions concurrently (packages/api's
# review-batch approval runs several at once), and they all need the same variant, session,
# subject and question set the first time an exam is published. A plain "SELECT, then INSERT if
# missing" let two requests both see nothing and both insert, and the loser failed with a
# UniqueViolation — which surfaced as whole waves of "Internal Server Error" publish failures.
# ON CONFLICT DO NOTHING makes the losing insert a no-op instead (under READ COMMITTED it waits
# for the winner to commit), and the follow-up SELECT then finds the winner's row.
def _select_id(cur, sql: str, params: tuple) -> str | None:
    cur.execute(sql, params)
    row = cur.fetchone()
    return row[0] if row else None


def _get_or_insert(
    cur, select_sql: str, select_params: tuple, insert_sql: str, insert_params: tuple
) -> str:
    existing = _select_id(cur, select_sql, select_params)
    if existing:
        return existing
    cur.execute(f"{insert_sql} ON CONFLICT DO NOTHING RETURNING id", insert_params)
    row = cur.fetchone()
    if row:
        return row[0]
    winner = _select_id(cur, select_sql, select_params)
    if winner is None:
        raise PublishError("A concurrent insert conflicted but its row could not be found.")
    return winner


def _resolve_or_create_variant(cur, exam_id: str, variant_slug: str) -> str:
    return _get_or_insert(
        cur,
        "SELECT id FROM exam_variants WHERE exam_id = %s AND slug = %s",
        (exam_id, variant_slug),
        "INSERT INTO exam_variants (exam_id, name, slug) VALUES (%s, %s, %s)",
        (exam_id, _humanize(variant_slug), variant_slug),
    )


def _resolve_or_create_session(
    cur, variant_id: str, year: int | None, session_label: str | None
) -> str:
    if year is not None:
        find = (
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND year = %s",
            (variant_id, year),
        )
    elif session_label:
        find = (
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND label = %s",
            (variant_id, session_label),
        )
    else:
        find = (
            "SELECT id FROM exam_sessions WHERE exam_variant_id = %s AND year IS NULL "
            "AND label = 'Version 1'",
            (variant_id,),
        )

    # The common case — the session already exists — takes no lock at all. Taking it
    # unconditionally held one lock per exam for each publish's whole transaction, which
    # serialized every concurrent publish for the same exam (a 50-question batch took ~25s).
    existing = _select_id(cur, *find)
    if existing:
        return existing

    # First publish for this session: exam_sessions has no unique constraint to conflict on, so
    # concurrent creators are serialized with a transaction-scoped advisory lock (released at
    # commit/rollback) and re-check before inserting.
    session_key = f"exam_session:{variant_id}:{year if year is not None else session_label or ''}"
    cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (session_key,))
    existing = _select_id(cur, *find)
    if existing:
        return existing

    label = session_label or (str(year) if year is not None else "Version 1")
    cur.execute(
        "INSERT INTO exam_sessions (exam_variant_id, label, year) "
        "VALUES (%s, %s, %s) RETURNING id",
        (variant_id, label, year),
    )
    return cur.fetchone()[0]


def _resolve_or_create_subject(cur, subject_slug: str) -> str:
    return _get_or_insert(
        cur,
        "SELECT id FROM subjects WHERE slug = %s",
        (subject_slug,),
        "INSERT INTO subjects (name, slug) VALUES (%s, %s)",
        (_humanize(subject_slug), subject_slug),
    )


def _resolve_or_create_topic(cur, subject_id: str, topic_slug: str) -> str:
    return _get_or_insert(
        cur,
        "SELECT id FROM topics WHERE subject_id = %s AND slug = %s",
        (subject_id, topic_slug),
        "INSERT INTO topics (subject_id, name, slug) VALUES (%s, %s, %s)",
        (subject_id, _humanize(topic_slug), topic_slug),
    )


def _resolve_or_create_course(cur, variant_id: str, subject_id: str, course_slug: str) -> str:
    return _get_or_insert(
        cur,
        "SELECT id FROM courses WHERE exam_variant_id = %s AND subject_id = %s",
        (variant_id, subject_id),
        "INSERT INTO courses (exam_variant_id, subject_id, code) VALUES (%s, %s, %s)",
        (variant_id, subject_id, course_slug),
    )


def _resolve_or_create_question_set(
    cur, variant_id: str, session_id: str, subject_id: str, normalized: NormalizedQuestion
) -> str:
    slug = derive_question_set_slug(normalized)
    existing = _select_id(cur, "SELECT id FROM question_sets WHERE slug = %s", (slug,))
    if existing:
        return existing

    # A connector that knows what the set is actually called (e.g. "Official Microsoft Practice
    # Assessment") names it; otherwise fall back to a title derived from the slugs.
    title = normalized.question_set_title
    if not title:
        title_parts = [_humanize(normalized.exam_slug), _humanize(normalized.exam_variant_slug)]
        if normalized.year:
            title_parts.append(str(normalized.year))
        elif normalized.session_label:
            title_parts.append(normalized.session_label)
        title_parts.append(_humanize(normalized.subject_slug))
        title = " ".join(title_parts)

    return _get_or_insert(
        cur,
        "SELECT id FROM question_sets WHERE slug = %s",
        (slug,),
        "INSERT INTO question_sets "
        "(exam_variant_id, exam_session_id, subject_id, shift_label, title, slug, source_type, "
        "source_url, source_document, publication_status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'published')",
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


def _link_to_existing_question(
    cur, question_id: str, normalized: NormalizedQuestion
) -> tuple[str, bool]:
    """A reviewer's "same question" decision: reuse `question_id`, and record this wording as a
    variant of it (unless it's already the question's own wording) so the next time this wording is
    collected it links automatically, without another review."""
    cur.execute("SELECT question_text FROM questions WHERE id = %s", (question_id,))
    row = cur.fetchone()
    if row is None:
        raise PublishError(f"Can't link to question {question_id}: it no longer exists.")
    if normalize_question_text(row[0]) != normalize_question_text(normalized.question_text):
        cur.execute(
            "INSERT INTO question_variants (question_id, question_text, content_hash) "
            "VALUES (%s, %s, %s) ON CONFLICT (question_id, content_hash) DO NOTHING",
            (question_id, normalized.question_text, content_hash(normalized.question_text)),
        )
    return question_id, False


def _resolve_or_create_question(
    cur, stable_content_id: str, normalized: NormalizedQuestion, topic_id: str | None
) -> tuple[str, bool]:
    # One round trip for both lookups (each costs ~100ms against a remote database): a
    # stable_content_id match wins; otherwise the exact same question content, previously
    # published under a different stable_content_id (typically: a different exam year), is reused
    # rather than duplicated. Fuzzy/near-duplicate reuse across different phrasings is item 20's
    # job, not this exact-match check's.
    #
    # content_hash is a 32-bit djb2 — fast to index, but two different questions can share one. A
    # hash match is therefore only reused once the normalized text is confirmed equal; otherwise a
    # collision would silently merge a new question into an unrelated one.
    # Recorded variants (question_variants) are other accepted wordings of a question, so they
    # match here exactly like the question's own text.
    hash_ = content_hash(normalized.question_text)
    cur.execute(
        "SELECT id, question_text, stable_content_id = %s AS by_id FROM questions "
        "WHERE stable_content_id = %s OR content_hash = %s "
        "UNION ALL "
        "SELECT question_id, question_text, false FROM question_variants WHERE content_hash = %s "
        "ORDER BY by_id DESC",
        (stable_content_id, stable_content_id, hash_, hash_),
    )
    wanted = normalize_question_text(normalized.question_text)
    for existing_id, existing_text, by_id in cur.fetchall():
        if by_id or normalize_question_text(existing_text) == wanted:
            return existing_id, False

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

    # All options in one multi-row INSERT rather than one round trip each.
    option_id_by_key = {}
    if normalized.options:
        values_sql = ", ".join(["(%s, %s, %s, %s)"] * len(normalized.options))
        params = [
            value
            for i, opt in enumerate(normalized.options)
            for value in (question_id, opt.key, opt.text, i)
        ]
        cur.execute(
            "INSERT INTO question_options (question_id, option_key, option_text, sequence) "
            f"VALUES {values_sql} RETURNING option_key, id",
            params,
        )
        option_id_by_key = dict(cur.fetchall())

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


def _record_media(cur, question_id: str, media) -> None:
    """
    Records the question's images (already stored by the scraper — see core/media_store.py).
    Idempotent like the rest of publishing: re-publishing the same question adds only images it
    doesn't already have, matched on (storage key, placement, option), in one round trip.
    """
    if not media:
        return
    rows = []
    positions: dict[tuple[str, str | None], int] = {}
    for item in media:
        slot = (item.placement, item.option_key)
        position = positions.get(slot, 0)
        positions[slot] = position + 1
        rows.append(
            (
                item.storage_key.rsplit("/", 1)[-1],
                item.storage_key,
                item.mime_type,
                item.size_bytes,
                item.alt_text,
                question_id,
                item.placement,
                item.option_key,
                position,
            )
        )
    values_sql = ", ".join(
        ["(%s, %s, %s, %s::integer, %s, %s, %s, %s, %s::integer)"] * len(rows)
    )
    cur.execute(
        "INSERT INTO media (filename, storage_key, mime_type, size_bytes, alt_text, question_id, "
        "placement, option_key, position) "
        "SELECT v.* FROM (VALUES "
        + values_sql
        + ") AS v(filename, storage_key, mime_type, size_bytes, alt_text, question_id, "
        "placement, option_key, position) "
        "WHERE NOT EXISTS (SELECT 1 FROM media m WHERE m.question_id = v.question_id "
        "AND m.storage_key = v.storage_key AND m.placement IS NOT DISTINCT FROM v.placement "
        "AND m.option_key IS NOT DISTINCT FROM v.option_key)",
        [value for row in rows for value in row],
    )


def _resolve_or_create_occurrence(
    cur, question_id: str, question_set_id: str, original_question_number: int | None
) -> bool:
    # One round trip: question_occurrences_unique (question_id, question_set_id) makes an
    # existing occurrence a no-op, and RETURNING tells us whether a row was actually inserted.
    # Without a number (content identity), the occurrence takes the next one in its set so new
    # questions append. Concurrent publishes into the same set would otherwise read the same MAX
    # and tie, so appends to one set are serialized by a transaction-scoped advisory lock (held
    # only for the short remainder of this publish).
    if original_question_number is None:
        # A re-scraped question usually already has its occurrence — that's a no-op, and must not
        # queue behind the lock (which is held to commit) and serialize the whole batch.
        cur.execute(
            "SELECT 1 FROM question_occurrences WHERE question_id = %s AND question_set_id = %s",
            (question_id, question_set_id),
        )
        if cur.fetchone():
            return False
        cur.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", (f"occurrence-append:{question_set_id}",)
        )
    cur.execute(
        "INSERT INTO question_occurrences "
        "(question_id, question_set_id, original_question_number) VALUES (%s, %s, "
        "COALESCE(%s, (SELECT COALESCE(MAX(original_question_number), 0) + 1 "
        "FROM question_occurrences WHERE question_set_id = %s))) "
        "ON CONFLICT (question_id, question_set_id) DO NOTHING RETURNING id",
        (question_id, question_set_id, original_question_number, question_set_id),
    )
    return cur.fetchone() is not None
