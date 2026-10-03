"""
A parsed GATE question plus its key row → a NormalizedQuestion (docs/specs/05-gate-pilot.md).

The current catalog model, not the S1 hierarchy: exam `gate`, variant = the paper code without its
sitting (`cs`), session = the year, shift = the sitting (`CS-1`). One subject per paper; General
Aptitude vs the discipline goes in `section`. GATE publishes no explanations.
"""
from prepora_pipeline.contracts import (
    McqAnswer,
    MultipleCorrectAnswer,
    NormalizedOption,
    NormalizedQuestion,
    NumericalAnswer,
)

from .catalog import PaperSpec
from .key_parser import GateKeyRow
from .paper_parser import GateQuestion

PARSER_VERSION = "gate-1"
SUBJECTS = {"CS": ("computer-science", "Computer Science and Information Technology")}
QUESTION_TYPES = {"MCQ": "mcq", "MSQ": "multiple_correct", "NAT": "numerical"}


class GateNormalizeError(ValueError):
    pass


def to_normalized(
    question: GateQuestion,
    key: GateKeyRow,
    paper: PaperSpec,
    *,
    raw_artifact_sha256: str | None = None,
) -> NormalizedQuestion:
    if question.number != key.number:
        raise GateNormalizeError(f"Q.{question.number} was joined to key row {key.number}.")
    if (key.qtype == "NAT") != (not question.options):
        raise GateNormalizeError(
            f"Q.{question.number}: the key says {key.qtype}, but the paper shows "
            f"{len(question.options)} options."
        )
    if any(not text for text in question.options.values()):
        raise GateNormalizeError(f"Q.{question.number} has an option with no text (an image).")
    subject_slug, _ = SUBJECTS[paper.paper]

    kind, value = key.answer
    answer_status = "scored"
    if kind == "mta":
        answer, answer_status = None, "marks_to_all"
    elif kind == "ranges":
        answer = NumericalAnswer(answer=key.raw_key, ranges=value)
    elif key.qtype == "MSQ":
        answer = MultipleCorrectAnswer(correct_keys=value)
    else:
        answer = McqAnswer(correct_key=value[0])

    return NormalizedQuestion(
        raw_artifact_sha256=raw_artifact_sha256,
        source_type="official",
        source_url=paper.qp_url,
        source_document=f"GATE {paper.year} {paper.sitting} question paper",
        organization_slug="ncb-gate",
        exam_slug="gate",
        exam_variant_slug=paper.paper.lower(),
        subject_slug=subject_slug,
        year=paper.year,
        shift=paper.sitting,
        question_set_title=f"GATE {paper.year} · {paper.sitting}",
        identity="position",
        number=question.number,
        number_label=question.label,
        section="GA" if key.section == "GA" else paper.paper,
        marks=float(key.marks),
        # Dossier §4: a wrong MCQ answer costs a third of its marks; MSQ and NAT cost nothing.
        negative_marks=key.marks / 3 if key.qtype == "MCQ" else 0.0,
        question_text=question.text,
        question_type=QUESTION_TYPES[key.qtype],
        options=[NormalizedOption(key=k, text=t) for k, t in sorted(question.options.items())],
        answer=answer,
        answer_status=answer_status,
        answer_provenance="official_final",
        paper_kind="past_paper",
        key_status="final",
        explanation=None,
        parser_version=PARSER_VERSION,
    )
