"""
The raw artifact store — docs/roadmap/engineering-roadmap.md item 12, the highest-value item in the
roadmap: every fetch is stored in full and immutably, so a parser fix can replay stored artifacts
instead of re-crawling (which, for the authenticated Microsoft Learn flow, means re-driving a whole
browser session).

Defined as an interface (ArtifactStore) with a filesystem implementation (FilesystemArtifactStore)
so an object-store implementation (S3/R2) is a second implementation later, not a refactor — see
docs/architecture/prepora-next-level-plan.md §16, guarantee 3.

Content-addressed by SHA-256: identical content stores once, regardless of how many times it's
fetched or from how many source URLs. A changed page is a new artifact, never an update to an
existing row — artifacts are immutable once written.
"""
import hashlib
from abc import ABC, abstractmethod
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

from prepora_pipeline.contracts import RawArtifact

from .db import get_db_connection

DEFAULT_ROOT = Path(".data/raw")


class ArtifactNotFoundError(Exception):
    pass


class ArtifactStore(ABC):
    @abstractmethod
    def store(
        self,
        content: bytes,
        *,
        source_slug: str,
        source_url: str,
        content_type: str,
        http_status: int | None = None,
        fetched_at: datetime | None = None,
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> RawArtifact:
        """Persist `content`, deduping on its SHA-256. Returns the RawArtifact record — a fresh
        insert on first sight of this exact content, or the existing record on a repeat."""

    @abstractmethod
    def get(self, sha256: str) -> bytes:
        """Retrieve stored content by hash. Raises ArtifactNotFoundError if unknown."""

    @abstractmethod
    def exists(self, sha256: str) -> bool:
        pass

    @abstractmethod
    def iter_artifacts(
        self, *, source_slug: str | None = None, since: datetime | None = None
    ) -> Iterator[RawArtifact]:
        """Metadata only, in fetched_at order — the source reprocess() reads from."""

    @abstractmethod
    def latest_for_url(self, source_slug: str, url: str) -> RawArtifact | None:
        """The most recently fetched artifact for this exact URL, or None if never fetched —
        what change detection (item 17) compares a fresh fetch against."""

    @abstractmethod
    def prune(self, *, older_than_days: int) -> int:
        """Delete artifacts fetched before the retention cutoff. Returns the count removed."""


class FilesystemArtifactStore(ArtifactStore):
    def __init__(
        self,
        root_dir: Path | str = DEFAULT_ROOT,
        db_connection_factory=get_db_connection,
    ):
        self.root_dir = Path(root_dir)
        self._db_connection_factory = db_connection_factory

    def _path_for(self, sha256: str) -> Path:
        # Two-character prefix directories keep any one directory from accumulating an unbounded
        # number of entries as the store grows.
        return self.root_dir / sha256[:2] / sha256

    _COLUMNS = (
        "sha256, source_slug, source_url, fetched_at, content_type, http_status, storage_key, "
        "etag, last_modified"
    )

    def _row_to_artifact(self, row) -> RawArtifact:
        (
            sha256,
            source_slug,
            source_url,
            fetched_at,
            content_type,
            http_status,
            storage_key,
            etag,
            last_modified,
        ) = row
        return RawArtifact(
            sha256=sha256,
            source_slug=source_slug,
            source_url=source_url,
            fetched_at=fetched_at,
            content_type=content_type,
            http_status=http_status,
            storage_key=storage_key,
            etag=etag,
            last_modified=last_modified,
        )

    def store(
        self,
        content: bytes,
        *,
        source_slug: str,
        source_url: str,
        content_type: str,
        http_status: int | None = None,
        fetched_at: datetime | None = None,
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> RawArtifact:
        sha256 = hashlib.sha256(content).hexdigest()
        fetched_at = fetched_at or datetime.now(timezone.utc)

        conn = self._db_connection_factory()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {self._COLUMNS} FROM raw_artifacts WHERE sha256 = %s",
                    (sha256,),
                )
                existing = cur.fetchone()
                if existing:
                    # Identical content already stored — dedupe, don't rewrite the file or insert
                    # a second row for the same bytes.
                    return self._row_to_artifact(existing)

                path = self._path_for(sha256)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
                storage_key = str(path)

                cur.execute(
                    "INSERT INTO raw_artifacts "
                    "(sha256, source_slug, source_url, fetched_at, content_type, http_status, "
                    "storage_key, etag, last_modified) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        sha256,
                        source_slug,
                        source_url,
                        fetched_at,
                        content_type,
                        http_status,
                        storage_key,
                        etag,
                        last_modified,
                    ),
                )
                conn.commit()
        finally:
            conn.close()

        return RawArtifact(
            sha256=sha256,
            source_slug=source_slug,
            source_url=source_url,
            fetched_at=fetched_at,
            content_type=content_type,
            http_status=http_status,
            storage_key=storage_key,
            etag=etag,
            last_modified=last_modified,
        )

    def _lookup_storage_key(self, sha256: str) -> str | None:
        # The database, not this instance's root_dir, is authoritative for where an artifact's
        # bytes live — a different FilesystemArtifactStore instance (a different root_dir, or a
        # different process entirely, such as the CLI) may be reading metadata this instance
        # didn't write. Recomputing the path from root_dir instead of the recorded storage_key
        # would silently miss artifacts stored elsewhere.
        conn = self._db_connection_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT storage_key FROM raw_artifacts WHERE sha256 = %s", (sha256,))
                row = cur.fetchone()
                return row[0] if row else None
        finally:
            conn.close()

    def get(self, sha256: str) -> bytes:
        storage_key = self._lookup_storage_key(sha256)
        if storage_key is None:
            raise ArtifactNotFoundError(f"No stored artifact for sha256={sha256!r}")
        path = Path(storage_key)
        if not path.exists():
            raise ArtifactNotFoundError(
                f"raw_artifacts records sha256={sha256!r} at {storage_key!r}, "
                "but that file is missing."
            )
        return path.read_bytes()

    def exists(self, sha256: str) -> bool:
        storage_key = self._lookup_storage_key(sha256)
        return storage_key is not None and Path(storage_key).exists()

    def iter_artifacts(
        self, *, source_slug: str | None = None, since: datetime | None = None
    ) -> Iterator[RawArtifact]:
        conn = self._db_connection_factory()
        try:
            with conn.cursor() as cur:
                clauses = []
                params: list = []
                if source_slug is not None:
                    clauses.append("source_slug = %s")
                    params.append(source_slug)
                if since is not None:
                    clauses.append("fetched_at >= %s")
                    params.append(since)
                where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
                cur.execute(
                    f"SELECT {self._COLUMNS} FROM raw_artifacts {where} ORDER BY fetched_at",
                    params,
                )
                rows = cur.fetchall()
        finally:
            conn.close()

        for row in rows:
            yield self._row_to_artifact(row)

    def latest_for_url(self, source_slug: str, url: str) -> RawArtifact | None:
        conn = self._db_connection_factory()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {self._COLUMNS} FROM raw_artifacts "
                    "WHERE source_slug = %s AND source_url = %s "
                    "ORDER BY fetched_at DESC LIMIT 1",
                    (source_slug, url),
                )
                row = cur.fetchone()
                return self._row_to_artifact(row) if row else None
        finally:
            conn.close()

    def prune(self, *, older_than_days: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        conn = self._db_connection_factory()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT sha256, storage_key FROM raw_artifacts WHERE fetched_at < %s", (cutoff,)
                )
                to_delete = cur.fetchall()
                if not to_delete:
                    return 0

                cur.execute(
                    "DELETE FROM raw_artifacts WHERE sha256 = ANY(%s)",
                    ([row[0] for row in to_delete],),
                )
                conn.commit()
        finally:
            conn.close()

        for _sha256, storage_key in to_delete:
            path = Path(storage_key)
            path.unlink(missing_ok=True)

        return len(to_delete)
