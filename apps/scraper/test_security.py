"""
Tests for the SSRF and auth guards in security.py — see
docs/architecture/prepora-next-level-plan.md findings #4-#5 and
docs/roadmap/engineering-roadmap.md items 3 and 9.

DNS-dependent cases use "localhost" (resolved via loopback, no network
call) rather than a real external hostname, so these stay fast and
deterministic in CI with no live network access.
"""
import asyncio

import pytest
from fastapi import HTTPException

from security import (
    _host_is_allowlisted,
    _ip_is_blocked,
    assert_safe_url,
    require_service_token,
)


class TestIpIsBlocked:
    def test_blocks_loopback(self):
        assert _ip_is_blocked("127.0.0.1") is True

    def test_blocks_private_rfc1918(self):
        assert _ip_is_blocked("10.0.0.1") is True
        assert _ip_is_blocked("192.168.1.1") is True

    def test_blocks_link_local_cloud_metadata(self):
        assert _ip_is_blocked("169.254.169.254") is True

    def test_allows_public_address(self):
        assert _ip_is_blocked("8.8.8.8") is False

    def test_blocks_unparsable_address(self):
        assert _ip_is_blocked("not-an-ip") is True


class TestHostIsAllowlisted:
    def test_exact_match(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        assert _host_is_allowlisted("example.com") is True

    def test_subdomain_match(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        assert _host_is_allowlisted("learn.example.com") is True

    def test_rejects_unrelated_host(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        assert _host_is_allowlisted("evil.com") is False

    def test_rejects_suffix_lookalike(self, monkeypatch):
        # "notexample.com" must not match an allowlisted "example.com".
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        assert _host_is_allowlisted("notexample.com") is False

    def test_empty_allowlist_allows_nothing(self, monkeypatch):
        monkeypatch.delenv("SCRAPER_ALLOWED_HOSTS", raising=False)
        assert _host_is_allowlisted("example.com") is False


class TestAssertSafeUrl:
    def test_rejects_non_http_scheme(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        with pytest.raises(HTTPException) as exc:
            assert_safe_url("file:///etc/passwd")
        assert exc.value.status_code == 400

    def test_rejects_host_not_on_allowlist(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        with pytest.raises(HTTPException) as exc:
            assert_safe_url("https://evil.com/steal")
        assert exc.value.status_code == 400

    def test_rejects_allowlisted_host_resolving_to_loopback(self, monkeypatch):
        # localhost resolves via the system's loopback entry, not a network call.
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "localhost")
        with pytest.raises(HTTPException) as exc:
            assert_safe_url("http://localhost/admin")
        assert exc.value.status_code == 400

    def test_rejects_malformed_url(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_ALLOWED_HOSTS", "example.com")
        with pytest.raises(HTTPException) as exc:
            assert_safe_url("http://")
        assert exc.value.status_code == 400


class TestRequireServiceToken:
    def test_fails_closed_when_token_not_configured(self, monkeypatch):
        monkeypatch.delenv("PIPELINE_SERVICE_TOKEN", raising=False)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_service_token(authorization="Bearer whatever"))
        assert exc.value.status_code == 503

    def test_rejects_missing_authorization_header(self, monkeypatch):
        monkeypatch.setenv("PIPELINE_SERVICE_TOKEN", "secret-token")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_service_token(authorization=None))
        assert exc.value.status_code == 401

    def test_rejects_malformed_authorization_header(self, monkeypatch):
        monkeypatch.setenv("PIPELINE_SERVICE_TOKEN", "secret-token")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_service_token(authorization="secret-token"))
        assert exc.value.status_code == 401

    def test_rejects_wrong_token(self, monkeypatch):
        monkeypatch.setenv("PIPELINE_SERVICE_TOKEN", "secret-token")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_service_token(authorization="Bearer wrong-token"))
        assert exc.value.status_code == 401

    def test_accepts_correct_token(self, monkeypatch):
        monkeypatch.setenv("PIPELINE_SERVICE_TOKEN", "secret-token")
        asyncio.run(require_service_token(authorization="Bearer secret-token"))
