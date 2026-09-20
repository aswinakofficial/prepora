"""
IndiaBix connector: discover (pagination) and fetch — docs/roadmap/engineering-roadmap.md item 15.

discover() is wired up here and covered by a fixture test (test_parser.py), unlike
apps/scraper/handlers/indiabix.py's discover_next_links(), which has existed since that handler was
written but has never been called by anything (finding #9 in
docs/architecture/prepora-next-level-plan.md).

fetch() goes through prepora_pipeline.core.http_client (item 16) — rate limited from this source's
registry entry, retried with backoff, and checked against robots.txt — rather than a bare
`requests.get()`. It exists so this connector is genuinely complete and independently testable, not
so it's already the live trigger path: apps/scraper/main.py's /scrape endpoint (with its SSRF
hardening in apps/scraper/security.py) remains the actual production entry point until every
handler has migrated and that cutover happens as its own step — see docs/connectors/README.md.
"""
from bs4 import BeautifulSoup

from prepora_pipeline.core import http_client

SOURCE_SLUG = "indiabix"


def discover(html: str, current_url: str) -> list[str]:
    """
    Returns the "Next" pagination link(s) on a results page. IndiaBix renders its pager as a list
    of <a class="page-item"> entries; the one whose visible text is exactly "Next" is what this
    looks for, rather than every internal link (which is what the un-called original
    discover_next_links() did — see this connector's README for why that distinction matters).
    """
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    ordered: list[str] = []
    for a in soup.find_all("a", href=True):
        if a.get_text(strip=True).lower() == "next" and a["href"] not in seen:
            seen.add(a["href"])
            ordered.append(a["href"])
    return ordered


def fetch(url: str) -> bytes:
    response = http_client.fetch(url, source_slug=SOURCE_SLUG)
    response.raise_for_status()
    return response.content
