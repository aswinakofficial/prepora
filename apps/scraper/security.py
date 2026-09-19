"""
Security helpers for the scraper service: request authentication and
outbound-URL SSRF protection.

See docs/architecture/prepora-next-level-plan.md findings #4-#5 and
docs/roadmap/engineering-roadmap.md item 3 for why these exist. The host
allowlist here is an interim, environment-configured list — roadmap
item 13 replaces it with a database-backed source registry, at which
point `_allowed_hosts()` becomes a registry lookup instead of an env var
split. Keep both concerns behind these two functions so that swap is
localized.
"""
import ipaddress
import os
import socket
from typing import List, Optional
from urllib.parse import urljoin, urlparse

from fastapi import Header, HTTPException

SERVICE_TOKEN_ENV = "PIPELINE_SERVICE_TOKEN"
ALLOWED_HOSTS_ENV = "SCRAPER_ALLOWED_HOSTS"

# Bounded, and every hop is re-validated — this is not "trust the redirect
# chain", it is "never fetch anywhere assert_safe_url wouldn't allow".
MAX_REDIRECTS = 3


async def require_service_token(authorization: Optional[str] = Header(None)) -> None:
    """
    FastAPI dependency: every endpoint on this service requires a bearer
    token matching PIPELINE_SERVICE_TOKEN.

    There is no "auth optional" mode. If the token isn't configured, the
    service refuses every request rather than silently accepting
    everything — fail closed, not fail open.
    """
    token = os.getenv(SERVICE_TOKEN_ENV)
    if not token:
        raise HTTPException(
            status_code=503,
            detail=(
                f"{SERVICE_TOKEN_ENV} is not configured on the scraper service. "
                "Set it in apps/scraper's environment (see .env.example) before "
                "this service will accept any request."
            ),
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")

    presented = authorization[len("Bearer "):]
    if presented != token:
        raise HTTPException(status_code=401, detail="Invalid service token.")


def cors_allowed_origins() -> List[str]:
    raw = os.getenv("SCRAPER_CORS_ORIGINS", "http://localhost:3000")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _allowed_hosts() -> List[str]:
    raw = os.getenv(ALLOWED_HOSTS_ENV, "")
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def _host_is_allowlisted(hostname: str) -> bool:
    hostname = hostname.lower()
    allowed = _allowed_hosts()
    if not allowed:
        return False
    for entry in allowed:
        if hostname == entry or hostname.endswith("." + entry):
            return True
    return False


def _ip_is_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparsable address → treat as unsafe
    return (
        ip.is_private       # RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
        or ip.is_loopback   # 127.0.0.0/8, ::1
        or ip.is_link_local  # 169.254.0.0/16 — includes cloud metadata (169.254.169.254)
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_safe_url(url: str) -> None:
    """
    Raise HTTPException(400) unless `url` is safe to fetch server-side:
    http(s) scheme only, host on the configured allowlist, and every
    address the host resolves to outside loopback/private/link-local/
    reserved ranges. That last check is what stops a request for
    http://169.254.169.254/ or http://10.0.0.1/ from reaching cloud
    metadata or an internal service that happens to share a network
    with this process.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed URL.")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail=f"URL scheme '{parsed.scheme}' is not allowed; only http/https.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="URL has no hostname.")

    if not _host_is_allowlisted(hostname):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Host '{hostname}' is not on the scraper's allowlist. "
                f"Add it to {ALLOWED_HOSTS_ENV} before scraping this source."
            ),
        )

    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise HTTPException(status_code=400, detail=f"Could not resolve host '{hostname}': {e}")

    for _family, _type, _proto, _canonname, sockaddr in addrinfo:
        ip_str = sockaddr[0]
        if _ip_is_blocked(ip_str):
            raise HTTPException(
                status_code=400,
                detail=f"Host '{hostname}' resolves to a disallowed address ({ip_str}).",
            )


def safe_get(url: str, **kwargs):
    """
    A drop-in replacement for requests.get() that validates the URL
    before every hop. Automatic redirect-following is disabled
    (requests would otherwise happily follow a redirect straight past
    assert_safe_url); each Location header is resolved and re-validated
    by hand, up to MAX_REDIRECTS times.
    """
    import requests

    assert_safe_url(url)
    kwargs["allow_redirects"] = False
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        response = requests.get(current, **kwargs)
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            if not location:
                return response
            next_url = urljoin(current, location)
            assert_safe_url(next_url)
            current = next_url
            continue
        return response

    raise HTTPException(
        status_code=400,
        detail=f"Too many redirects (> {MAX_REDIRECTS}) while fetching {url}.",
    )
