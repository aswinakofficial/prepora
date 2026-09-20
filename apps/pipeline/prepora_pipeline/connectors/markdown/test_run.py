"""
Integration test for the Markdown connector's full pipeline run —
docs/roadmap/engineering-roadmap.md item 22: "a Markdown file placed in content/ is discovered,
validated and published by a normal pipeline run."

Requires DATABASE_URL (see test_conformance.py's docstring). Places a real, temporary file under
the real content/ directory (not a fixture copy) so discover() is exercised exactly as it runs in
production, then removes it and every DB row it created.
"""
import os
import uuid
from pathlib import Path

import pytest

from prepora_pipeline.core import FilesystemArtifactStore
from prepora_pipeline.core.db import get_db_connection

from .run import run

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — a full pipeline run needs a database."
)

CONTENT_DIR = Path(__file__).resolve().parents[5] / "content"


@pytest.fixture
def test_exam():
    unique = uuid.uuid4().hex[:10]
    org_slug = f"test-org-{unique}"
    exam_type_slug = f"test-type-{unique}"
    exam_slug = f"test-exam-{unique}"

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO organizations (name, slug) VALUES (%s, %s) RETURNING id",
                (f"Test Org {unique}", org_slug),
            )
            org_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO exam_types (slug, label) VALUES (%s, %s) RETURNING id",
                (exam_type_slug, f"Test Type {unique}"),
            )
            type_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO exams (name, slug, organization_id, exam_type_id) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (f"Test Exam {unique}", exam_slug, org_id, type_id),
            )
            exam_id = cur.fetchone()[0]
            conn.commit()
    finally:
        conn.close()

    yield exam_slug

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM questions WHERE stable_content_id LIKE %s",
                (f"{exam_slug.upper()}-%",),
            )
            cur.execute(
                "DELETE FROM question_sets WHERE exam_variant_id IN "
                "(SELECT id FROM exam_variants WHERE exam_id = %s)",
                (exam_id,),
            )
            cur.execute("DELETE FROM exam_variants WHERE exam_id = %s", (exam_id,))
            cur.execute("DELETE FROM exams WHERE id = %s", (exam_id,))
            cur.execute("DELETE FROM exam_types WHERE id = %s", (type_id,))
            cur.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
            cur.execute("DELETE FROM pipeline_jobs WHERE source_id = 'markdown'")
            cur.execute("DELETE FROM raw_artifacts WHERE source_slug = 'markdown'")
            conn.commit()
    finally:
        conn.close()


@pytest.fixture
def test_subject():
    unique = uuid.uuid4().hex[:10]
    subject_slug = f"test-subject-{unique}"
    yield subject_slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM question_sets WHERE subject_id IN "
                "(SELECT id FROM subjects WHERE slug = %s)",
                (subject_slug,),
            )
            cur.execute(
                "DELETE FROM questions WHERE topic_id IN "
                "(SELECT id FROM topics WHERE subject_id IN "
                "(SELECT id FROM subjects WHERE slug = %s))",
                (subject_slug,),
            )
            cur.execute(
                "DELETE FROM topics WHERE subject_id IN (SELECT id FROM subjects WHERE slug = %s)",
                (subject_slug,),
            )
            cur.execute("DELETE FROM subjects WHERE slug = %s", (subject_slug,))
            conn.commit()
    finally:
        conn.close()


class TestFullPipelineRun:
    def test_a_markdown_file_placed_in_content_is_discovered_validated_and_published(
        self, test_exam, test_subject, tmp_path
    ):
        marker = uuid.uuid4().hex[:8]
        content_path = CONTENT_DIR / "question-sets" / f"test-item22-{marker}.md"
        content_path.parent.mkdir(parents=True, exist_ok=True)
        content_path.write_text(
            "---\n"
            f"id: TEST-{marker}\n"
            f"exam: {test_exam}\n"
            "exam_variant: standard\n"
            "year: 2025\n"
            f"subject: {test_subject}\n"
            "title: Item 22 integration test\n"
            "---\n"
            "\n"
            "# Question 1\n"
            "\n"
            f"Item 22 integration test question {marker}?\n"
            "\n"
            "- A. wrong\n"
            "- B. right\n"
            "\n"
            "**Answer:** B\n"
            "\n"
            "**Explanation:**\n"
            "\n"
            "Because it is.\n",
            encoding="utf-8",
        )

        try:
            store = FilesystemArtifactStore(root_dir=tmp_path)
            results = run(content_dir=str(CONTENT_DIR), store=store)

            published = [
                r for r in results if r.path == str(content_path) and r.status == "published"
            ]
            assert len(published) == 1, results

            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT count(*) FROM questions WHERE question_text = %s",
                        (f"Item 22 integration test question {marker}?",),
                    )
                    assert cur.fetchone()[0] == 1
            finally:
                conn.close()

            # Re-running immediately is a no-op — the content hash the artifact store computed on
            # the first run classifies this exact file as "unchanged" the second time.
            second_run = run(content_dir=str(CONTENT_DIR), store=store)
            second_result = next(r for r in second_run if r.path == str(content_path))
            assert second_result.status == "unchanged"
        finally:
            content_path.unlink(missing_ok=True)
