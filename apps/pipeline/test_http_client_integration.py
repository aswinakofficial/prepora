"""
Integration test: a job with one failing page completes as 'partial' with the failure recorded —
docs/roadmap/engineering-roadmap.md item 16's own testing note, tying the http_client's
partial-failure behaviour to the item-13 job model. Requires DATABASE_URL (see
test_conformance.py's docstring) since pipeline_jobs/pipeline_job_stages need a real database.
"""
import os
import uuid

import pytest
import requests

from prepora_pipeline.core import create_job, finalize_job, get_job, http_client, robots, stage_run
from prepora_pipeline.core.db import get_db_connection

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL is not set — this integration test needs a database."
)


@pytest.fixture
def source_id():
    slug = f"test-http-client-integration-{uuid.uuid4()}"
    yield slug
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM pipeline_jobs WHERE source_id = %s", (slug,))
            conn.commit()
    finally:
        conn.close()


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


def test_one_failing_page_out_of_several_completes_the_job_as_partial(
    monkeypatch, source_id
):
    monkeypatch.setattr(http_client, "is_url_allowed", lambda url: True)
    monkeypatch.setattr(robots, "is_allowed", lambda url, ua: True)
    monkeypatch.setattr(http_client, "get_source", lambda name: None)
    monkeypatch.setattr(http_client._rate_limiter, "acquire", lambda *a, **kw: None)

    pages = [
        "https://example.com/page1",
        "https://example.com/page2",  # this one is permanently broken
        "https://example.com/page3",
    ]

    def _get(url, **_kwargs):
        if url == "https://example.com/page2":
            raise requests.ConnectionError("simulated permanent failure")
        return _FakeResponse(200)

    monkeypatch.setattr(requests, "get", _get)

    job_id = create_job(source_id=source_id, job_type="scrape", trigger_type="manual")

    with stage_run(job_id, "fetch") as counts:
        for url in pages:
            try:
                http_client.fetch(
                    url, source_slug=source_id, concurrency_per_domain=1, sleep_fn=lambda _s: None
                )
            except http_client.FetchError:
                counts.failed += 1
            else:
                counts.processed += 1
        # One bad page must not raise out of the stage entirely — the loop above already
        # recorded it in `counts`, so the stage itself still completes.

    status = finalize_job(job_id)
    job = get_job(job_id)

    # Two of three pages succeeded and one failed within a single stage — the stage itself still
    # "completed" (it ran to the end and reported its counts), but a real item failed, so the job
    # as a whole must be 'partial', not 'completed' (item 16's own testing note).
    assert status == "partial"
    assert job.status == "partial"
    assert job.error_summary and "1 item(s) failed" in job.error_summary

    from prepora_pipeline.core import list_stages

    [stage] = list_stages(job_id)
    assert stage.status == "completed"
    assert stage.counts.processed == 2
    assert stage.counts.failed == 1
