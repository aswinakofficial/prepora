"""
RawArtifact — the immutable, content-addressed record of a single fetch, before any parsing.

See docs/architecture/prepora-next-level-plan.md §17 ("Raw artifacts are immutable and
content-addressed") and docs/roadmap/engineering-roadmap.md item 12 (the artifact store that will
actually persist these). This contract only defines the shape; storing and retrieving artifacts by
sha256 is item 12's job, not this one's.
"""
from datetime import datetime

from pydantic import BaseModel, Field

from .versions import CONTRACT_VERSION


class RawArtifact(BaseModel):
    sha256: str = Field(
        min_length=64,
        max_length=64,
        description="SHA-256 hex digest of the raw content — its content address and identity.",
    )
    source_slug: str = Field(
        min_length=1, description="Which connector produced this fetch, e.g. 'ms-learn'."
    )
    source_url: str = Field(min_length=1)
    fetched_at: datetime
    content_type: str = Field(min_length=1, description="e.g. 'text/html', 'application/json'.")
    storage_key: str = Field(
        min_length=1,
        description="Where the raw bytes live — a filesystem path today, an object-store key "
        "once item 12 adds one.",
    )
    http_status: int | None = None
    etag: str | None = Field(
        default=None,
        description="Conditional-request validator (item 17) — sent back as If-None-Match on the "
        "next fetch of this URL so an unchanged page can skip re-downloading entirely.",
    )
    last_modified: str | None = Field(
        default=None,
        description="Conditional-request validator (item 17) — sent back as If-Modified-Since, "
        "stored verbatim as the source returned it rather than parsed into a datetime.",
    )

    contract_version: str = CONTRACT_VERSION
