"""
Importing one GATE paper (#48): fetch → store raw → parse → join → validate → intake → one review
batch.

Every joined question becomes an intake item (core/intake.py, docs/specs/07-intake.md): `ready`,
or `held` with its issues — a figure, broken math, a table, a type that disagrees with the key, a
validation error. Only ready items go into the review batch (the owner's pilot decision,
docs/specs/05-gate-pilot.md); held ones wait for a fix, never published as wrong text. Running it
again records what changed and batches only ready items not already in review. A paper whose key
and questions don't join completely writes nothing.
"""
from collections.abc import Callable
from dataclasses import dataclass, field

from ...core.answer_keys import join_by_number
from ...core.artifact_store import ArtifactStore, FilesystemArtifactStore
from ...core.db import get_db_connection
from ...core.http_client import fetch as http_fetch
from ...core.intake import IntakeItem, IntakeStore, RecordResult
from ...core.pdf_text import extract_pages
from ...core.quality import Issue
from ...core.review_batches import NORMALIZED_FORMAT, create_review_batch
from ...stages.validate import validate_question
from .catalog import PaperSpec
from .key_parser import parse_answer_key
from .normalizer import PARSER_VERSION, SUBJECTS, GateNormalizeError, to_normalized
from .paper_parser import parse_paper
from .register import ensure_gate_registered

SOURCE_SLUG = "gate"
EDITION = "iitg"  # the official site's copy (Spec 8 adds the Drive folder's)


def paper_key(paper: PaperSpec) -> str:
    return f"gate/{paper.year}/{paper.paper.lower()}/{paper.sitting}"


@dataclass
class ImportReport:
    paper: str  # "GATE 2026 CS-1"
    parsed: int = 0
    joined: int = 0
    mta: int = 0
    clean: int = 0  # questions with no issues
    held: list[tuple[int, list[str]]] = field(default_factory=list)  # (number, issue codes)
    join_gaps: list[str] = field(default_factory=list)
    recorded: RecordResult | None = None
    in_batch: int = 0  # ready items sent to review by this run
    batch_id: str | None = None

    @property
    def clean_rate(self) -> float:
        return self.clean / self.parsed if self.parsed else 0.0

    def lines(self) -> list[str]:
        out = [
            f"{self.paper}: {self.parsed} questions parsed, {self.joined} joined to the key, "
            f"{self.clean} clean ({self.clean_rate:.0%}), {len(self.held)} held, {self.mta} MTA."
        ]
        if self.recorded:
            r = self.recorded
            out.append(
                f"  intake: {r.inserted} new, {r.changed} changed, {r.unchanged} unchanged; "
                + ", ".join(f"{n} {status}" for status, n in sorted(r.statuses.items()))
            )
        out += [f"  join gap: {gap}" for gap in self.join_gaps]
        out += [f"  held Q.{n}: {', '.join(codes)}" for n, codes in self.held]
        if self.batch_id:
            out.append(f"  review batch: {self.batch_id} ({self.in_batch} questions)")
        elif self.recorded:
            out.append("  no new review batch: nothing ready that isn't already in review")
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
    intake: IntakeStore | None = None,
    register: bool = True,
) -> ImportReport:
    store = store or FilesystemArtifactStore()
    intake = intake or IntakeStore()
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

    key_name = paper_key(paper)
    items = []
    for question, key in join.matched:
        items.append(_intake_item(question, key, paper, key_name, qp.sha256, validate_question))
    for item in items:
        if item.issues:
            report.held.append((item.number, sorted({issue.code for issue in item.issues})))
        else:
            report.clean += 1
            if item.candidate.get("answer_status") == "marks_to_all":
                report.mta += 1
    report.recorded = intake.record(items)

    ready = intake.ready_for_batch(SOURCE_SLUG, key_name, EDITION)
    if ready:
        report.batch_id = write_batch(
            paper.qp_url,
            [_element(candidate, intake_item_id) for intake_item_id, candidate in ready],
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
        intake.mark_in_review([intake_item_id for intake_item_id, _ in ready], report.batch_id)
        report.in_batch = len(ready)
    return report


def _intake_item(question, key, paper, key_name, qp_sha, validate) -> IntakeItem:
    """The question as an intake item: its candidate, and every issue that holds it back."""
    issues = list(question.issues)
    try:
        normalized = to_normalized(question, key, paper, raw_artifact_sha256=qp_sha)
    except GateNormalizeError as exc:
        # As much of the question as was read, so a later fix (Spec 9) can rebuild it.
        if not any(issue.code == "image_option" for issue in issues):
            issues.append(Issue("type_mismatch", str(exc)))
        candidate = {
            "number": question.number,
            "number_label": question.label,
            "question_text": question.text,
            "options": question.options,
            "key": {"qtype": key.qtype, "raw": key.raw_key, "marks": key.marks},
            "section": key.section,
        }
    else:
        candidate = normalized.model_dump(mode="json")
        if not issues:
            issues += [
                Issue("invalid", f"{i.code}: {i.message}")
                for i in validate(normalized).issues
                if i.severity == "error"
            ]
    return IntakeItem(
        source=SOURCE_SLUG,
        paper_key=key_name,
        edition=EDITION,
        number=question.number,
        number_label=question.label,
        raw_artifact_sha256=qp_sha,
        candidate=candidate,
        parser_version=PARSER_VERSION,
        issues=issues,
        regions=question.regions,
    )


def _element(candidate: dict, intake_item_id: str) -> dict:
    """The review page's display fields, plus the question itself, which approval publishes, and
    the intake item approval marks as published."""
    answer = candidate.get("answer")
    if answer is None:
        shown = "Marks to all (no answer to score)"
    elif answer["type"] == "mcq":
        shown = answer["correct_key"]
    elif answer["type"] == "multiple_correct":
        shown = " | ".join(answer["correct_keys"])
    else:
        shown = answer["answer"]  # a NAT answer's key text, "4.24 to 4.26"
    return {
        "questionText": candidate["question_text"],
        "options": [option["text"] for option in candidate.get("options", [])],
        "answer": shown,
        "explanation": None,
        "images": [],
        "normalized": candidate,
        "intakeItemId": intake_item_id,
    }
