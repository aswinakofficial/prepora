"""
Downloads and stores the images a parsed Microsoft Learn question refers to (see
ms_learn_parser.ParsedImage), while the crawler still has its signed-in browser session.

The fetch itself is passed in (the crawler uses Playwright's context.request, which carries the
session cookies), so this stays testable without a browser.

A question is only kept complete: if an image in the question or an option can't be stored, the
whole question is refused (MediaFetchError) — publishing "Refer to the exhibit" without the
exhibit would leave an unanswerable question. An explanation image that fails is dropped with a
warning, since the question and answer still stand without it.
"""
import base64
import ipaddress
import re
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from prepora_pipeline.core.media_store import MediaError, MediaStore

from ms_learn_parser import ParsedImage

# (url) -> (http_status, body, content_type)
Fetch = Callable[[str], Awaitable[tuple[int, bytes, str | None]]]

_DATA_URI = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,(.+)$", re.I | re.S)


class MediaFetchError(Exception):
    pass


def is_fetchable_url(url: str) -> bool:
    """https to a public hostname only — a scraped page must not be able to point the scraper at
    localhost or an internal address (the same concern as security.py's assert_safe_url)."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or host == "localhost" or "." not in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False  # IP literals are never a legitimate image host here
    except ValueError:
        return True


async def _load(image: ParsedImage, fetch: Fetch) -> tuple[bytes, str | None]:
    data_uri = _DATA_URI.match(image.src)
    if data_uri:
        try:
            return base64.b64decode(data_uri.group(2), validate=False), data_uri.group(1)
        except ValueError as exc:
            raise MediaFetchError(f"Undecodable data: image: {exc}") from exc
    if not is_fetchable_url(image.src):
        raise MediaFetchError(f"Refusing to fetch image from {image.src!r}")
    status, body, content_type = await fetch(image.src)
    if status != 200:
        raise MediaFetchError(f"Image {image.src} returned HTTP {status}")
    return body, content_type


async def store_question_images(
    images: list[ParsedImage], fetch: Fetch, store: MediaStore, log=print
) -> list[dict]:
    """Stored image records for the scraped element (camelCase, like the rest of it)."""
    stored = []
    for image in images:
        try:
            body, content_type = await _load(image, fetch)
            media = store.store(body, content_type)
        except (MediaFetchError, MediaError) as exc:
            if image.placement == "explanation":
                log(f"[MS LEARN MEDIA WARNING]: Dropping explanation image {image.src}: {exc}")
                continue
            raise MediaFetchError(
                f"{image.placement} image could not be stored ({exc}); the question would be "
                "incomplete without it"
            ) from exc
        stored.append(
            {
                "placement": image.placement,
                "optionIndex": image.option_index,
                "storageKey": media.storage_key,
                "mimeType": media.mime_type,
                "alt": image.alt,
                "sourceUrl": None if image.src.startswith("data:") else image.src,
            }
        )
    return stored
