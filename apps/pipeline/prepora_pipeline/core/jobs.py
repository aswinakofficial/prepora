"""
The durable job model — docs/roadmap/engineering-roadmap.md item 13.

Every pipeline run is a database record with per-stage detail, replacing an in-memory `set()` for
idempotency and a local log file for progress (both file: no job state survives a restart, nothing
is visible across workers, and a deployed instance's admin console has no file to read at all).

The only writer of pipeline_jobs/pipeline_job_stages is this module — a stage should never write
these tables directly, so there is exactly one place that decides what a valid state transition
looks like.
"""
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from psycopg2.extras import Json

from .db import get_db_connection

JobStatus = str  # "queued" | "running" | "completed" | "partial" | "failed" | "cancelled"


@dataclass
class StageCounts:
    discovered: int = 0
    processed: int = 0
    failed: int = 0
    duplicate: int = 0
    skipped: int = 0


@dataclass
class JobRecord:
    id: str
    source_id: str
    job_type: str
    status: JobStatus
    trigger_type: str
    requested_by: str | None
    idempotency_key: str | None
    configuration: dict[str, Any] | None
    started_at: datetime | None
    completed_at: datetime | None
    error_summary: str | None


@dataclass
class StageRecord:
    id: str
    job_id: str
    stage: str
    status: JobStatus
    counts: StageCounts
    duration_ms: int | None
    error_detail: str | None


def create_job(
    *,
    source_id: str,
    job_type: str,
    trigger_type: str,
    requested_by: str | None = None,
    configuration: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> str:
    """
    Returns the job id. If `idempotency_key` is given and a job already exists with that key, its
    id is returned without creating a second job — this is the database-backed replacement for the
    old in-memory `seen_jobs` set, and it works across restarts and across any number of workers.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if idempotency_key is not None:
                cur.execute(
                    "SELECT id FROM pipeline_jobs WHERE idempotency_key = %s", (idempotency_key,)
                )
                existing = cur.fetchone()
                if existing:
                    return existing[0]

            cur.execute(
                "INSERT INTO pipeline_jobs "
                "(source_id, job_type, status, trigger_type, requested_by, idempotency_key, "
                "configuration) VALUES (%s, %s, 'queued', %s, %s, %s, %s) RETURNING id",
                (
                    source_id,
                    job_type,
                    trigger_type,
                    requested_by,
                    idempotency_key,
                    Json(configuration) if configuration is not None else None,
                ),
            )
            job_id = cur.fetchone()[0]
            conn.commit()
            return job_id
    finally:
        conn.close()


def start_job(job_id: str) -> None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE pipeline_jobs SET status = 'running', started_at = %s WHERE id = %s",
                (datetime.now(timezone.utc), job_id),
            )
            conn.commit()
    finally:
        conn.close()


def complete_job(job_id: str, status: JobStatus, *, error_summary: str | None = None) -> None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE pipeline_jobs SET status = %s, completed_at = %s, error_summary = %s "
                "WHERE id = %s",
                (status, datetime.now(timezone.utc), error_summary, job_id),
            )
            conn.commit()
    finally:
        conn.close()


def finalize_job(job_id: str) -> JobStatus:
    """
    Derives and applies the job's final status from its stages: 'completed' if every stage
    completed, 'failed' if none did, 'partial' if some did and some didn't — this is what makes
    "a failing stage marks the job partial or failed" true without every caller having to decide
    it themselves.
    """
    stages = list_stages(job_id)
    if not stages:
        status: JobStatus = "failed"
    else:
        completed = sum(1 for s in stages if s.status == "completed")
        if completed == len(stages):
            status = "completed"
        elif completed == 0:
            status = "failed"
        else:
            status = "partial"

    error_summary = None
    failed_stages = [s for s in stages if s.status == "failed" and s.error_detail]
    if failed_stages:
        error_summary = "; ".join(f"{s.stage}: {s.error_detail}" for s in failed_stages)

    complete_job(job_id, status, error_summary=error_summary)
    return status


def record_stage(
    job_id: str,
    stage: str,
    status: JobStatus,
    *,
    counts: StageCounts | None = None,
    duration_ms: int | None = None,
    error_detail: str | None = None,
) -> None:
    counts = counts or StageCounts()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO pipeline_job_stages "
                "(job_id, stage, status, discovered_count, processed_count, failed_count, "
                "duplicate_count, skipped_count, duration_ms, error_detail) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (job_id, stage) DO UPDATE SET "
                "status = EXCLUDED.status, discovered_count = EXCLUDED.discovered_count, "
                "processed_count = EXCLUDED.processed_count, "
                "failed_count = EXCLUDED.failed_count, "
                "duplicate_count = EXCLUDED.duplicate_count, "
                "skipped_count = EXCLUDED.skipped_count, "
                "duration_ms = EXCLUDED.duration_ms, error_detail = EXCLUDED.error_detail, "
                "updated_at = now()",
                (
                    job_id,
                    stage,
                    status,
                    counts.discovered,
                    counts.processed,
                    counts.failed,
                    counts.duplicate,
                    counts.skipped,
                    duration_ms,
                    error_detail,
                ),
            )
            conn.commit()
    finally:
        conn.close()


@contextmanager
def stage_run(job_id: str, stage: str) -> Iterator[StageCounts]:
    """
    Times a stage and records it on exit — 'completed' with the caller's counts on normal exit,
    'failed' with the exception message on an unhandled exception (which is re-raised; this
    records the failure, it doesn't swallow it).

    Usage:
        with stage_run(job_id, "fetch") as counts:
            counts.processed += 1
    """
    start = time.monotonic()
    counts = StageCounts()
    record_stage(job_id, stage, "running", counts=counts)
    try:
        yield counts
    except Exception as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        record_stage(
            job_id, stage, "failed", counts=counts, duration_ms=duration_ms, error_detail=str(e)
        )
        raise
    else:
        duration_ms = int((time.monotonic() - start) * 1000)
        record_stage(job_id, stage, "completed", counts=counts, duration_ms=duration_ms)


def get_job(job_id: str) -> JobRecord | None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, source_id, job_type, status, trigger_type, requested_by, "
                "idempotency_key, configuration, started_at, completed_at, error_summary "
                "FROM pipeline_jobs WHERE id = %s",
                (job_id,),
            )
            row = cur.fetchone()
            return _row_to_job(row) if row else None
    finally:
        conn.close()


def list_jobs(*, source_id: str | None = None, limit: int = 50) -> list[JobRecord]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if source_id is not None:
                cur.execute(
                    "SELECT id, source_id, job_type, status, trigger_type, requested_by, "
                    "idempotency_key, configuration, started_at, completed_at, error_summary "
                    "FROM pipeline_jobs WHERE source_id = %s ORDER BY created_at DESC LIMIT %s",
                    (source_id, limit),
                )
            else:
                cur.execute(
                    "SELECT id, source_id, job_type, status, trigger_type, requested_by, "
                    "idempotency_key, configuration, started_at, completed_at, error_summary "
                    "FROM pipeline_jobs ORDER BY created_at DESC LIMIT %s",
                    (limit,),
                )
            return [_row_to_job(row) for row in cur.fetchall()]
    finally:
        conn.close()


def list_stages(job_id: str) -> list[StageRecord]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, job_id, stage, status, discovered_count, processed_count, "
                "failed_count, duplicate_count, skipped_count, duration_ms, error_detail "
                "FROM pipeline_job_stages WHERE job_id = %s ORDER BY created_at",
                (job_id,),
            )
            return [_row_to_stage(row) for row in cur.fetchall()]
    finally:
        conn.close()


def _row_to_job(row) -> JobRecord:
    (
        id_,
        source_id,
        job_type,
        status,
        trigger_type,
        requested_by,
        idempotency_key,
        configuration,
        started_at,
        completed_at,
        error_summary,
    ) = row
    return JobRecord(
        id=id_,
        source_id=source_id,
        job_type=job_type,
        status=status,
        trigger_type=trigger_type,
        requested_by=requested_by,
        idempotency_key=idempotency_key,
        configuration=configuration,
        started_at=started_at,
        completed_at=completed_at,
        error_summary=error_summary,
    )


def _row_to_stage(row) -> StageRecord:
    (
        id_,
        job_id,
        stage,
        status,
        discovered,
        processed,
        failed,
        duplicate,
        skipped,
        duration_ms,
        error_detail,
    ) = row
    return StageRecord(
        id=id_,
        job_id=job_id,
        stage=stage,
        status=status,
        counts=StageCounts(
            discovered=discovered,
            processed=processed,
            failed=failed,
            duplicate=duplicate,
            skipped=skipped,
        ),
        duration_ms=duration_ms,
        error_detail=error_detail,
    )


