"""
A corpus-wide duplicate scan (`pnpm check:duplicates`): the check publishing runs one question at a
time, run over every published question against every other, to confirm nothing got through —
duplicates published before a check existed, or while one had a gap.

Reports three kinds of finding:
- exact: the same question (wording, options and answer) published more than once. Should never
  exist; the command fails if any do.
- same wording, different options or answer: expected where a reviewer decided they're different
  questions, so it's listed for a look, not a failure.
- similar: wording at least --min-similarity alike (default 0.85, below the 0.9 publishing holds
  at) — mostly the template variants certification exams are full of ("Java" → Maven, ".NET" →
  NuGet), listed with whether their options and answers match so the real repeats stand out.
"""
from dataclasses import dataclass, field

from ..core.db import get_db_connection
from .fingerprint import AnswerShape, shape_of_published
from .normalize import normalize_question_text
from .profile import profile_for_url
from .similarity import similarity

TRIGRAM_CUTOFF = 0.3


@dataclass
class AuditQuestion:
    id: str
    text: str
    exams: list[str]


@dataclass
class AuditPair:
    a: AuditQuestion
    b: AuditQuestion
    similarity: float
    options_match: bool
    answer_match: bool


@dataclass
class AuditReport:
    total: int
    exact: list[list[AuditQuestion]] = field(default_factory=list)
    same_wording: list[list[AuditQuestion]] = field(default_factory=list)
    similar: list[AuditPair] = field(default_factory=list)


def run_audit(*, min_similarity: float = 0.85) -> AuditReport:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT q.id, q.question_text, "
                "COALESCE(array_agg(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL), '{}'), "
                "min(qs.source_url) "
                "FROM questions q "
                "LEFT JOIN question_occurrences o ON o.question_id = q.id "
                "LEFT JOIN question_sets qs ON qs.id = o.question_set_id "
                "LEFT JOIN exam_variants v ON v.id = qs.exam_variant_id "
                "LEFT JOIN exams e ON e.id = v.exam_id "
                "WHERE q.status = 'published' GROUP BY q.id"
            )
            rows = cur.fetchall()
            questions = {
                qid: AuditQuestion(qid, text, sorted(exams)) for qid, text, exams, _ in rows
            }
            source_url = {qid: url for qid, _, _, url in rows}
            shapes: dict[str, AnswerShape] = {}

            def shape(qid: str) -> AnswerShape:
                if qid not in shapes:
                    shapes[qid] = shape_of_published(cur, qid)
                return shapes[qid]

            report = AuditReport(total=len(questions))

            by_text: dict[str, list[str]] = {}
            for q in questions.values():
                by_text.setdefault(normalize_question_text(q.text), []).append(q.id)
            same_text = set()
            for ids in by_text.values():
                if len(ids) < 2:
                    continue
                same_text.update(ids)
                groups: list[list[str]] = []
                for qid in ids:
                    for group in groups:
                        if shape(group[0]).matches(shape(qid)):
                            group.append(qid)
                            break
                    else:
                        groups.append([qid])
                report.exact += [[questions[i] for i in g] for g in groups if len(g) > 1]
                if len(groups) > 1:
                    report.same_wording.append([questions[g[0]] for g in groups])

            # Candidate pairs from the trigram index, in one query, then scored like publishing
            # scores them (the source profile's comparison text, Levenshtein similarity).
            cur.execute("SET LOCAL pg_trgm.similarity_threshold = %s", (TRIGRAM_CUTOFF,))
            cur.execute(
                "SELECT a.id, b.id FROM questions a JOIN questions b "
                "ON a.id < b.id AND a.question_text %% b.question_text "
                "WHERE a.status = %s AND b.status = %s",
                ("published", "published"),
            )
            for a_id, b_id in cur.fetchall():
                if a_id in same_text and b_id in same_text and normalize_question_text(
                    questions[a_id].text
                ) == normalize_question_text(questions[b_id].text):
                    continue
                profile = profile_for_url(source_url[a_id])
                score = similarity(
                    profile.comparison_text(questions[a_id].text),
                    profile.comparison_text(questions[b_id].text),
                )
                if score >= min_similarity:
                    report.similar.append(
                        AuditPair(
                            questions[a_id],
                            questions[b_id],
                            score,
                            shape(a_id).options_match(shape(b_id)),
                            shape(a_id).answer_match(shape(b_id)),
                        )
                    )
            report.similar.sort(key=lambda p: -p.similarity)
            conn.rollback()
            return report
    finally:
        conn.close()


def format_report(report: AuditReport, *, min_similarity: float) -> str:
    def one_line(q: AuditQuestion) -> str:
        text = " ".join(q.text.split())
        where = f" [{'; '.join(q.exams)}]" if q.exams else ""
        return f"{text[:150]}{'…' if len(text) > 150 else ''}{where}  ({q.id})"

    lines = [f"Published questions checked: {report.total}", ""]
    lines.append(f"Exact duplicates (same wording, options and answer): {len(report.exact)}")
    for group in report.exact:
        lines += [f"  - {one_line(q)}" for q in group] + [""]
    lines.append(
        f"Same wording, different options or answer (reviewer-approved as different, or worth a "
        f"look): {len(report.same_wording)}"
    )
    for group in report.same_wording:
        lines += [f"  - {one_line(q)}" for q in group] + [""]
    lines.append(f"Similar wording (>= {min_similarity:.0%}): {len(report.similar)} pair(s)")
    for pair in report.similar:
        verdict = (
            "same options and answer — likely a repeat"
            if pair.options_match and pair.answer_match
            else "same answer, different options"
            if pair.answer_match
            else "different answer"
        )
        lines += [
            f"  {pair.similarity:.1%} · {verdict}",
            f"    A: {one_line(pair.a)}",
            f"    B: {one_line(pair.b)}",
        ]
    return "\n".join(lines)
