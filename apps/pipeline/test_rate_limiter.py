"""
Tests for per-source rate limiting — docs/roadmap/engineering-roadmap.md item 16. No DATABASE_URL
needed: RateLimiter is pure in-memory timing logic.
"""
from prepora_pipeline.core.rate_limiter import RateLimiter


def test_first_request_for_a_source_never_waits():
    limiter = RateLimiter()
    assert limiter.wait_time("indiabix", requests_per_minute=10) == 0.0


def test_wait_time_reflects_the_configured_interval_after_a_request(monkeypatch):
    limiter = RateLimiter()
    clock = [1000.0]
    monkeypatch.setattr("time.monotonic", lambda: clock[0])
    monkeypatch.setattr("time.sleep", lambda _seconds: None)

    limiter.acquire("indiabix", requests_per_minute=30)  # interval = 2s

    clock[0] = 1000.5  # 0.5s later — still within the 2s interval
    assert limiter.wait_time("indiabix", requests_per_minute=30) == 1.5

    clock[0] = 1002.0  # a full 2s later — interval has fully elapsed
    assert limiter.wait_time("indiabix", requests_per_minute=30) == 0.0


def test_acquire_sleeps_for_exactly_the_remaining_wait(monkeypatch):
    limiter = RateLimiter()
    clock = [1000.0]
    sleep_calls = []
    monkeypatch.setattr("time.monotonic", lambda: clock[0])
    monkeypatch.setattr("time.sleep", sleep_calls.append)

    limiter.acquire("indiabix", requests_per_minute=30)  # first call: no wait
    clock[0] = 1000.5
    limiter.acquire("indiabix", requests_per_minute=30)  # second call: waits 1.5s

    assert sleep_calls == [1.5]


def test_a_requests_per_minute_of_zero_never_waits():
    limiter = RateLimiter()
    limiter.acquire("indiabix", requests_per_minute=0)
    assert limiter.wait_time("indiabix", requests_per_minute=0) == 0.0


def test_different_sources_are_rate_limited_independently(monkeypatch):
    limiter = RateLimiter()
    clock = [1000.0]
    monkeypatch.setattr("time.monotonic", lambda: clock[0])
    monkeypatch.setattr("time.sleep", lambda _seconds: None)

    limiter.acquire("indiabix", requests_per_minute=30)
    # A different source has never been seen — no wait, regardless of indiabix's state.
    assert limiter.wait_time("sanfoundry", requests_per_minute=30) == 0.0
