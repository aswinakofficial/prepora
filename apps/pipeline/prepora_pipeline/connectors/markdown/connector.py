"""
Markdown connector: discover (walk content/) and fetch (read a file) —
docs/roadmap/engineering-roadmap.md item 22.

Contributed/authored content enters through content/**/*.md instead of an HTTP fetch, so none of
prepora_pipeline.core.http_client's concerns — rate limiting, robots.txt, retries — apply here;
there is no network access at all. The content hash every fetch already goes through via the
artifact store (item 12) gives this source change detection (item 17) for free, with zero
Markdown-specific code: a file that hasn't changed hashes the same as last time regardless of
whether the bytes came from a socket or a local read.
"""
from pathlib import Path

SOURCE_SLUG = "markdown"


def discover(content_dir: str | Path) -> list[str]:
    """Every .md file under content_dir, as posix-style relative-or-absolute path strings
    (whatever content_dir itself was), sorted for a deterministic discovery order.

    Excludes README.md (case-insensitive) at any level — content/README.md documents the
    directory for humans, per its own instructions ("Place Prepora Markdown content files here"),
    it is not itself a Prepora Markdown file, and would otherwise show up as a permanent parse
    error on every real run.
    """
    root = Path(content_dir)
    if not root.exists():
        return []
    return sorted(
        str(p) for p in root.rglob("*.md") if p.is_file() and p.name.lower() != "readme.md"
    )


def fetch(path: str) -> bytes:
    return Path(path).read_bytes()
