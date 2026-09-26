"""
Per-source rate limiting — docs/roadmap/engineering-roadmap.md item 16. Enforces the
`requests_per_minute` each source declares in its source.yaml (item 14), so a fast connector
doesn't hammer a slow, low-traffic site just because nothing stops it.

A simple last-request-timestamp gate rather than a token bucket: the pipeline is single-worker and
sequential per source today (docs/architecture/prepora-next-level-plan.md §17's "Local only for
now"), so there is no burst capacity to model — the only question that matters is "how long since
this source's last request."
"""
import threading
import time


class RateLimiter:
    def __init__(self):
        self._last_request_at: dict[str, float] = {}
        self._lock = threading.Lock()

    def wait_time(self, source_slug: str, requests_per_minute: float) -> float:
        """Seconds the caller should wait before its next request to this source, given the
        configured rate. 0 if a request right now wouldn't exceed it."""
        if requests_per_minute <= 0:
            return 0.0
        interval = 60.0 / requests_per_minute
        with self._lock:
            last = self._last_request_at.get(source_slug)
        if last is None:
            return 0.0
        elapsed = time.monotonic() - last
        return max(0.0, interval - elapsed)

    def acquire(self, source_slug: str, requests_per_minute: float) -> None:
        """Blocks until a request to this source is allowed, then records that one is happening
        now. Call this immediately before making the request, not after."""
        wait = self.wait_time(source_slug, requests_per_minute)
        if wait > 0:
            time.sleep(wait)
        with self._lock:
            self._last_request_at[source_slug] = time.monotonic()
