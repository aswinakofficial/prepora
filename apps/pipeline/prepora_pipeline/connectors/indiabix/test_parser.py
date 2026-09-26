"""
Contract test for the IndiaBix connector — docs/roadmap/engineering-roadmap.md item 15.

fixtures/example_page.html keeps the real question and pagination markup of an IndiaBix listing
page (captured via the raw artifact store, item 12), with every question, option, answer and link
replaced by invented content, so the repository holds no third-party questions. It has 5
questions; 2 render their options as images (no text) and are expected to be skipped rather than
padded with fabricated placeholder options (docs/architecture/prepora-next-level-plan.md finding
#3) — a case the original capture revealed, preserved here.
"""
from datetime import datetime, timezone
from pathlib import Path

from prepora_pipeline.contracts import McqAnswer, NormalizedOption, RawArtifact

from . import connector, parser
from .normalizer import normalize

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "example_page.html"
FIXTURE_URL = "https://www.indiabix.com/civil-engineering/strength-of-materials/"
FIXTURE_SHA256 = "d8a2f97f739dd20917590262c270f5d81916bac36a0c90db38b9b51174791044"


def _load_fixture() -> tuple[bytes, RawArtifact]:
    content = FIXTURE_PATH.read_bytes()
    artifact = RawArtifact(
        sha256=FIXTURE_SHA256,
        source_slug="indiabix",
        source_url=FIXTURE_URL,
        fetched_at=datetime(2026, 9, 20, tzinfo=timezone.utc),
        content_type="text/html",
        storage_key=str(FIXTURE_PATH),
        http_status=200,
    )
    return content, artifact


def test_extract_finds_exactly_the_questions_with_real_text_options():
    content, artifact = _load_fixture()
    extracted = parser.extract(content, artifact)

    # 5 questions exist on the page; 2 render their options as images and must be skipped, not
    # padded with fabricated "Option A/B/C/D" text.
    assert len(extracted) == 3
    assert all(len(q.options) >= 2 for q in extracted)
    assert all(q.parser_version == parser.PARSER_VERSION for q in extracted)
    assert all(q.raw_artifact_sha256 == FIXTURE_SHA256 for q in extracted)


def test_extract_reads_the_answer_from_the_hidden_field_not_display_text():
    content, artifact = _load_fixture()
    extracted = parser.extract(content, artifact)

    joint_q = next(q for q in extracted if "lap joint" in q.question_text)
    assert joint_q.answer == "D"
    assert joint_q.options == [
        "first row",
        "second row",
        "middle row",
        "one bolt hole of the end row.",
    ]


def test_full_chain_produces_the_expected_normalized_question():
    """The contract test: fixture in, expected canonical shape out, asserted exactly."""
    content, artifact = _load_fixture()
    extracted = parser.extract(content, artifact)
    joint_extracted = next(q for q in extracted if "lap joint" in q.question_text)

    normalized = normalize(
        joint_extracted,
        exam_slug="ssc-je",
        exam_variant_slug="civil",
        subject_slug="strength-of-materials",
    )

    assert normalized.question_text == (
        "The first part of a lap joint to fail under tension is usually the section that passes "
        "through"
    )
    assert normalized.question_type == "mcq"
    assert normalized.options == [
        NormalizedOption(key="A", text="first row"),
        NormalizedOption(key="B", text="second row"),
        NormalizedOption(key="C", text="middle row"),
        NormalizedOption(key="D", text="one bolt hole of the end row."),
    ]
    assert normalized.answer == McqAnswer(correct_key="D")
    assert normalized.needs_review is False
    assert normalized.exam_slug == "ssc-je"
    assert normalized.subject_slug == "strength-of-materials"
    assert normalized.parser_version == parser.PARSER_VERSION


def test_discover_finds_the_next_page_link():
    content, _artifact = _load_fixture()
    next_links = connector.discover(content.decode("utf-8"), FIXTURE_URL)

    assert next_links == [
        "https://www.indiabix.com/civil-engineering/strength-of-materials/048002"
    ]


def test_discover_returns_empty_list_when_there_is_no_next_link():
    html_without_pagination = "<html><body><p>No pager here.</p></body></html>"
    assert connector.discover(html_without_pagination, FIXTURE_URL) == []
