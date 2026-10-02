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

Whether a question is new, already published (in this set or another), or a possible duplicate
for a person to decide is the shared dedupe layer's call (prepora_pipeline/dedupe,
docs/architecture/dedupe.md): this stage calls check_duplicate() and does what it decides —
reusing exactly the question it names — rather than re-matching on its own.
"""
import os
from dataclasses import dataclass

from prepora_pipeline.contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedQuestion,
    NumericalAnswer,
    TextAnswer,
)

from ..core.db import get_db_connection
from ..core.media_store import FilesystemMediaStore, MediaStore, media_store_from_env
from ..dedupe import (
    NEEDS_DECISION,
    DedupeDecision,
    check_duplicate,
    content_hash,
    effective_identity,
    find_same_question,
    normalize_question_text,
)
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


@dataclass
class SkippedResult:
    """A reviewer already chose not to publish this exact question (dedupe's "previously_skipped"):
    nothing was written, and it isn't held again."""

    decision: DedupeDecision


_EXACT = ("exact_duplicate_in_set", "exact_duplicate_cross_set")


def _humanize(slug: str) -> str:
    return " ".join(word.capitalize() for word in slug.replace("_", "-").split("-"))


def publish_question(
    normalized: NormalizedQuestion,
    *,
    on_near_duplicate: str = "refuse",
    link_to_question_id: str | None = None,
    use_new_wording: bool = False,
    publish_as_new: bool = False,
) -> PublishResult | HeldResult | SkippedResult:
    """Publish one question.

    A possible duplicate — very similar wording, or identical wording with different options or
    answer — is never merged or published silently. By default it's refused with PublishError; with
    on_near_duplicate="hold" nothing is written and a HeldResult describes the match, so the caller
    can queue it for a person. That person's decision then comes back as either
    link_to_question_id (same question: add this set as another occurrence of it, and remember
    the wording as a variant) or publish_as_new=True (a different question: skip the near-duplicate
    gate). With use_new_wording=True, "same question" keeps this version instead: the existing
    question takes this wording, explanation and option text, and its old wording becomes the
    remembered variant. publish_as_new=True on identical wording gives the question its own
    stable id (stable_id.py's distinct=True). A question a reviewer already chose to skip returns
    SkippedResult unless publish_as_new is set.
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
        if dedupe_decision.outcome in NEEDS_DECISION and not publish_as_new:
            if on_near_duplicate == "hold":
                return HeldResult(decision=dedupe_decision)
            raise PublishError(
                f"Question failed the deduplication gate ({dedupe_decision.reason})"
            )
        if dedupe_decision.outcome == "previously_skipped" and not publish_as_new:
            return SkippedResult(decision=dedupe_decision)

    # docs/specs/04-media-storage.md: images reach R2 before anything is written, and outside the
    # transaction, so slow uploads never hold its locks. A failed publish leaves at most an unused,
    # content-addressed object behind.
    remote = _remote_media_store() if validated.media else None
    if remote is not None:
        upload_missing_media(remote, [(m.storage_key, m.mime_type) for m in validated.media])

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
                    cur, link_to_question_id, validated, use_new_wording=use_new_wording
                )
            else:
                question_id, question_created, stable_content_id = _resolve_or_create_question(
                    cur,
                    stable_content_id,
                    validated,
                    topic_id,
                    existing_question_id=(
                        dedupe_decision.existing_question_id
                        if dedupe_decision.outcome in _EXACT
                        else None
                    ),
                    force_new=publish_as_new,
                )

            occurrence_created = _resolve_or_create_occurrence(
                cur,
                question_id,
                question_set_id,
                # Pool sources have no fixed numbering: a question new to the set goes after the
                # ones already in it, whatever position it had in this particular scrape.
                None if effective_identity(validated) == "content" else validated.number,
                validated,
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


_KEY_ORDER = ("none", "provisional", "final", "revised")  # the key_status enum's own order


def _resolve_or_create_question_set(
    cur, variant_id: str, session_id: str, subject_id: str, normalized: NormalizedQuestion
) -> str:
    slug = derive_question_set_slug(normalized)
    cur.execute("SELECT id, key_status FROM question_sets WHERE slug = %s", (slug,))
    found = cur.fetchone()
    if found:
        existing, key_status = found
        # A key only moves forward — none < provisional < final < revised — so publishing from an
        # older key never relabels the set. The re-check in SQL keeps a concurrent move safe.
        if _KEY_ORDER.index(normalized.key_status) > _KEY_ORDER.index(key_status):
            cur.execute(
                "UPDATE question_sets SET key_status = %s, updated_at = now() "
                "WHERE id = %s AND key_status < %s::key_status",
                (normalized.key_status, existing, normalized.key_status),
            )
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
        "source_url, source_document, paper_kind, key_status, publication_status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'published')",
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
            normalized.paper_kind,
            normalized.key_status,
        ),
    )


def _record_variant(cur, question_id: str, text: str) -> None:
    cur.execute(
        "INSERT INTO question_variants (question_id, question_text, content_hash) "
        "VALUES (%s, %s, %s) ON CONFLICT (question_id, content_hash) DO NOTHING",
        (question_id, text, content_hash(text)),
    )


def _link_to_existing_question(
    cur, question_id: str, normalized: NormalizedQuestion, *, use_new_wording: bool = False
) -> tuple[str, bool]:
    """A reviewer's "same question" decision: reuse `question_id`, and remember the wording that
    isn't shown as a variant, so the next time either wording is collected it links automatically.

    By default the published question keeps its wording and this one is remembered. With
    use_new_wording=True the reviewer preferred this version: the question takes this text,
    explanation and option text — updated in place, so its id, slug (URL), occurrences and the
    option ids practice attempts point to are all unchanged — and the old wording is remembered.
    """
    cur.execute("SELECT question_text FROM questions WHERE id = %s", (question_id,))
    row = cur.fetchone()
    if row is None:
        raise PublishError(f"Can't link to question {question_id}: it no longer exists.")
    old_text = row[0]
    same_wording = normalize_question_text(old_text) == normalize_question_text(
        normalized.question_text
    )
    if not use_new_wording:
        if not same_wording:
            _record_variant(cur, question_id, normalized.question_text)
        return question_id, False

    cur.execute(
        "SELECT id, option_key FROM question_options WHERE question_id = %s ORDER BY sequence",
        (question_id,),
    )
    existing_options = cur.fetchall()
    if len(existing_options) != len(normalized.options):
        raise PublishError(
            f"Can't use the new version: it has {len(normalized.options)} options and the "
            f"published question has {len(existing_options)}. Keep the published version, or "
            "publish it as a different question."
        )
    # Option ids stay; only their text and keys move to the new version's, in order. Keys go via
    # temporary values first so renaming can't collide with the (question_id, option_key) unique.
    for position, (option_id, _) in enumerate(existing_options):
        cur.execute(
            "UPDATE question_options SET option_key = %s WHERE id = %s",
            (f"~{position}", option_id),
        )
    option_id_by_key = {}
    for (option_id, _), option in zip(existing_options, normalized.options, strict=True):
        cur.execute(
            "UPDATE question_options SET option_key = %s, option_text = %s WHERE id = %s",
            (option.key, option.text, option_id),
        )
        option_id_by_key[option.key] = option_id
    cur.execute("DELETE FROM question_answers WHERE question_id = %s", (question_id,))
    _insert_answers(cur, question_id, normalized, option_id_by_key)

    cur.execute(
        "UPDATE questions SET question_text = %s, content_hash = %s, "
        "explanation = COALESCE(%s, explanation), updated_at = now() WHERE id = %s",
        (
            normalized.question_text,
            content_hash(normalized.question_text),
            normalized.explanation,
            question_id,
        ),
    )
    # The new wording is now the question's own text; the old one becomes the remembered variant.
    # (Identical wording — a changed option list or answer key — leaves no old wording to keep.)
    if not same_wording:
        cur.execute(
            "DELETE FROM question_variants WHERE question_id = %s AND content_hash = %s",
            (question_id, content_hash(normalized.question_text)),
        )
        _record_variant(cur, question_id, old_text)
    return question_id, False


def _resolve_or_create_question(
    cur,
    stable_content_id: str,
    normalized: NormalizedQuestion,
    topic_id: str | None,
    *,
    existing_question_id: str | None = None,
    force_new: bool = False,
) -> tuple[str, bool, str]:
    """(question id, created?, stable_content_id) for the question to publish.

    The question dedupe named as this one is reused as-is. Otherwise, under a transaction-scoped
    lock on the wording's hash, the exact check is repeated: a batch publishes several questions
    at once, and two identical ones (or the same one from two batches) would each have checked
    before the other was written — both would have created a question. The lock makes the second
    wait for the first to commit, and then find it.

    force_new: a reviewer decided this is a different question from the published one it
    resembles, so nothing is reused; identical wording gets a distinct stable id.
    """
    if existing_question_id is not None and not force_new:
        if _select_id(cur, "SELECT id FROM questions WHERE id = %s", (existing_question_id,)):
            return existing_question_id, False, stable_content_id

    hash_ = content_hash(normalized.question_text)
    cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"question-text:{hash_}",))
    if not force_new:
        same = find_same_question(cur, normalized)
        if same:
            return same, False, stable_content_id
        # The id is taken, but not by this question (that would have matched just above): with
        # position identity, this paper's question N is already published with other content.
        # Reusing it would drop this question silently — the old behaviour — so it fails, naming
        # why. An edit of the same question is caught earlier, as a near duplicate for review.
        if _select_id(
            cur, "SELECT id FROM questions WHERE stable_content_id = %s", (stable_content_id,)
        ):
            raise PublishError(
                f"{stable_content_id} is already published as a different question (other "
                "wording, options or answer). Check the question's number, or publish it as a "
                "new question."
            )
    else:
        taken = _select_id(
            cur, "SELECT id FROM questions WHERE stable_content_id = %s", (stable_content_id,)
        )
        if taken:
            stable_content_id = derive_stable_content_id(normalized, distinct=True)
            already = _select_id(
                cur, "SELECT id FROM questions WHERE stable_content_id = %s", (stable_content_id,)
            )
            if already:
                return already, False, stable_content_id

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

    _insert_answers(cur, question_id, normalized, option_id_by_key)

    return question_id, True, stable_content_id


def _insert_answers(
    cur, question_id: str, normalized: NormalizedQuestion, option_id_by_key: dict[str, str]
) -> None:
    """The question's answer rows, each stating its provenance. A question with no answer to score
    (marks to all, dropped, cancelled — validate.py allows it only then) gets none."""
    answer = normalized.answer
    provenance = normalized.answer_provenance
    if answer is None:
        return
    if isinstance(answer, McqAnswer):
        option_id = option_id_by_key.get(answer.correct_key)
        if option_id is None:
            raise PublishError(
                f"mcq answer key {answer.correct_key!r} is not among this question's options "
                f"{sorted(option_id_by_key)!r} — never matched by string equality on option "
                "text (item 18's own fix)."
            )
        cur.execute(
            "INSERT INTO question_answers (question_id, correct_option_id, provenance) "
            "VALUES (%s, %s, %s)",
            (question_id, option_id, provenance),
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
                "INSERT INTO question_answers "
                "(question_id, correct_option_id, is_correct, provenance) "
                "VALUES (%s, %s, true, %s)",
                (question_id, option_id_by_key[key], provenance),
            )
    elif isinstance(answer, TextAnswer):
        cur.execute(
            "INSERT INTO question_answers (question_id, text_answer, provenance) "
            "VALUES (%s, %s, %s)",
            (question_id, answer.answer, provenance),
        )
    elif isinstance(answer, NumericalAnswer) and answer.ranges:
        # One row per accepted range, each carrying the display text ("4.24 to 4.26").
        for group, (lo, hi) in enumerate(answer.ranges):
            cur.execute(
                "INSERT INTO question_answers (question_id, numerical_answer, numeric_min, "
                "numeric_max, range_group, provenance) VALUES (%s, %s, %s, %s, %s, %s)",
                (question_id, answer.answer, lo, hi, group, provenance),
            )
    elif isinstance(answer, NumericalAnswer):
        cur.execute(
            "INSERT INTO question_answers (question_id, numerical_answer, provenance) "
            "VALUES (%s, %s, %s)",
            (question_id, answer.answer, provenance),
        )
    else:
        raise PublishError(f"Unknown answer type: {type(answer)!r}")


def upload_missing_media(
    remote: MediaStore,
    items: list[tuple[str, str]],
    local: MediaStore | None = None,
    *,
    skip_missing: bool = False,
) -> tuple[int, list[str]]:
    """Copies each (storage key, mime type) the remote store doesn't have yet from the local store.
    (how many were uploaded, keys missing locally). An image missing locally can't be published,
    so it raises — unless skip_missing, for media-sync's report of everything missing."""
    local = local or FilesystemMediaStore()
    uploaded = 0
    missing: list[str] = []
    for storage_key, mime_type in dict.fromkeys(items):
        if remote.exists(storage_key):
            continue
        if not local.exists(storage_key):
            if skip_missing:
                missing.append(storage_key)
                continue
            raise PublishError(
                f"Image {storage_key} isn't in the local media store, so it can't be uploaded. "
                "Re-collect the source that referenced it."
            )
        remote.put(storage_key, local.get(storage_key), mime_type)
        uploaded += 1
    return uploaded, missing


_remote_store: tuple[tuple, MediaStore] | None = None


def _remote_media_store() -> MediaStore | None:
    """The store published images must reach, or None when that's the local one. Built once per
    configuration, so a batch reuses one R2 client and its connections."""
    global _remote_store
    config = tuple(
        os.environ.get(name)
        for name in ("MEDIA_STORE", "STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY", "STORAGE_BUCKET")
    )
    if _remote_store is None or _remote_store[0] != config:
        _remote_store = (config, media_store_from_env())
    store = _remote_store[1]
    return None if isinstance(store, FilesystemMediaStore) else store


def _record_media(cur, question_id: str, media) -> None:
    """
    Records the question's images (already stored by the scraper — see core/media_store.py).
    Idempotent like the rest of publishing: re-publishing the same question adds only images it
    doesn't already have, matched on (storage key, placement, option), in one round trip.

    With MEDIA_STORE=r2, publish_question has already copied each image to R2 (before opening its
    transaction), so a published question never points at an image production can't show.
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


_OCCURRENCE_FACTS = ("section_label", "number_label", "marks", "negative_marks", "answer_status")


def _occurrence_facts(normalized: NormalizedQuestion) -> tuple:
    # Marks are stored as numeric(5,2): rounded the same way here, so GATE's 1/3 compares equal to
    # the stored 0.33 and an unchanged republish writes nothing.
    def two_places(value):
        return None if value is None else round(value, 2)

    return (
        normalized.section,
        normalized.number_label,
        two_places(normalized.marks),
        two_places(normalized.negative_marks),
        normalized.answer_status,
    )


def _fact_text(value) -> str:
    # How Postgres prints a fact as text: numeric(5,2) always with two decimals.
    return f"{value:.2f}" if isinstance(value, float) else str(value)


def _resolve_or_create_occurrence(
    cur,
    question_id: str,
    question_set_id: str,
    original_question_number: int | None,
    normalized: NormalizedQuestion,
) -> bool:
    """Whether a new occurrence was created. An existing one takes this publish's facts about the
    paper — section, number label, marks, answer status — since a revised key can change them
    (docs/specs/03-paper-structure-min.md); one whose facts are unchanged isn't written at all."""
    facts = _occurrence_facts(normalized)
    columns = ", ".join(_OCCURRENCE_FACTS)
    # Without a number (content identity), the occurrence takes the next one in its set so new
    # questions append. Concurrent publishes into the same set would otherwise read the same MAX
    # and tie, so appends to one set are serialized by a transaction-scoped advisory lock (held
    # only for the short remainder of this publish).
    if original_question_number is None:
        # A re-scraped question usually already has its occurrence — one read, an update only if
        # its facts changed, and it must not queue behind the lock (which is held to commit) and
        # serialize the whole batch.
        cur.execute(
            f"SELECT id, {', '.join(f'{c}::text' for c in _OCCURRENCE_FACTS)} "
            "FROM question_occurrences WHERE question_id = %s AND question_set_id = %s",
            (question_id, question_set_id),
        )
        row = cur.fetchone()
        if row:
            stored = tuple(row[1:])
            if stored != tuple(None if f is None else _fact_text(f) for f in facts):
                cur.execute(
                    f"UPDATE question_occurrences SET ({columns}) = ROW(%s, %s, %s, %s, %s), "
                    "updated_at = now() WHERE id = %s",
                    (*facts, row[0]),
                )
            return False
        cur.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", (f"occurrence-append:{question_set_id}",)
        )
    # One round trip: question_occurrences_unique (question_id, question_set_id) turns an existing
    # occurrence into an update of its facts (skipped when they're unchanged, so no row comes
    # back), and xmax = 0 tells a freshly inserted row from an updated one.
    cur.execute(
        "INSERT INTO question_occurrences "
        f"(question_id, question_set_id, original_question_number, {columns}) VALUES (%s, %s, "
        "COALESCE(%s, (SELECT COALESCE(MAX(original_question_number), 0) + 1 "
        "FROM question_occurrences WHERE question_set_id = %s)), %s, %s, %s, %s, %s) "
        "ON CONFLICT (question_id, question_set_id) DO UPDATE SET "
        + ", ".join(f"{c} = EXCLUDED.{c}" for c in _OCCURRENCE_FACTS)
        + ", updated_at = now() "
        f"WHERE (question_occurrences.{', question_occurrences.'.join(_OCCURRENCE_FACTS)}) "
        f"IS DISTINCT FROM (EXCLUDED.{', EXCLUDED.'.join(_OCCURRENCE_FACTS)}) "
        "RETURNING (xmax = 0)",
        (question_id, question_set_id, original_question_number, question_set_id, *facts),
    )
    row = cur.fetchone()
    return bool(row and row[0])
