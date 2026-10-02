"""
Images that belong to questions — an exhibit in the stem, an image-only option, a diagram in the
explanation. Scrapers download them while they still have a (possibly authenticated) browser
session, store them here, and carry only the storage key forward, so a published question never
depends on the source site keeping its image at the same URL.

Same shape as the raw artifact store (artifact_store.py): an interface (MediaStore) with two
implementations. FilesystemMediaStore is where scrapers write, and what local development serves.
R2MediaStore is Cloudflare R2 (docs/specs/04-media-storage.md), where publishing copies each image
a published question uses, so the deployed site can serve it from https://media.prepora.xpar.in.
Content-addressed by SHA-256, so the same image stores once however many questions use it, and an
object never changes once written.

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

    def put(self, storage_key: str, content: bytes, mime_type: str) -> None:
        """Write an image under a key already derived from its content (copying between
        stores). Only stores that are copy targets implement it."""
        raise NotImplementedError(f"{type(self).__name__} can't be written to by key.")


def _checked(content: bytes, content_type: str | None) -> tuple[str, str, str]:
    """(storage key, sha256, mime) for an image, or MediaError if it isn't one we accept."""
    mime = normalize_mime(content_type)
    ext = EXTENSION_BY_MIME.get(mime or "")
    if not ext:
        raise MediaError(f"Not an allowed image type: {content_type!r}")
    if not content:
        raise MediaError("Empty image.")
    if len(content) > MAX_BYTES:
        raise MediaError(f"Image is {len(content)} bytes; the limit is {MAX_BYTES}.")
    sha256 = hashlib.sha256(content).hexdigest()
    return f"{sha256[:2]}/{sha256}.{ext}", sha256, mime


class FilesystemMediaStore(MediaStore):
    def __init__(self, root_dir: Path | str | None = None):
        self.root_dir = Path(root_dir or os.environ.get("MEDIA_STORAGE_DIR") or DEFAULT_ROOT)

    def _path(self, storage_key: str) -> Path:
        if not is_valid_storage_key(storage_key):
            raise MediaError(f"Not a media storage key: {storage_key!r}")
        return self.root_dir / storage_key

    def store(self, content: bytes, content_type: str | None) -> StoredMedia:
        storage_key, sha256, mime = _checked(content, content_type)
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


# Content-addressed keys never change, so browsers and Cloudflare's edge may cache them forever.
IMMUTABLE = "public, max-age=31536000, immutable"


class R2MediaStore(MediaStore):
    """
    Cloudflare R2, through its S3-compatible API. Built from the STORAGE_* variables (a token
    scoped to the media bucket); the bucket is public on media.prepora.xpar.in, so nothing here
    serves images, it only writes them. Keys are the same as FilesystemMediaStore's.
    """

    def __init__(self, client=None, bucket: str | None = None):
        if client is None:
            import boto3  # only publishing to production needs it; the scraper never does

            client = boto3.client(
                "s3",
                endpoint_url=_required_env("STORAGE_ENDPOINT"),
                aws_access_key_id=_required_env("STORAGE_ACCESS_KEY"),
                aws_secret_access_key=_required_env("STORAGE_SECRET_KEY"),
                region_name=os.environ.get("STORAGE_REGION") or "auto",
            )
        self.client = client
        self.bucket = bucket or os.environ.get("STORAGE_BUCKET") or "prepora-media"

    def put(self, storage_key: str, content: bytes, mime_type: str) -> None:
        if not is_valid_storage_key(storage_key):
            raise MediaError(f"Not a media storage key: {storage_key!r}")
        self.client.put_object(
            Bucket=self.bucket,
            Key=storage_key,
            Body=content,
            ContentType=mime_type,
            CacheControl=IMMUTABLE,
        )

    def store(self, content: bytes, content_type: str | None) -> StoredMedia:
        storage_key, sha256, mime = _checked(content, content_type)
        if not self.exists(storage_key):
            self.put(storage_key, content, mime)
        return StoredMedia(storage_key, sha256, mime, len(content))

    def get(self, storage_key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=storage_key)["Body"].read()

    def exists(self, storage_key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=storage_key)
        except Exception as exc:  # botocore's ClientError, without importing botocore here
            status = getattr(exc, "response", {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 404:
                return False
            raise
        return True


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise MediaError(f"{name} is not set; it's needed for MEDIA_STORE=r2 (see .env.example).")
    return value


def media_store_from_env() -> MediaStore:
    """Where published images live: R2 with MEDIA_STORE=r2, otherwise the local filesystem."""
    if (os.environ.get("MEDIA_STORE") or "").strip().lower() == "r2":
        return R2MediaStore()
    return FilesystemMediaStore()
