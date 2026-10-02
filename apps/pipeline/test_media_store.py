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


# ─── R2 (docs/specs/04-media-storage.md). No test talks to real R2: a fake S3 client stands in.


class _NotFound(Exception):
    """Shaped like botocore's ClientError for a missing key."""

    response = {"ResponseMetadata": {"HTTPStatusCode": 404}}


class FakeS3:
    def __init__(self):
        self.objects: dict[str, dict] = {}
        self.puts = 0

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise _NotFound()
        return {}

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        self.puts += 1
        self.objects[Key] = {"Body": Body, "ContentType": ContentType, "CacheControl": CacheControl}

    def get_object(self, Bucket, Key):
        import io

        return {"Body": io.BytesIO(self.objects[Key]["Body"])}


def test_r2_store_writes_immutable_typed_objects_once():
    from prepora_pipeline.core.media_store import IMMUTABLE, R2MediaStore

    s3 = FakeS3()
    store = R2MediaStore(client=s3, bucket="prepora-media")
    stored = store.store(PNG, "image/png")
    assert s3.objects[stored.storage_key]["ContentType"] == "image/png"
    assert s3.objects[stored.storage_key]["CacheControl"] == IMMUTABLE == (
        "public, max-age=31536000, immutable"
    )
    assert store.store(PNG, "image/png") == stored
    assert s3.puts == 1  # an existing key is skipped
    assert store.exists(stored.storage_key)
    assert store.get(stored.storage_key) == PNG


def test_r2_store_raises_errors_other_than_not_found():
    from prepora_pipeline.core.media_store import R2MediaStore

    class Denied(Exception):
        response = {"ResponseMetadata": {"HTTPStatusCode": 403}}

    class DeniedS3(FakeS3):
        def head_object(self, Bucket, Key):
            raise Denied()

    with pytest.raises(Denied):
        R2MediaStore(client=DeniedS3(), bucket="b").exists("ab/" + "a" * 64 + ".png")


def test_media_store_from_env_picks_r2_only_when_asked(monkeypatch, tmp_path):
    from prepora_pipeline.core import media_store as module

    monkeypatch.delenv("MEDIA_STORE", raising=False)
    assert isinstance(module.media_store_from_env(), FilesystemMediaStore)

    monkeypatch.setenv("MEDIA_STORE", "r2")
    for name in ("STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(MediaError, match="STORAGE_ENDPOINT"):
        module.media_store_from_env()

    made = {}
    monkeypatch.setenv("STORAGE_ENDPOINT", "https://example.r2.cloudflarestorage.com")
    monkeypatch.setenv("STORAGE_ACCESS_KEY", "test-access")
    monkeypatch.setenv("STORAGE_SECRET_KEY", "test-secret")
    monkeypatch.setattr("boto3.client", lambda *a, **kw: made.update(kw) or FakeS3())
    assert isinstance(module.media_store_from_env(), module.R2MediaStore)
    assert made["endpoint_url"] == "https://example.r2.cloudflarestorage.com"
    assert made["region_name"] == "auto"


def test_publishing_uploads_local_images_and_refuses_missing_ones(tmp_path):
    from prepora_pipeline.core.media_store import R2MediaStore
    from prepora_pipeline.stages.publish import PublishError, upload_missing_media

    local = FilesystemMediaStore(tmp_path)
    stored = local.store(PNG, "image/png")
    remote = R2MediaStore(client=FakeS3(), bucket="b")

    items = [(stored.storage_key, "image/png")] * 2  # the same image used twice uploads once
    assert upload_missing_media(remote, items, local) == (1, [])
    assert upload_missing_media(remote, items, local) == (0, [])
    assert remote.get(stored.storage_key) == PNG

    missing = "cd/" + "c" * 64 + ".png"
    with pytest.raises(PublishError, match="isn't in the local media store"):
        upload_missing_media(remote, [(missing, "image/png")], local)
    # media-sync's mode: report every missing image instead of stopping at the first.
    both = [(missing, "image/png"), (stored.storage_key, "image/png")]
    assert upload_missing_media(remote, both, local, skip_missing=True) == (0, [missing])


def test_publish_refuses_a_missing_image_before_touching_the_database(monkeypatch, tmp_path):
    from prepora_pipeline.contracts import (
        McqAnswer,
        NormalizedMedia,
        NormalizedOption,
        ValidatedQuestion,
    )
    from prepora_pipeline.core.media_store import R2MediaStore
    from prepora_pipeline.stages import publish
    from prepora_pipeline.stages.validate import ValidationReport

    monkeypatch.setenv("MEDIA_STORAGE_DIR", str(tmp_path))
    remote = R2MediaStore(client=FakeS3(), bucket="b")
    monkeypatch.setattr(publish, "_remote_media_store", lambda: remote)
    question = publish.NormalizedQuestion(
        exam_slug="invented",
        exam_variant_slug="standard",
        subject_slug="invented",
        number=1,
        question_text="Which invented figure is shown?",
        options=[NormalizedOption(key="A", text="One"), NormalizedOption(key="B", text="Two")],
        answer=McqAnswer(correct_key="A"),
        media=[
            NormalizedMedia(
                placement="question", storage_key="cd/" + "c" * 64 + ".png", mime_type="image/png"
            )
        ],
        parser_version="test-v1",
    )
    validated = ValidatedQuestion(**question.model_dump())
    monkeypatch.setattr(
        publish,
        "validate_question",
        lambda q: ValidationReport(
            valid=True, confidence="ambiguous", issues=[], validated=validated
        ),
    )
    monkeypatch.setattr(
        publish, "check_duplicate", lambda q: publish.DedupeDecision(outcome="unique", reason="")
    )

    def no_database():
        raise AssertionError("opened the database for a question whose image can't be shown")

    monkeypatch.setattr(publish, "get_db_connection", no_database)
    with pytest.raises(publish.PublishError, match="isn't in the local media store"):
        publish.publish_question(question)


def test_the_r2_client_is_built_once_per_configuration(monkeypatch):
    from prepora_pipeline.stages import publish

    built = []
    monkeypatch.setattr(publish, "_remote_store", None)
    monkeypatch.setattr(publish, "media_store_from_env", lambda: built.append(1) or object())
    monkeypatch.setenv("MEDIA_STORE", "r2")
    first = publish._remote_media_store()
    assert publish._remote_media_store() is first
    monkeypatch.setenv("STORAGE_BUCKET", "another-bucket")
    publish._remote_media_store()
    assert len(built) == 2
