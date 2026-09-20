"""
IndiaBix connector: discover (pagination) and fetch — docs/roadmap/engineering-roadmap.md item 15.

discover() is wired up here and covered by a fixture test (test_parser.py), unlike
apps/scraper/handlers/indiabix.py's discover_next_links(), which has existed since that handler was
written but has never been called by anything (finding #9 in
docs/architecture/prepora-next-level-plan.md).

fetch() is a minimal, direct HTTP GET behind the same registry allowlist item 14 built — it exists
so this connector is genuinely complete and independently testable, not so it's already the live
trigger path. apps/scraper/main.py's /scrape endpoint (with its SSRF hardening in
apps/scraper/security.py) remains the actual production entry point until every handler has
migrated and that cutover happens as its own step — see docs/connectors/README.md.
"""
import requests
from bs4 import BeautifulSoup

from prepora_pipeline.core import get_allowed_base_urls

SOURCE_SLUG = "indiabix"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


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
    hostname = requests.utils.urlparse(url).hostname
    if hostname not in get_allowed_base_urls():
        raise ValueError(f"{hostname!r} is not an enabled source in the registry.")
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
    response.raise_for_status()
    return response.content
