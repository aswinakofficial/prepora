"""
Images that belong to questions — an exhibit in the stem, an image-only option, a diagram in the
explanation. Scrapers download them while they still have a (possibly authenticated) browser
session, store them here, and carry only the storage key forward, so a published question never
depends on the source site keeping its image at the same URL.

Same shape as the raw artifact store (artifact_store.py): an interface (MediaStore) with a
filesystem implementation now, so an object-store implementation (S3/R2, the STORAGE_* variables
in .env.example) is a second implementation later rather than a refactor. Content-addressed by
SHA-256, so the same image stores once however many questions use it.

Unlike the raw artifact store, the location is fixed rather than relative to the working
directory: the scraper writes here, and the web app (apps/web/app/routes/api/media.$.ts) serves
from here, from different working directories. MEDIA_STORAGE_DIR overrides it.
"""
import hashlib
import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

# apps/pipeline/prepora_pipeline/core/media_store.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_ROOT = REPO_ROOT / ".data" / "media"

MAX_BYTES = 5 * 1024 * 1024

# Only real image types. SVG is allowed (diagrams), which is why the web app serves every media
# file with a sandboxing Content-Security-Policy — an SVG can carry script.
EXTENSION_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}

_STORAGE_KEY = re.compile(r"^[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$")


class MediaError(ValueError):
    pass


@dataclass(frozen=True)
class StoredMedia:
    storage_key: str
    sha256: str
    mime_type: str
    size_bytes: int


def normalize_mime(content_type: str | None) -> str | None:
    mime = (content_type or "").split(";")[0].strip().lower()
    return "image/jpeg" if mime == "image/jpg" else mime or None


def is_valid_storage_key(key: str) -> bool:
    return bool(_STORAGE_KEY.match(key))


class MediaStore(ABC):
    @abstractmethod
    def store(self, content: bytes, content_type: str | None) -> StoredMedia:
        """Persist an image, deduping on its SHA-256. Raises MediaError for anything that isn't
        an allowed image type or is too large."""

    @abstractmethod
    def get(self, storage_key: str) -> bytes:
        pass

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        pass


class FilesystemMediaStore(MediaStore):
    def __init__(self, root_dir: Path | str | None = None):
        self.root_dir = Path(root_dir or os.environ.get("MEDIA_STORAGE_DIR") or DEFAULT_ROOT)

    def _path(self, storage_key: str) -> Path:
        if not is_valid_storage_key(storage_key):
            raise MediaError(f"Not a media storage key: {storage_key!r}")
        return self.root_dir / storage_key

    def store(self, content: bytes, content_type: str | None) -> StoredMedia:
        mime = normalize_mime(content_type)
        ext = EXTENSION_BY_MIME.get(mime or "")
        if not ext:
            raise MediaError(f"Not an allowed image type: {content_type!r}")
        if not content:
            raise MediaError("Empty image.")
        if len(content) > MAX_BYTES:
            raise MediaError(f"Image is {len(content)} bytes; the limit is {MAX_BYTES}.")

        sha256 = hashlib.sha256(content).hexdigest()
        storage_key = f"{sha256[:2]}/{sha256}.{ext}"
        path = self._path(storage_key)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_bytes(content)
            tmp.replace(path)  # atomic: a reader never sees a half-written file
        return StoredMedia(storage_key, sha256, mime, len(content))

    def get(self, storage_key: str) -> bytes:
        return self._path(storage_key).read_bytes()

    def exists(self, storage_key: str) -> bool:
        return self._path(storage_key).exists()
