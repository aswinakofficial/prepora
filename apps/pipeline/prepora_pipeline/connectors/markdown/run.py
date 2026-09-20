"""
Markdown connector orchestration — the "normal pipeline run" docs/roadmap/engineering-roadmap.md
item 22 asks for: discover -> fetch -> store (item 12, which is what gives this source change
detection, item 17, for free) -> parse -> normalize -> publish (item 18, itself gated by validate
and dedupe, items 19 and 20). Wrapped in the durable job model (item 13) like any other pipeline
run, so a Markdown import shows up in the admin Pipeline view (item 21) exactly like a scrape does.
"""
from dataclasses import dataclass

from prepora_pipeline.core import ArtifactStore, FilesystemArtifactStore
from prepora_pipeline.core.jobs import create_job, finalize_job, stage_run, start_job
from prepora_pipeline.stages.change_detection import classify_fetch
from prepora_pipeline.stages.publish import PublishError, publish_question

from .connector import SOURCE_SLUG, discover, fetch
from .normalizer import normalize
from .parser import MarkdownParseError, parse_markdown


@dataclass
class FileResult:
    path: str
    status: str  # "published" | "unchanged" | "error"
    detail: str


def run(
    content_dir: str = "content",
    *,
    trigger_type: str = "manual",
    store: ArtifactStore | None = None,
) -> list[FileResult]:
    store = store or FilesystemArtifactStore()
    paths = discover(content_dir)
    results: list[FileResult] = []

    job_id = create_job(
        source_id=SOURCE_SLUG,
        job_type="import",
        trigger_type=trigger_type,
        configuration={"content_dir": content_dir},
    )
    start_job(job_id)

    with stage_run(job_id, "discover") as counts:
        counts.discovered = len(paths)
        counts.processed = len(paths)

    with stage_run(job_id, "fetch_and_publish") as counts:
        for path in paths:
            try:
                content = fetch(path)
            except OSError as exc:
                counts.failed += 1
                results.append(FileResult(path, "error", f"Could not read file: {exc}"))
                continue

            classification = classify_fetch(store, SOURCE_SLUG, path, content)
            store.store(
                content, source_slug=SOURCE_SLUG, source_url=path, content_type="text/markdown"
            )

            if classification.status == "unchanged":
                counts.unchanged += 1
                counts.skipped += 1
                results.append(
                    FileResult(path, "unchanged", "Content hash matches the last import.")
                )
                continue
            if classification.status == "new":
                counts.new += 1
            else:
                counts.changed += 1

            try:
                parsed = parse_markdown(content.decode("utf-8"))
            except MarkdownParseError as exc:
                counts.failed += 1
                results.append(FileResult(path, "error", str(exc)))
                continue

            for question in parsed.questions:
                normalized = normalize(
                    parsed.frontmatter,
                    question,
                    source_document=path,
                    raw_artifact_sha256=classification.new_sha256,
                )
                try:
                    publish_result = publish_question(normalized)
                    counts.processed += 1
                    results.append(
                        FileResult(
                            path,
                            "published",
                            f"Q{question.number}: {publish_result.dedupe_outcome}",
                        )
                    )
                except PublishError as exc:
                    counts.failed += 1
                    results.append(FileResult(path, "error", f"Q{question.number}: {exc}"))

    finalize_job(job_id)
    return results
