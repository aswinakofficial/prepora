"""
Tests for robots.txt handling — docs/roadmap/engineering-roadmap.md item 16. No DATABASE_URL
needed: fetches are mocked, never real network calls.
"""
import requests

from prepora_pipeline.core import robots

UA = "PreporaBot/1.0 (+https://example.com; contact: test@example.com)"


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "", ok: bool | None = None):
        self.status_code = status_code
        self.text = text
        self.ok = ok if ok is not None else status_code < 400


def setup_function():
    robots.clear_cache()


def test_a_disallowed_path_is_not_fetched(monkeypatch):
    body = "User-agent: *\nDisallow: /private/\n"
    monkeypatch.setattr(requests, "get", lambda *a, **kw: _FakeResponse(200, body))

    assert robots.is_allowed("https://example.com/private/secret", UA) is False
    assert robots.is_allowed("https://example.com/public/page", UA) is True


def test_no_robots_txt_at_all_allows_everything(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *a, **kw: _FakeResponse(404))
    assert robots.is_allowed("https://example.com/anything", UA) is True


def test_unfetchable_robots_txt_fails_safe_to_disallow(monkeypatch):
    def _raise(*_a, **_kw):
        raise requests.RequestException("connection refused")

    monkeypatch.setattr(requests, "get", _raise)
    assert robots.is_allowed("https://example.com/anything", UA) is False


def test_server_error_fetching_robots_txt_fails_safe_to_disallow(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *a, **kw: _FakeResponse(503))
    assert robots.is_allowed("https://example.com/anything", UA) is False


def test_robots_txt_is_cached_per_domain(monkeypatch):
    calls = []

    def _get(url, **kwargs):
        calls.append(url)
        return _FakeResponse(200, "User-agent: *\nDisallow:\n")

    monkeypatch.setattr(requests, "get", _get)

    robots.is_allowed("https://example.com/a", UA)
    robots.is_allowed("https://example.com/b", UA)

    assert len(calls) == 1  # second call reused the cached parser for the same domain
