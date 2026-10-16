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
import json
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from ...core.answer_keys import join_by_number
from ...core.artifact_store import ArtifactStore, FilesystemArtifactStore
from ...core.db import get_db_connection
from ...core.http_client import fetch as http_fetch
from ...core.intake import IntakeItem, IntakeStore, RecordResult
from ...core.markdown import MATH_CLOSE, MATH_OPEN
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
class QuestionMath:
    """What the math rebuild did to one question (Spec 13). Lives for the run; not stored."""

    number: int
    outcome: str  # recovered, still_held, retypeset, kept or none
    reasons: list[str]
    detector_math: list[str]  # the first detector run's math details (the rules that held it)
    first_codes: list[str]  # every issue code of the first run
    issues_after: list[str]  # issue codes of the item as recorded


@dataclass
class ImportReport:
    paper: str  # "GATE 2026 CS-1"
    key: str = ""  # "gate/2026/cs/CS-1"
    edition: str = EDITION
    parsed: int = 0
    joined: int = 0
    mta: int = 0
    clean: int = 0  # questions with no issues
    held: list[tuple[int, list[str]]] = field(default_factory=list)  # (number, issue codes)
    join_gaps: list[str] = field(default_factory=list)
    maths: list[QuestionMath] = field(default_factory=list)
    held_by_issues: Counter = field(default_factory=Counter)  # "figure+layout" -> questions
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
                f"  intake: {r.inserted} new, {r.changed} changed ({r.waiting} waiting for "
                f"review to finish), {r.unchanged} unchanged; "
                + ", ".join(f"{n} {status}" for status, n in sorted(r.statuses.items()))
            )
        out += [f"  join gap: {gap}" for gap in self.join_gaps]
        out += [f"  held Q.{n}: {', '.join(codes)}" for n, codes in self.held]
        out += self._math_lines()
        if self.batch_id:
            out.append(f"  review batch: {self.batch_id} ({self.in_batch} questions)")
        elif self.recorded:
            out.append("  no new review batch: nothing ready that isn't already in review")
        return out


    def _math_lines(self) -> list[str]:
        if not self.maths:
            return []
        flagged = [m for m in self.maths if m.detector_math]
        recovered = [m for m in flagged if m.outcome == "recovered"]
        still = [m for m in flagged if m.outcome == "still_held"]
        typeset = [m for m in self.maths if m.outcome == "retypeset"]
        kept = [m for m in self.maths if m.outcome == "kept"]
        out = [
            f"  math: {len(flagged)} held for math before the rebuild; {len(recovered)} recovered, "
            f"{len(still)} still held",
            f"  re-typeset: {len(typeset)} questions; {len(kept)} kept as they were",
        ]
        out += [f"  Q.{m.number} still held for math: {', '.join(m.reasons)}" for m in still]
        out += [f"  Q.{m.number} kept as is: {', '.join(m.reasons)}" for m in kept]
        return out

    def counts(self) -> dict:
        """The counts-only report of this paper (Decision 6); no question numbers or text."""
        flagged = [m for m in self.maths if m.detector_math]
        recovered = [m for m in flagged if m.outcome == "recovered"]
        still = [m for m in flagged if m.outcome == "still_held"]
        typeset = [m for m in self.maths if m.outcome == "retypeset"]
        kept = [m for m in self.maths if m.outcome == "kept"]
        data = {
            "paper_key": self.key,
            "edition": self.edition,
            "parser_version": PARSER_VERSION,
            "questions": self.parsed,
            "ready": self.clean,
            "held": len(self.held),
            "held_by_issues": dict(sorted(self.held_by_issues.items())),
            "math": {
                "flagged": len(flagged),
                "flagged_math_only": sum(1 for m in flagged if m.first_codes == ["math"]),
                "by_detector_rule": dict(
                    sorted(Counter(d for m in flagged for d in set(m.detector_math)).items())
                ),
                "recovered": len(recovered),
                "recovered_now_ready": sum(1 for m in recovered if not m.issues_after),
                "still_held": len(still),
                "still_held_by_reason": dict(
                    sorted(Counter(r for m in still for r in set(m.reasons)).items())
                ),
            },
            "retypeset": {
                "clean_with_math_runs": len(typeset) + len(kept),
                "retypeset": len(typeset),
                "kept": len(kept),
                "kept_by_reason": dict(
                    sorted(Counter(r for m in kept for r in set(m.reasons)).items())
                ),
            },
        }
        if data["math"]["recovered"] + data["math"]["still_held"] != data["math"]["flagged"]:
            raise ValueError("The math counts don't add up: recovered + still_held != flagged.")
        r = data["retypeset"]
        if r["retypeset"] + r["kept"] != r["clean_with_math_runs"]:
            raise ValueError("The re-typeset counts don't add up.")
        return data


def write_report(reports: list[ImportReport], directory: str | Path) -> list[Path]:
    """One counts-only JSON file per paper and edition, and a README summing them. Keys are sorted
    and the output stable, so a re-run with nothing changed produces no diff."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    written, rows = [], []
    for report in reports:
        if report.join_gaps or not report.key:
            continue  # an incomplete join has nothing to count
        data = report.counts()
        _, year, _, sitting = report.key.split("/")
        path = directory / f"{year}-{sitting}.{report.edition}.json"
        path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(path)
        rows.append((path.name, data))
    lines = [
        "# GATE math-recovery reports",
        "",
        "Counts only, written by `gate-import --report-dir` "
        "([Spec 13](../../../specs/13-math-recovery.md), Decision 6). No question numbers, text or "
        "symbols are committed.",
        "",
        "| Paper | Questions | Ready | Held | Held for math before | Recovered | Still held "
        "| Re-typeset | Kept as is |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    totals = Counter()
    for name, d in rows:
        cells = (
            d["questions"], d["ready"], d["held"], d["math"]["flagged"], d["math"]["recovered"],
            d["math"]["still_held"], d["retypeset"]["retypeset"], d["retypeset"]["kept"],
        )
        totals.update(dict(enumerate(cells)))
        lines.append(f"| [{name[: -len('.json')]}]({name}) | " + " | ".join(map(str, cells)) + " |")
    if rows:
        lines.append("| **All** | " + " | ".join(f"**{totals[i]}**" for i in range(8)) + " |")
    lines.append("")
    (directory / "README.md").write_text("\n".join(lines), encoding="utf-8")
    return written


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
    report = ImportReport(
        paper=f"GATE {paper.year} {paper.sitting}", key=paper_key(paper), edition=EDITION
    )

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
    for (question, _), item in zip(join.matched, items, strict=True):
        report.maths.append(
            QuestionMath(
                number=item.number,
                outcome=question.math_outcome,
                reasons=question.math_reasons,
                detector_math=question.detector_math,
                first_codes=question.first_codes,
                issues_after=sorted({issue.code for issue in item.issues}),
            )
        )
    for item in items:
        if item.issues:
            codes = sorted({issue.code for issue in item.issues})
            report.held.append((item.number, codes))
            report.held_by_issues["+".join(codes)] += 1
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
            intake_item_ids=[intake_item_id for intake_item_id, _ in ready],
        )
        report.in_batch = len(ready)
    return report


def _intake_item(question, key, paper, key_name, qp_sha, validate) -> IntakeItem:
    """The question as an intake item: its candidate, and every issue that holds it back."""
    issues = list(question.issues)
    try:
        normalized = to_normalized(question, key, paper, raw_artifact_sha256=qp_sha)
    except (GateNormalizeError, ValueError) as exc:
        # As much of the question as was read, so a later fix (Spec 9) can rebuild it.
        if isinstance(exc, GateNormalizeError):
            if not any(issue.code == "image_option" for issue in issues):
                issues.append(Issue("type_mismatch", str(exc)))
        else:  # a pydantic ValidationError: what was read isn't a valid question
            issues.append(Issue("invalid", str(exc)))
        candidate = {
            "number": question.number,
            "number_label": question.label,
            # The text as extracted: the rebuilt formulas' markers never leave the parser.
            "question_text": question.original_text,
            "options": question.original_options,
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
    dumped = json.dumps(candidate, ensure_ascii=False)
    if MATH_OPEN in dumped or MATH_CLOSE in dumped:
        raise ValueError(f"Q.{question.number}: a formula marker reached the candidate.")
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
