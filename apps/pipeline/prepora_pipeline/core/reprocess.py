"""
Reprocessing — replaying stored artifacts through a parser with zero network access.

This is what a fixed parser validates against: docs/roadmap/engineering-roadmap.md item 12's whole
point is that a parser improvement no longer costs a full re-scrape. `reprocess_source()` reads
artifact bytes straight from the ArtifactStore; it never makes an HTTP request.

There is deliberately no source-specific parser wired in here — no connector exists yet in
apps/pipeline (that is later roadmap work: the connectors/ directory in
docs/architecture/prepora-next-level-plan.md §17). Callers pass whatever parser callable they want
applied; `prepora_pipeline/cli.py`'s `reprocess` command uses a passthrough placeholder until a real
connector parser exists to wire in instead.
"""
from collections.abc import Callable, Iterator
from datetime import datetime
from typing import TypeVar

from prepora_pipeline.contracts import RawArtifact

from .artifact_store import ArtifactStore

T = TypeVar("T")


def reprocess_source(
    store: ArtifactStore,
    parser: Callable[[bytes, RawArtifact], T],
    *,
    source_slug: str,
    since: datetime | None = None,
) -> Iterator[tuple[RawArtifact, T]]:
    """
    Yield (artifact, parser_output) for every artifact matching `source_slug` (and `since`, if
    given), reading each one's content from `store` — no network call is made.
    """
    for artifact in store.iter_artifacts(source_slug=source_slug, since=since):
        content = store.get(artifact.sha256)
        yield artifact, parser(content, artifact)
