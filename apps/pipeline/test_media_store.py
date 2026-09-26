import pytest

from prepora_pipeline.core.media_store import (
    DEFAULT_ROOT,
    MAX_BYTES,
    FilesystemMediaStore,
    MediaError,
    is_valid_storage_key,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_default_root_is_the_repo_data_dir_not_the_working_directory():
    assert DEFAULT_ROOT.parts[-2:] == (".data", "media")
    assert (DEFAULT_ROOT.parents[1] / "apps" / "pipeline").is_dir()


def test_store_is_content_addressed_and_idempotent(tmp_path):
    store = FilesystemMediaStore(tmp_path)
    first = store.store(PNG, "image/png")
    second = store.store(PNG, "image/png; charset=binary")
    assert first == second
    assert first.storage_key == f"{first.sha256[:2]}/{first.sha256}.png"
    assert store.get(first.storage_key) == PNG
    assert store.exists(first.storage_key)
    assert first.size_bytes == len(PNG)


def test_jpg_alias_is_normalized(tmp_path):
    assert FilesystemMediaStore(tmp_path).store(b"jpegdata", "image/jpg").mime_type == "image/jpeg"


@pytest.mark.parametrize("content_type", ["text/html", "application/javascript", None, ""])
def test_non_images_are_refused(tmp_path, content_type):
    with pytest.raises(MediaError):
        FilesystemMediaStore(tmp_path).store(b"<script>alert(1)</script>", content_type)


def test_oversized_and_empty_images_are_refused(tmp_path):
    store = FilesystemMediaStore(tmp_path)
    with pytest.raises(MediaError, match="limit"):
        store.store(b"x" * (MAX_BYTES + 1), "image/png")
    with pytest.raises(MediaError, match="Empty"):
        store.store(b"", "image/png")


@pytest.mark.parametrize(
    "key", ["../../etc/passwd", "ab/cd.png", "/abs/path.png", "ab/" + "a" * 64 + ".exe"]
)
def test_storage_keys_cannot_escape_the_store(tmp_path, key):
    assert not is_valid_storage_key(key)
    with pytest.raises(MediaError):
        FilesystemMediaStore(tmp_path).get(key)
