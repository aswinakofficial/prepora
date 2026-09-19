"""
Tests for the durable job model — docs/roadmap/engineering-roadmap.md item 13.

Requires DATABASE_URL (see test_conformance.py's docstring for why these are skipped locally
without one and how CI provides one). Every test uses a distinctive source_id and cleans its own
rows up afterward.
"""
import os
import uuid

import pytest

from prepora_pipeline.core import (
    StageCounts,
    create_job,
    finalize_job,
    get_job,
    list_stages,
    stage_run,
)
from prepora_pipeline.core.db import get_db_connection
from prepora_pipeline.core.jobs import record_stage, start_job

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — the job model needs a database."
)


@pytest.fixture
def source_id():
    slug = f"test-jobs-{uuid.uuid4()}"
    yield slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # pipeline_job_stages cascades on job delete.
            cur.execute("DELETE FROM pipeline_jobs WHERE source_id = %s", (slug,))
            conn.commit()
    finally:
        conn.close()


class TestCreateJob:
    def test_creates_a_queued_job(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")
        job = get_job(job_id)
        assert job is not None
        assert job.status == "queued"
        assert job.source_id == source_id

    def test_stores_configuration_as_json(self, source_id):
        job_id = create_job(
            source_id=source_id,
            job_type="scrape",
            trigger_type="manual",
            configuration={"url": "https://example.com", "max_questions": 50},
        )
        job = get_job(job_id)
        assert job.configuration == {"url": "https://example.com", "max_questions": 50}


class TestIdempotency:
    def test_resubmitting_the_same_idempotency_key_does_not_double_run(self, source_id):
        key = f"idem-{uuid.uuid4()}"
        first_id = create_job(
            source_id=source_id, job_type="scrape", trigger_type="manual", idempotency_key=key
        )
        second_id = create_job(
            source_id=source_id, job_type="scrape", trigger_type="manual", idempotency_key=key
        )

        assert first_id == second_id

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM pipeline_jobs WHERE idempotency_key = %s", (key,)
                )
                assert cur.fetchone()[0] == 1
        finally:
            conn.close()

    def test_different_idempotency_keys_create_separate_jobs(self, source_id):
        first_id = create_job(
            source_id=source_id,
            job_type="scrape",
            trigger_type="manual",
            idempotency_key=f"a-{uuid.uuid4()}",
        )
        second_id = create_job(
            source_id=source_id,
            job_type="scrape",
            trigger_type="manual",
            idempotency_key=f"b-{uuid.uuid4()}",
        )
        assert first_id != second_id


class TestFinalizeJob:
    def test_all_stages_completed_finalizes_to_completed(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")
        record_stage(job_id, "fetch", "completed", counts=StageCounts(processed=1))
        record_stage(job_id, "extract", "completed", counts=StageCounts(processed=1))

        status = finalize_job(job_id)

        assert status == "completed"
        assert get_job(job_id).status == "completed"

    def test_a_failing_stage_marks_the_job_failed_when_nothing_else_succeeded(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")
        record_stage(job_id, "fetch", "failed", error_detail="connection refused")

        status = finalize_job(job_id)

        job = get_job(job_id)
        assert status == "failed"
        assert job.status == "failed"
        assert "connection refused" in job.error_summary

    def test_a_failing_stage_marks_the_job_partial_when_another_stage_succeeded(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")
        record_stage(job_id, "fetch", "completed", counts=StageCounts(processed=5))
        record_stage(job_id, "extract", "failed", error_detail="malformed HTML")

        status = finalize_job(job_id)

        job = get_job(job_id)
        assert status == "partial"
        assert job.status == "partial"
        assert "malformed HTML" in job.error_summary


class TestStageRun:
    def test_stage_run_records_completed_with_counts_on_success(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")

        with stage_run(job_id, "fetch") as counts:
            counts.processed = 3
            counts.duplicate = 1

        [stage] = list_stages(job_id)
        assert stage.status == "completed"
        assert stage.counts.processed == 3
        assert stage.counts.duplicate == 1
        assert stage.duration_ms is not None

    def test_stage_run_records_failed_and_reraises_on_exception(self, source_id):
        job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")

        with pytest.raises(ValueError, match="boom"):
            with stage_run(job_id, "fetch") as counts:
                counts.processed = 1
                raise ValueError("boom")

        [stage] = list_stages(job_id)
        assert stage.status == "failed"
        assert stage.counts.processed == 1  # counts made before the failure are still recorded
        assert "boom" in stage.error_detail


class TestFullRunIntegration:
    def test_a_full_run_produces_one_job_row_and_one_row_per_stage(self, source_id):
        job_id = create_job(
            source_id=source_id,
            job_type="scrape",
            trigger_type="manual",
            configuration={"url": "https://example.com/exam"},
        )
        start_job(job_id)

        with stage_run(job_id, "fetch") as counts:
            counts.processed = 1
        with stage_run(job_id, "extract") as counts:
            counts.discovered = 10
            counts.processed = 9
            counts.skipped = 1
        with stage_run(job_id, "normalize") as counts:
            counts.processed = 9

        status = finalize_job(job_id)

        job = get_job(job_id)
        assert job.status == status == "completed"
        assert job.started_at is not None
        assert job.completed_at is not None

        stages = list_stages(job_id)
        assert {s.stage for s in stages} == {"fetch", "extract", "normalize"}
        assert all(s.status == "completed" for s in stages)

        extract_stage = next(s for s in stages if s.stage == "extract")
        assert extract_stage.counts.discovered == 10
        assert extract_stage.counts.processed == 9
        assert extract_stage.counts.skipped == 1
