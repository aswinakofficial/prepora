"""
Importing one GATE paper (#48): fetch → store raw → parse → join → validate → one review batch.

Per the owner's decision for the pilot (docs/specs/05-gate-pilot.md), only clean questions go into
the batch: a question the garble detector flagged (figure, math, layout) is held back and listed
in the report with its reasons, never published as wrong text. A paper whose key and questions
don't join completely writes nothing.
"""
from collections.abc import Callable
from dataclasses import dataclass, field

from ...core.answer_keys import join_by_number
from ...core.artifact_store import ArtifactStore, FilesystemArtifactStore
from ...core.db import get_db_connection
from ...core.http_client import fetch as http_fetch
from ...core.pdf_text import extract_pages
from ...core.review_batches import NORMALIZED_FORMAT, create_review_batch, pending_batch_for
from ...stages.validate import validate_question
from .catalog import PaperSpec
from .key_parser import parse_answer_key
from .normalizer import SUBJECTS, GateNormalizeError, to_normalized
from .paper_parser import parse_paper
from .register import ensure_gate_registered

SOURCE_SLUG = "gate"


@dataclass
class ImportReport:
    paper: str  # "GATE 2026 CS-1"
    parsed: int = 0
    joined: int = 0
    mta: int = 0
    in_batch: int = 0
    held_back: list[tuple[int, list[str]]] = field(default_factory=list)  # (number, reasons)
    invalid: list[tuple[int, str]] = field(default_factory=list)  # (number, why)
    join_gaps: list[str] = field(default_factory=list)
    batch_id: str | None = None
    already_pending: str | None = None  # a batch for this paper already waiting in review

    @property
    def clean_rate(self) -> float:
        return self.in_batch / self.parsed if self.parsed else 0.0

    def lines(self) -> list[str]:
        out = [
            f"{self.paper}: {self.parsed} questions parsed, {self.joined} joined to the key, "
            f"{self.in_batch} in the review batch ({self.clean_rate:.0%} clean), "
            f"{len(self.held_back)} held back, {len(self.invalid)} invalid, {self.mta} MTA."
        ]
        out += [f"  join gap: {gap}" for gap in self.join_gaps]
        out += [f"  held back Q.{n}: {', '.join(why)}" for n, why in self.held_back]
        out += [f"  invalid Q.{n}: {why}" for n, why in self.invalid]
        if self.already_pending:
            out.append(
                f"  not written: batch {self.already_pending} for this paper is still waiting in "
                "review. Approve or reject it first."
            )
        if self.batch_id:
            out.append(f"  review batch: {self.batch_id}")
        return out


def _fetch_pdf(url: str) -> bytes:
    response = http_fetch(url, source_slug=SOURCE_SLUG)
    response.raise_for_status()
    return response.content


def import_paper(
    paper: PaperSpec,
    *,
    fetch: Callable[[str], bytes] = _fetch_pdf,
    store: ArtifactStore | None = None,
    write_batch: Callable[..., str] = create_review_batch,
    find_pending: Callable[[str], str | None] = pending_batch_for,
    register: bool = True,
) -> ImportReport:
    store = store or FilesystemArtifactStore()
    report = ImportReport(paper=f"GATE {paper.year} {paper.sitting}")

    qp_bytes, key_bytes = fetch(paper.qp_url), fetch(paper.key_url)
    qp = store.store(
        qp_bytes, source_slug=SOURCE_SLUG, source_url=paper.qp_url, content_type="application/pdf"
    )
    store.store(
        key_bytes, source_slug=SOURCE_SLUG, source_url=paper.key_url, content_type="application/pdf"
    )

    questions = parse_paper(extract_pages(qp_bytes))
    key_rows = parse_answer_key(extract_pages(key_bytes))
    report.parsed = len(questions)

    # join_by_number works on segments' numbers; GateQuestion carries the same `number`.
    join = join_by_number(questions, key_rows)  # type: ignore[arg-type]
    report.joined = len(join.matched)
    report.join_gaps += [f"Q.{n} has no key row" for n in join.missing_in_key]
    report.join_gaps += [f"key row {n} has no question" for n in join.missing_in_paper]
    report.join_gaps += [f"Q.{n} appears twice in the paper" for n in join.duplicate_in_paper]
    report.join_gaps += [f"key row {n} appears twice" for n in join.duplicate_in_key]
    if not join.ok:
        return report  # an incomplete join writes nothing

    # Before validating: validation requires the exam to be registered.
    if register:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                ensure_gate_registered(cur)
            conn.commit()
        finally:
            conn.close()

    elements = []
    for question, key in join.matched:
        if question.flags:
            report.held_back.append((question.number, question.flags))
            continue
        try:
            normalized = to_normalized(question, key, paper, raw_artifact_sha256=qp.sha256)
        except (GateNormalizeError, ValueError) as exc:
            report.invalid.append((question.number, str(exc)))
            continue
        issues = [
            f"{i.code}: {i.message}"
            for i in validate_question(normalized).issues
            if i.severity == "error"
        ]
        if issues:
            report.invalid.append((question.number, "; ".join(issues)))
            continue
        if normalized.answer_status == "marks_to_all":
            report.mta += 1
        elements.append(_element(normalized, key.raw_key))

    report.in_batch = len(elements)
    # One batch per paper in the queue at a time: a re-run (after a parser fix, say) mustn't leave
    # an older parse waiting next to the new one, where either could be approved.
    report.already_pending = find_pending(paper.qp_url) if elements else None
    if elements and not report.already_pending:
        report.batch_id = write_batch(
            paper.qp_url,
            elements,
            {
                "exam": "GATE",
                "examTitle": "GATE",
                "subject": SUBJECTS[paper.paper][1],
                "source": "GATE official question paper",
                "format": NORMALIZED_FORMAT,
                "paper": paper.sitting,
                "year": paper.year,
            },
        )
    return report


def _element(normalized, raw_key: str) -> dict:
    """The review page's display fields, plus the question itself, which approval publishes."""
    answer = normalized.answer
    if answer is None:
        shown = "Marks to all (no answer to score)"
    elif answer.type == "mcq":
        shown = answer.correct_key
    elif answer.type == "multiple_correct":
        shown = " | ".join(answer.correct_keys)
    else:
        shown = raw_key
    return {
        "questionText": normalized.question_text,
        "options": [option.text for option in normalized.options],
        "answer": shown,
        "explanation": None,
        "images": [],
        "normalized": normalized.model_dump(mode="json"),
    }
