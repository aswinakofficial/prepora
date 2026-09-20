"""
Tests for the shared HTTP client — docs/roadmap/engineering-roadmap.md item 16. No DATABASE_URL
needed: get_source() is monkeypatched to avoid a real registry lookup, and requests.get is mocked
throughout — nothing here makes a real network call.
"""
import threading
import time

import pytest
import requests

from prepora_pipeline.core import http_client, robots


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    # These tests are about retry/backoff/robots/concurrency, not the registry allowlist or rate
    # limiter — isolate each so a failure here points at the right mechanism (the allowlist check
    # itself is covered separately, in test_a_non_allowlisted_host_is_not_fetched below).
    monkeypatch.setattr(http_client, "get_source", lambda name: None)
    monkeypatch.setattr(http_client, "is_url_allowed", lambda url: True)
    monkeypatch.setattr(robots, "is_allowed", lambda url, ua: True)
    monkeypatch.setattr(http_client._rate_limiter, "acquire", lambda *a, **kw: None)
    robots.clear_cache()
    yield


def test_a_non_allowlisted_host_is_not_fetched(monkeypatch):
    calls = []
    monkeypatch.setattr(http_client, "is_url_allowed", lambda url: False)
    monkeypatch.setattr(requests, "get", lambda *a, **kw: calls.append(1))

    with pytest.raises(http_client.NotAllowlistedError):
        http_client.fetch("https://not-in-the-registry.example.com/", source_slug="test-source")

    assert calls == []  # requests.get was never called


def test_a_disallowed_robots_path_is_not_fetched(monkeypatch):
    calls = []
    monkeypatch.setattr(robots, "is_allowed", lambda url, ua: False)
    monkeypatch.setattr(requests, "get", lambda *a, **kw: calls.append(1))

    with pytest.raises(http_client.RobotsDisallowedError):
        http_client.fetch("https://example.com/private", source_slug="test-source")

    assert calls == []  # requests.get was never called


def test_successful_fetch_returns_the_response_with_no_retries(monkeypatch):
    attempts = []
    monkeypatch.setattr(requests, "get", lambda *a, **kw: attempts.append(1) or _FakeResponse(200))

    response = http_client.fetch("https://example.com/ok", source_slug="test-source")

    assert response.status_code == 200
    assert len(attempts) == 1


def test_retries_a_retryable_status_and_then_succeeds(monkeypatch):
    responses = iter([_FakeResponse(503), _FakeResponse(200)])
    sleeps = []
    monkeypatch.setattr(requests, "get", lambda *a, **kw: next(responses))

    response = http_client.fetch(
        "https://example.com/flaky", source_slug="test-source", sleep_fn=sleeps.append
    )

    assert response.status_code == 200
    assert len(sleeps) == 1  # exactly one backoff, between the two attempts


def test_retries_stop_at_the_budget_and_raise(monkeypatch):
    attempts = []
    sleeps = []
    monkeypatch.setattr(
        requests, "get", lambda *a, **kw: attempts.append(1) or _FakeResponse(500)
    )

    with pytest.raises(http_client.FetchError):
        http_client.fetch(
            "https://example.com/broken", source_slug="test-source", sleep_fn=sleeps.append
        )

    assert len(attempts) == http_client.MAX_RETRIES + 1
    # a backoff between each attempt, none after the last
    assert len(sleeps) == http_client.MAX_RETRIES


def test_backoff_increases_and_is_capped(monkeypatch):
    sleeps = []
    monkeypatch.setattr(requests, "get", lambda *a, **kw: _FakeResponse(500))

    with pytest.raises(http_client.FetchError):
        http_client.fetch(
            "https://example.com/broken", source_slug="test-source", sleep_fn=sleeps.append
        )

    # Each backoff is jittered up to +25%, but strictly increasing base values (before the cap)
    # mean each sleep should be no smaller than the previous one's un-jittered floor.
    expected_floors = [
        min(http_client.MAX_BACKOFF_SECONDS, http_client.BASE_BACKOFF_SECONDS * (2**i))
        for i in range(len(sleeps))
    ]
    for actual, floor in zip(sleeps, expected_floors):
        assert actual >= floor
        assert actual <= floor * 1.25 + 1e-9


def test_a_non_retryable_status_is_not_retried(monkeypatch):
    attempts = []
    monkeypatch.setattr(
        requests, "get", lambda *a, **kw: attempts.append(1) or _FakeResponse(404)
    )

    response = http_client.fetch("https://example.com/missing", source_slug="test-source")

    assert response.status_code == 404
    assert len(attempts) == 1  # a 404 is a real answer, not a transient failure to retry


def test_connection_errors_are_retried_like_retryable_statuses(monkeypatch):
    attempts = []

    def _get(*_a, **_kw):
        attempts.append(1)
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(requests, "get", _get)

    with pytest.raises(http_client.FetchError):
        http_client.fetch(
            "https://example.com/down", source_slug="test-source", sleep_fn=lambda _s: None
        )

    assert len(attempts) == http_client.MAX_RETRIES + 1


def test_concurrency_cap_limits_simultaneous_requests_per_domain(monkeypatch):
    in_flight = []
    max_in_flight = []
    lock = threading.Lock()

    def _get(*_a, **_kw):
        with lock:
            in_flight.append(1)
            max_in_flight.append(len(in_flight))
        time.sleep(0.05)
        with lock:
            in_flight.pop()
        return _FakeResponse(200)

    monkeypatch.setattr(requests, "get", _get)

    threads = [
        threading.Thread(
            target=http_client.fetch,
            args=(f"https://concurrency-test.example.com/page{i}",),
            kwargs={"source_slug": "test-source", "concurrency_per_domain": 2},
        )
        for i in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert max(max_in_flight) <= 2
