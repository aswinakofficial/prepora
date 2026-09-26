"""
Schema-conformance test — CanonicalQuestion maps cleanly onto the Drizzle schema.

This is the R1 mitigation from docs/architecture/prepora-next-level-plan.md §20: "Python writes are
governed by Pydantic contracts that are not mechanically derived from the schema, so the two can
drift silently... a schema-conformance test runs the Python contracts against a migrated test
database in CI." Field names below are checked against a live, migrated Postgres database rather
than a hand-copied list of column names, so a real schema drift (a renamed or dropped column) fails
this test instead of silently breaking the publish stage the first time it runs.

Requires DATABASE_URL to point at a database that already has the Drizzle migrations in
drizzle/ applied (CI runs these against a fresh postgres service container — see
.github/workflows/ci.yml). Skipped locally if DATABASE_URL isn't set, since not every contributor
working on the contracts needs a database running.
"""
import os

import psycopg2
import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL is not set — schema-conformance needs a migrated database. See CI for how "
    "this runs automatically against a fresh postgres service.",
)


def get_columns(table_name: str) -> set[str]:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = %s",
                (table_name,),
            )
            return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()


# CanonicalQuestion field -> questions column. Every one of these must exist verbatim.
QUESTIONS_FIELD_MAP = {
    "stable_content_id": "stable_content_id",
    "slug": "slug",
    "question_text": "question_text",
    "question_type": "question_type",
    "explanation": "explanation",
    "source_label": "source_label",
    "difficulty": "difficulty",
    "difficulty_source": "difficulty_source",
}

# CanonicalOption field -> question_options column.
OPTIONS_FIELD_MAP = {
    "key": "option_key",
    "text": "option_text",
    "sequence": "sequence",
}

# CanonicalAnswer field -> question_answers column. correct_option_key is deliberately excluded:
# it resolves to correct_option_id only after this question's options are inserted and their real
# ids are known — see CanonicalAnswer's docstring.
ANSWERS_FIELD_MAP = {
    "text_answer": "text_answer",
    "numerical_answer": "numerical_answer",
    "is_correct": "is_correct",
}


def test_questions_table_has_every_expected_column():
    columns = get_columns("questions")
    missing = [db_col for db_col in QUESTIONS_FIELD_MAP.values() if db_col not in columns]
    assert not missing, f"questions is missing columns expected by CanonicalQuestion: {missing}"


def test_question_options_table_has_every_expected_column():
    columns = get_columns("question_options")
    missing = [db_col for db_col in OPTIONS_FIELD_MAP.values() if db_col not in columns]
    assert not missing, f"question_options is missing columns for CanonicalOption: {missing}"


def test_question_answers_table_has_every_expected_column():
    columns = get_columns("question_answers")
    missing = [db_col for db_col in ANSWERS_FIELD_MAP.values() if db_col not in columns]
    assert not missing, f"question_answers is missing columns for CanonicalAnswer: {missing}"


def test_correct_option_id_column_exists_for_publish_time_resolution():
    # Not part of CanonicalAnswer (see ANSWERS_FIELD_MAP's docstring), but the publish stage needs
    # this column to exist to resolve correct_option_key into once options are inserted.
    columns = get_columns("question_answers")
    assert "correct_option_id" in columns
