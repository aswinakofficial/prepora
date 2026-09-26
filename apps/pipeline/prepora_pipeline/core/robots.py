"""
robots.txt handling — docs/roadmap/engineering-roadmap.md item 16.

Fetched and cached per domain (not per URL — a domain's robots.txt covers every path on it).
Fail-safe on ambiguity: a domain with no robots.txt at all (a 404) means everything is allowed
(the standard convention); a robots.txt that can't be *fetched* for any other reason (timeout,
connection error, 5xx) means nothing is allowed until the cache expires and a fetch is retried —
this is the conservative direction to fail in, since silently treating "couldn't check" as
"allowed" is exactly the kind of gap item 16 exists to close.
"""
import time
from urllib import robotparser
from urllib.parse import urlparse

import requests

CACHE_TTL_SECONDS = 3600
FETCH_TIMEOUT_SECONDS = 10

# domain -> (parser or None, cached_at). A None parser means "known unfetchable" — disallow.
_cache: dict[str, tuple[robotparser.RobotFileParser | None, float]] = {}


def _robots_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/robots.txt"


def _get_parser(url: str) -> robotparser.RobotFileParser | None:
    domain = urlparse(url).netloc
    cached = _cache.get(domain)
    if cached is not None and (time.monotonic() - cached[1]) < CACHE_TTL_SECONDS:
        return cached[0]

    parser = robotparser.RobotFileParser()
    try:
        response = requests.get(_robots_url(url), timeout=FETCH_TIMEOUT_SECONDS)
    except requests.RequestException:
        _cache[domain] = (None, time.monotonic())
        return None

    if response.status_code == 404:
        parser.parse([])  # no robots.txt at all -> nothing is disallowed
    elif response.ok:
        parser.parse(response.text.splitlines())
    else:
        _cache[domain] = (None, time.monotonic())
        return None

    _cache[domain] = (parser, time.monotonic())
    return parser


def is_allowed(url: str, user_agent: str) -> bool:
    parser = _get_parser(url)
    if parser is None:
        return False
    return parser.can_fetch(user_agent, url)


def clear_cache() -> None:
    _cache.clear()
