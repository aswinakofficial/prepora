#!/usr/bin/env python3
"""
prepora-pipeline — CLI-first per docs/architecture/prepora-next-level-plan.md §17's first
principle ("CLI-first, HTTP-second"): every stage is independently runnable from here, and a
future thin FastAPI wrapper calls into the same functions rather than duplicating them.

Currently implements what items 12, 14, 18, 20, and 22 need: `reprocess` (replay stored artifacts
through a parser, no network access), `prune` (the retention policy), `sync-sources` (load
connectors/*/source.yaml into the sources table), `publish` (idempotent, occurrence-aware
publishing of a single NormalizedQuestion), `dedupe-check` (report whether a NormalizedQuestion is
a duplicate, near-duplicate, or unique, without publishing it), `dedupe-audit` (the same check
over the whole published corpus), `media-sync` (copy published images to R2), and
`import-markdown` (the first full discover -> fetch -> parse -> normalize -> publish connector
run). A generic `run --connector <name>` covering every connector the same way is later roadmap
work, once more than one connector needs it.
"""
import argparse
import dataclasses
import json
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

from prepora_pipeline.connectors.markdown.run import run as run_markdown_import
from prepora_pipeline.contracts import NormalizedQuestion
from prepora_pipeline.core import (
    FilesystemArtifactStore,
    list_sources,
    reprocess_source,
    sync_sources_from_yaml,
)
from prepora_pipeline.core.db import get_db_connection
from prepora_pipeline.core.media_store import FilesystemMediaStore, media_store_from_env
from prepora_pipeline.dedupe import check_duplicate
from prepora_pipeline.dedupe.audit import format_report, run_audit
from prepora_pipeline.stages.publish import PublishError, publish_question, upload_missing_media


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def _passthrough_parser(content: bytes, artifact):
    # Placeholder: no per-source connector parser exists in apps/pipeline yet (that is later
    # roadmap work — the connectors/ directory in the target architecture). Once one does, pass
    # its parse function to reprocess_source() instead of this.
    return content.decode("utf-8", errors="replace")


def cmd_reprocess(args: argparse.Namespace) -> int:
    store = FilesystemArtifactStore()
    since = _parse_date(args.since) if args.since else None

    count = 0
    for artifact, _output in reprocess_source(
        store, _passthrough_parser, source_slug=args.source, since=since
    ):
        count += 1
        print(f"reprocessed {artifact.sha256[:12]}  {artifact.source_url}")

    print(f"\n{count} artifact(s) reprocessed for source={args.source!r} (no network access).")
    return 0


def cmd_prune(args: argparse.Namespace) -> int:
    store = FilesystemArtifactStore()
    removed = store.prune(older_than_days=args.older_than_days)
    print(f"Removed {removed} artifact(s) older than {args.older_than_days} day(s).")
    return 0


def cmd_sync_sources(_args: argparse.Namespace) -> int:
    count = sync_sources_from_yaml()
    print(f"Synced {count} source definition(s).")
    for source in list_sources():
        flag = "enabled" if source.enabled else "DISABLED"
        print(f"  {source.name:20s} {source.base_url:40s} [{flag}]")
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    raw = sys.stdin.read() if args.file in (None, "-") else open(args.file, encoding="utf-8").read()
    normalized = NormalizedQuestion.model_validate_json(raw)

    try:
        result = publish_question(normalized)
    except PublishError as exc:
        print(f"publish failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(dataclasses.asdict(result), indent=2))
    return 0


def cmd_dedupe_check(args: argparse.Namespace) -> int:
    raw = sys.stdin.read() if args.file in (None, "-") else open(args.file, encoding="utf-8").read()
    normalized = NormalizedQuestion.model_validate_json(raw)
    decision = check_duplicate(normalized)
    print(json.dumps(dataclasses.asdict(decision), indent=2))
    return 0


def cmd_dedupe_audit(args: argparse.Namespace) -> int:
    report = run_audit(min_similarity=args.min_similarity)
    print(format_report(report, min_similarity=args.min_similarity))
    # Only true duplicates fail: the other findings are for a person to look at.
    return 1 if report.exact else 0


def cmd_import_markdown(args: argparse.Namespace) -> int:
    results = run_markdown_import(args.content_dir)
    if not results:
        print(f"No Markdown files found under {args.content_dir!r}.")
        return 0

    for result in results:
        print(f"[{result.status:>9}] {result.path} — {result.detail}")

    errors = sum(1 for r in results if r.status == "error")
    print(f"\n{len(results)} result(s), {errors} error(s).")
    return 1 if errors else 0


def cmd_media_sync(_args: argparse.Namespace) -> int:
    """Uploads every image a published question uses that R2 doesn't have yet — the back-fill for
    images published before MEDIA_STORE=r2 was set, and the release check before images go live."""
    remote = media_store_from_env()
    if isinstance(remote, FilesystemMediaStore):
        print("media-sync needs MEDIA_STORE=r2 (and the STORAGE_* variables).", file=sys.stderr)
        return 1
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT storage_key, mime_type FROM media ORDER BY storage_key")
            items = cur.fetchall()
    finally:
        conn.close()
    uploaded, missing = upload_missing_media(remote, items, skip_missing=True)
    already = len(items) - uploaded - len(missing)
    print(
        f"{len(items)} images referenced; {uploaded} uploaded, {already} already in R2, "
        f"{len(missing)} missing locally."
    )
    for key in missing:
        print(f"  missing locally: {key}", file=sys.stderr)
    return 1 if missing else 0


def main(argv: list[str] | None = None) -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(prog="prepora-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    reprocess_parser = subparsers.add_parser(
        "reprocess", help="Replay stored artifacts through a parser, with no network access."
    )
    reprocess_parser.add_argument("--source", required=True, help="Source slug to reprocess.")
    reprocess_parser.add_argument(
        "--from", dest="since", help="Only artifacts fetched on or after this date (YYYY-MM-DD)."
    )
    reprocess_parser.set_defaults(func=cmd_reprocess)

    prune_parser = subparsers.add_parser(
        "prune", help="Delete artifacts older than the retention window."
    )
    prune_parser.add_argument("--older-than-days", type=int, required=True)
    prune_parser.set_defaults(func=cmd_prune)

    sync_sources_parser = subparsers.add_parser(
        "sync-sources", help="Load connectors/*/source.yaml into the sources table."
    )
    sync_sources_parser.set_defaults(func=cmd_sync_sources)

    publish_parser = subparsers.add_parser(
        "publish", help="Publish a single NormalizedQuestion (JSON) from a file or stdin."
    )
    publish_parser.add_argument(
        "--file", default="-", help="Path to a NormalizedQuestion JSON file, or '-' for stdin."
    )
    publish_parser.set_defaults(func=cmd_publish)

    dedupe_check_parser = subparsers.add_parser(
        "dedupe-check",
        help="Report whether a NormalizedQuestion (JSON) is a duplicate, without publishing it.",
    )
    dedupe_check_parser.add_argument(
        "--file", default="-", help="Path to a NormalizedQuestion JSON file, or '-' for stdin."
    )
    dedupe_check_parser.set_defaults(func=cmd_dedupe_check)

    dedupe_audit_parser = subparsers.add_parser(
        "dedupe-audit",
        help="Scan every published question for duplicates (exits 1 if exact duplicates exist).",
    )
    dedupe_audit_parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.85,
        help="Report question pairs whose wording is at least this similar (default: 0.85).",
    )
    dedupe_audit_parser.set_defaults(func=cmd_dedupe_audit)

    media_sync_parser = subparsers.add_parser(
        "media-sync", help="Upload every published image R2 doesn't have yet (MEDIA_STORE=r2)."
    )
    media_sync_parser.set_defaults(func=cmd_media_sync)

    import_markdown_parser = subparsers.add_parser(
        "import-markdown",
        help="Discover, parse, normalize, and publish every Markdown file under a directory.",
    )
    import_markdown_parser.add_argument(
        "--content-dir",
        default="content",
        help="Directory to walk for *.md files (default: content).",
    )
    import_markdown_parser.set_defaults(func=cmd_import_markdown)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
