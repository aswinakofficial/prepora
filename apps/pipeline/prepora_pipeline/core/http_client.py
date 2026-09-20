"""
The one HTTP client every connector's fetch() should use — docs/roadmap/engineering-roadmap.md
item 16. Carries per-source rate limiting (from the registry, item 14), bounded exponential
backoff with jitter, a retry budget, connect/read timeouts, a concurrency cap per domain, an honest
identifying user-agent, and robots.txt enforcement.

**Do not add anti-bot evasion here** — rotating user-agents, headless-browser fingerprint spoofing,
CAPTCHA solving, etc. A source that needs evasion to fetch is a source to disable in the registry
(item 14), not a reason to make this client sneakier. See
docs/architecture/prepora-next-level-plan.md §20, R5.
"""
import random
import threading
import time
from urllib.parse import urlparse

import requests

from . import robots
from .rate_limiter import RateLimiter
from .registry import get_source, is_url_allowed

# Identifies the crawler honestly, with a way to reach the operator — the opposite of the three
# hardcoded, unidentifying Chrome user-agent strings this replaces
# (docs/architecture/prepora-next-level-plan.md §7).
USER_AGENT = "PreporaBot/1.0 (+https://github.com/prepora/prepora; contact: admin@prepora.app)"

CONNECT_TIMEOUT_SECONDS = 5
READ_TIMEOUT_SECONDS = 15
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0
DEFAULT_REQUESTS_PER_MINUTE = 30.0
DEFAULT_CONCURRENCY_PER_DOMAIN = 2

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

_rate_limiter = RateLimiter()
_domain_semaphores: dict[str, threading.Semaphore] = {}
_domain_semaphores_lock = threading.Lock()


class RobotsDisallowedError(Exception):
    pass


class NotAllowlistedError(Exception):
    pass


class FetchError(Exception):
    pass


def _domain_semaphore(domain: str, limit: int) -> threading.Semaphore:
    with _domain_semaphores_lock:
        sem = _domain_semaphores.get(domain)
        if sem is None:
            sem = threading.Semaphore(limit)
            _domain_semaphores[domain] = sem
        return sem


def _requests_per_minute_for(source_slug: str) -> float:
    source = get_source(source_slug)
    if source and source.rate_limit:
        return source.rate_limit.get("requests_per_minute", DEFAULT_REQUESTS_PER_MINUTE)
    return DEFAULT_REQUESTS_PER_MINUTE


def fetch(
    url: str,
    *,
    source_slug: str,
    headers: dict[str, str] | None = None,
    concurrency_per_domain: int = DEFAULT_CONCURRENCY_PER_DOMAIN,
    sleep_fn=time.sleep,
) -> requests.Response:
    """
    Fetches `url` on behalf of `source_slug`, honouring that source's registry rate limit,
    robots.txt, and this client's shared retry/backoff/timeout/concurrency policy. Raises
    NotAllowlistedError if the host isn't an enabled registry source (item 14 — this is the
    security boundary, checked here so every connector gets it for free rather than
    reimplementing it), RobotsDisallowedError if robots.txt disallows the path, or FetchError if
    every retry attempt failed.
    """
    if not is_url_allowed(url):
        raise NotAllowlistedError(f"{url!r} is not on an enabled source's allowlist.")
    if not robots.is_allowed(url, USER_AGENT):
        raise RobotsDisallowedError(f"robots.txt disallows fetching {url} for {USER_AGENT!r}")

    requests_per_minute = _requests_per_minute_for(source_slug)
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    domain = urlparse(url).netloc
    semaphore = _domain_semaphore(domain, concurrency_per_domain)

    last_exception: Exception | None = None
    with semaphore:
        for attempt in range(MAX_RETRIES + 1):
            _rate_limiter.acquire(source_slug, requests_per_minute)
            try:
                response = requests.get(
                    url,
                    headers=request_headers,
                    timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
                )
            except requests.RequestException as e:
                last_exception = e
            else:
                if response.status_code not in _RETRYABLE_STATUS_CODES:
                    return response
                last_exception = FetchError(
                    f"{url} returned retryable status {response.status_code}"
                )

            if attempt < MAX_RETRIES:
                backoff = min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * (2**attempt))
                jitter = random.uniform(0, backoff * 0.25)
                sleep_fn(backoff + jitter)

    raise FetchError(
        f"Failed to fetch {url} after {MAX_RETRIES + 1} attempt(s): {last_exception}"
    ) from last_exception
