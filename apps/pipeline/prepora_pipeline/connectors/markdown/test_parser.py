"""
Contract and unit tests for the Markdown connector — docs/roadmap/engineering-roadmap.md item 22.

The contract test reads the two real example files directly from agents/content/examples/ rather
than a fixtures/ copy — those files *are* the canonical reference examples this connector must
parse correctly, and copying them would just create a second copy that could drift from the
original. No network access; no database needed for parsing/normalizing (publish_question() is
exercised separately in test_run.py, which does need one).
"""
from pathlib import Path

import pytest

from prepora_pipeline.contracts import McqAnswer, MultipleCorrectAnswer, TextAnswer

from .connector import discover, fetch
from .normalizer import normalize
from .parser import MarkdownParseError, parse_markdown

EXAMPLES_DIR = Path(__file__).resolve().parents[5] / "agents" / "content" / "examples"


def _read_example(name: str) -> str:
    return (EXAMPLES_DIR / name).read_text(encoding="utf-8")


class TestContractExampleFiles:
    def test_kpsc_example_parses_to_four_clean_questions(self):
        parsed = parse_markdown(_read_example("kpsc-ae-2025-civil.md"))

        assert parsed.frontmatter.id == "KPSC-AE-2025-CIVIL"
        assert parsed.frontmatter.organization == "kerala-psc"
        assert parsed.frontmatter.exam == "assistant-engineer"
        assert parsed.frontmatter.exam_variant == "civil"
        assert parsed.frontmatter.year == 2025
        assert parsed.frontmatter.subject == "civil-engineering"

        assert [q.number for q in parsed.questions] == [1, 2, 3, 4]
        assert all(not q.needs_review for q in parsed.questions)

        q1 = parsed.questions[0]
        assert q1.question_text == "What is the unit of modulus of elasticity?"
        assert q1.question_type == "mcq"
        assert q1.options == [("A", "N"), ("B", "N/mm²"), ("C", "mm/N"), ("D", "N/mm")]
        assert q1.answer == McqAnswer(correct_key="B")
        assert q1.topic == "Strength of Materials"

    def test_kpsc_example_question_3_has_tags(self):
        # docs/roadmap/engineering-roadmap.md item 22's own documented drift fix.
        parsed = parse_markdown(_read_example("kpsc-ae-2025-civil.md"))
        q3 = next(q for q in parsed.questions if q.number == 3)
        assert q3.tags == ["beam-design", "bending-moment", "udl"]

    def test_gate_example_parses_to_three_clean_questions(self):
        parsed = parse_markdown(_read_example("gate-cs-2024-algorithms.md"))

        assert parsed.frontmatter.exam == "gate"
        assert parsed.frontmatter.exam_variant == "computer-science"
        assert parsed.frontmatter.organization is None

        assert [q.number for q in parsed.questions] == [1, 2, 3]
        assert all(not q.needs_review for q in parsed.questions)
        assert parsed.questions[1].answer == McqAnswer(correct_key="B")

    def test_kpsc_example_normalizes_to_the_expected_normalized_question(self):
        parsed = parse_markdown(_read_example("kpsc-ae-2025-civil.md"))
        q1 = parsed.questions[0]

        normalized = normalize(
            parsed.frontmatter,
            q1,
            source_document="kpsc-ae-2025-civil.md",
            raw_artifact_sha256="a" * 64,
        )

        assert normalized.organization_slug == "kerala-psc"
        assert normalized.exam_slug == "assistant-engineer"
        assert normalized.exam_variant_slug == "civil"
        assert normalized.subject_slug == "civil-engineering"
        assert normalized.year == 2025
        assert normalized.number == 1
        assert normalized.question_type == "mcq"
        assert normalized.answer == McqAnswer(correct_key="B")
        assert normalized.topic_slug == "strength-of-materials"
        assert normalized.needs_review is False
        assert normalized.raw_artifact_sha256 == "a" * 64
        assert normalized.parser_version == "markdown-v1"

    def test_only_an_official_paper_is_labelled_with_an_official_key(self):
        parsed = parse_markdown(_read_example("kpsc-ae-2025-civil.md"))
        q1 = parsed.questions[0]

        def labels(source_type):
            frontmatter = parsed.frontmatter.model_copy(update={"source_type": source_type})
            n = normalize(frontmatter, q1, source_document="x.md")
            return n.answer_provenance, n.paper_kind

        assert labels("official") == ("official_final", "past_paper")
        assert labels("editorial") == ("reviewer", "model_paper")
        assert labels("user_submitted") == ("community", "model_paper")


class TestNoPhantomQuestionsBetweenHeadingsAndHr:
    # Regression test mirroring packages/content/src/parser.test.ts's — a real bug found while
    # building this connector (not one of item 22's own documented drifts): a blank line between a
    # trailing "---" and the next "# Question N" heading used to count as block content.
    def test_headings_with_trailing_hr_separators_produce_no_phantom_questions(self):
        md = (
            "---\nid: T\nexam: t\nexam_variant: t\nsubject: t\ntitle: T\n---\n"
            "# Question 1\n\nQ1?\n\n**Answer:** A\n\n---\n\n"
            "# Question 2\n\nQ2?\n\n**Answer:** B\n"
        )
        parsed = parse_markdown(md)
        assert [q.number for q in parsed.questions] == [1, 2]
        assert all(not q.needs_review for q in parsed.questions)


class TestFlagForHumanReviewQuarantines:
    def test_a_flagged_answer_quarantines_with_its_reason(self):
        md = (
            "---\nid: T\nexam: t\nexam_variant: t\nsubject: t\ntitle: T\n---\n"
            "# Question 1\n\nAn ambiguous question.\n\n"
            "**Answer:** FLAG FOR HUMAN REVIEW — multiple plausible answers\n"
        )
        parsed = parse_markdown(md)
        q = parsed.questions[0]
        assert q.needs_review is True
        assert q.review_note == "multiple plausible answers"
        assert q.answer is None


class TestAnswerTypes:
    def test_multiple_correct_answer(self):
        md = (
            "---\nid: T\nexam: t\nexam_variant: t\nsubject: t\ntitle: T\n---\n"
            "# Question 1\n\nWhich are true?\n\n- A. one\n- B. two\n- C. three\n\n"
            "**Answer:** A, C\n"
        )
        parsed = parse_markdown(md)
        assert parsed.questions[0].answer == MultipleCorrectAnswer(correct_keys=["A", "C"])

    def test_text_answer_fallback(self):
        md = (
            "---\nid: T\nexam: t\nexam_variant: t\nsubject: t\ntitle: T\n---\n"
            "# Question 1\n\nExplain something.\n\n**Answer:** free-form response\n"
        )
        parsed = parse_markdown(md)
        assert parsed.questions[0].answer == TextAnswer(answer="free-form response")


class TestFrontmatterValidation:
    def test_missing_required_field_raises(self):
        md = "---\nid: T\nexam_variant: t\nsubject: t\ntitle: T\n---\n# Question 1\n\nQ?\n"
        with pytest.raises(MarkdownParseError, match="exam"):
            parse_markdown(md)

    def test_no_frontmatter_raises(self):
        with pytest.raises(MarkdownParseError, match="frontmatter"):
            parse_markdown("# Question 1\n\nQ?\n")

    def test_no_questions_raises(self):
        md = "---\nid: T\nexam: t\nexam_variant: t\nsubject: t\ntitle: T\n---\nJust prose.\n"
        with pytest.raises(MarkdownParseError, match="No questions"):
            parse_markdown(md)


class TestDiscoverAndFetch:
    def test_discover_finds_every_md_file_recursively(self, tmp_path):
        (tmp_path / "a.md").write_text("a")
        nested = tmp_path / "sub"
        nested.mkdir()
        (nested / "b.md").write_text("b")
        (tmp_path / "c.txt").write_text("not markdown")

        found = discover(tmp_path)
        assert sorted(Path(p).name for p in found) == ["a.md", "b.md"]

    def test_discover_returns_empty_for_a_missing_directory(self, tmp_path):
        assert discover(tmp_path / "does-not-exist") == []

    def test_discover_excludes_readme_md(self, tmp_path):
        (tmp_path / "README.md").write_text("Place content here.")
        (tmp_path / "real-content.md").write_text("---\n---\n")
        found = discover(tmp_path)
        assert [Path(p).name for p in found] == ["real-content.md"]

    def test_fetch_reads_the_file_bytes(self, tmp_path):
        path = tmp_path / "q.md"
        path.write_text("hello", encoding="utf-8")
        assert fetch(str(path)) == b"hello"
