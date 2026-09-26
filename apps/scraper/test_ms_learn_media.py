import asyncio
import base64
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from prepora_pipeline.core.media_store import FilesystemMediaStore  # noqa: E402

from ms_learn_media import MediaFetchError, is_fetchable_url, store_question_images  # noqa: E402
from ms_learn_parser import ParsedImage  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x01" * 16


def fetcher(responses):
    calls = []

    async def fetch(url):
        calls.append(url)
        return responses[url]

    fetch.calls = calls
    return fetch


def run(images, fetch, store, log=lambda m: None):
    return asyncio.run(store_question_images(images, fetch, store, log))


def test_images_are_downloaded_stored_and_described(tmp_path):
    store = FilesystemMediaStore(tmp_path)
    fetch = fetcher({"https://learn.microsoft.com/a.png": (200, PNG, "image/png")})
    stored = run(
        [ParsedImage("option", "https://learn.microsoft.com/a.png", "Topology A", 0)], fetch, store
    )
    assert len(stored) == 1
    record = stored[0]
    assert record["placement"] == "option" and record["optionIndex"] == 0
    assert record["alt"] == "Topology A" and record["mimeType"] == "image/png"
    assert record["sourceUrl"] == "https://learn.microsoft.com/a.png"
    assert store.get(record["storageKey"]) == PNG


def test_data_uri_images_are_decoded_without_fetching(tmp_path):
    fetch = fetcher({})
    src = "data:image/png;base64," + base64.b64encode(PNG).decode()
    stored = run([ParsedImage("question", src, "")], fetch, FilesystemMediaStore(tmp_path))
    assert fetch.calls == []
    assert stored[0]["sourceUrl"] is None


@pytest.mark.parametrize("placement", ["question", "option"])
def test_a_missing_question_or_option_image_refuses_the_question(tmp_path, placement):
    fetch = fetcher({"https://learn.microsoft.com/x.png": (404, b"", "text/html")})
    with pytest.raises(MediaFetchError, match="incomplete"):
        run(
            [ParsedImage(placement, "https://learn.microsoft.com/x.png", "", 0)],
            fetch,
            FilesystemMediaStore(tmp_path),
        )


def test_a_missing_explanation_image_is_dropped_with_a_warning(tmp_path):
    warnings = []
    fetch = fetcher({"https://learn.microsoft.com/x.png": (200, b"<html>", "text/html")})
    stored = run(
        [ParsedImage("explanation", "https://learn.microsoft.com/x.png", "")],
        fetch,
        FilesystemMediaStore(tmp_path),
        warnings.append,
    )
    assert stored == [] and len(warnings) == 1


@pytest.mark.parametrize(
    "url,ok",
    [
        ("https://learn.microsoft.com/a.png", True),
        ("http://learn.microsoft.com/a.png", False),
        ("https://localhost/a.png", False),
        ("https://127.0.0.1/a.png", False),
        ("https://169.254.169.254/latest/meta-data", False),
        ("https://intranet/a.png", False),
        ("file:///etc/passwd", False),
    ],
)
def test_only_public_https_urls_are_fetched(url, ok):
    assert is_fetchable_url(url) is ok
