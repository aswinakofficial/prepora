"""
Contract tests for ms_learn_parser against Microsoft Learn assessment markup (fixtures/ms_learn/:
the <fieldset> of a question page with scripts stripped). The markup — tags, classes, attributes,
spacing — is exactly what Microsoft Learn serves, but every question, option, explanation and link
is invented, so the repository holds no real exam content. Two layouts are covered: unlabelled
(rationale paragraphs followed by reading links) and labelled ("Objective:" / "What This Item
Tests:" / "Additional Reading:" / "Rationale:" sections).
"""
from pathlib import Path

import pytest

from ms_learn_parser import MsLearnParseError, clean_link_title, parse_question_fieldset

FIXTURES = Path(__file__).parent / "fixtures" / "ms_learn"
ANSWERED = sorted(FIXTURES.glob("*-after.html"))


def parse(name: str):
    return parse_question_fieldset((FIXTURES / name).read_text())


def test_unlabelled_rationale_is_split_out_of_the_question():
    q = parse("unlabelled-q1-after.html")

    assert q.question_text == (
        "Your company runs a warehouse app named App1 on two servers in an on-premises "
        "datacenter.\n\n"
        "App1 stores barcode scans in a local database named DB1.\n\n"
        "You are adding a nightly export of DB1 to cloud storage.\n\n"
        "You need to ensure that the export can resume after a network failure. The solution must "
        "minimize the amount of custom code that you maintain\n\n"
        "What should you use?"
    )
    assert q.options == [
        "a managed transfer service with checkpointing",
        "a scheduled script that copies the whole database",
        "a manual export run by an operator",
        "an email-based file transfer",
    ]
    assert q.correct_options == ["a managed transfer service with checkpointing"]
    assert q.explanation == (
        "Rationale:\n"
        "A managed transfer service records checkpoints, so an interrupted export resumes from the "
        "last completed block.\n"
        "A scheduled script would work but must be written and maintained by your team. Manual and "
        "email-based transfers do not resume automatically.\n\n"
        "Additional Reading:\n"
        "Resumable transfers - Training\n"
        "Checkpoint configuration"
    )
    assert q.reading_links == [
        {
            "text": "Resumable transfers - Training",
            "url": "https://learn.microsoft.com/training/modules/example-resumable-transfers/",
        },
        {
            "text": "Checkpoint configuration",
            "url": "https://learn.microsoft.com/example/checkpoint-configuration"
            "#resume-after-failure",
        },
    ]


def test_labelled_rationale_sections_are_kept_in_order():
    q = parse("labelled-q1-after.html")

    assert q.correct_options == ["The assistant prioritized the data in the open worksheet."]
    assert q.explanation.split("\n\n")[0].startswith("Rationale:\nThe assistant uses the context")
    assert "\n\nObjective:\n1.1 Understand how AI assistants use context" in q.explanation
    assert "\n\nWhat This Item Tests:\nUnderstand how the context" in q.explanation
    assert q.explanation.endswith("Additional Reading:\nGrounding and context in AI assistants")
    assert q.reading_links == [
        {
            "text": "Grounding and context in AI assistants",
            "url": "https://learn.microsoft.com/example/assistant-grounding#grounding-and-context",
        }
    ]


def test_inline_emphasis_keeps_word_spacing():
    assert "does NOT reference industry averages" in parse("labelled-q1-after.html").question_text


def test_lists_in_the_question_stem_are_kept():
    # The old crawler read only <p> elements, silently dropping this list of resources.
    q = parse("unlabelled-q2-after.html")
    assert "- Queue1: Message queue in the North region" in q.question_text
    assert "- worker2: Background worker in the South region" in q.question_text


@pytest.mark.parametrize("fixture", ANSWERED, ids=lambda p: p.name)
def test_nothing_from_the_rationale_leaks_into_the_question(fixture):
    q = parse_question_fieldset(fixture.read_text())
    assert "Microsoft Learn" not in q.question_text
    assert "Rationale:" not in q.question_text
    for link in q.reading_links:
        assert link["text"] not in q.question_text
        assert link["url"].startswith("https://learn.microsoft.com/")
        assert not link["text"].endswith("Microsoft Learn")
    assert len(q.correct_options) >= 1
    assert set(q.correct_options) <= set(q.options)
    assert q.explanation and q.explanation.startswith("Rationale:\n")


def test_unrevealed_answer_is_refused_not_guessed():
    # Before "Check Your Answer" no option is marked correct. The old crawler fell back to the
    # first option as "the answer"; this must refuse instead.
    with pytest.raises(MsLearnParseError, match="No option is marked correct"):
        parse("unlabelled-q1-before.html")


def test_missing_options_are_refused_not_filled_in():
    html = (
        '<fieldset><div id="question-legend"><p>Q?</p></div>'
        '<label class="quiz-choice is-correct"><span class="radio-label-text">Only one</span>'
        "</label></fieldset>"
    )
    with pytest.raises(MsLearnParseError, match="at least two options"):
        parse_question_fieldset(html)


def test_multiple_correct_options_are_all_returned():
    html = (
        '<fieldset><div id="question-legend"><p>Pick two.</p></div>'
        '<label class="quiz-choice is-correct"><span class="checkbox-label-text">A</span></label>'
        '<label class="quiz-choice false"><span class="checkbox-label-text">B</span></label>'
        '<label class="quiz-choice is-correct"><span class="checkbox-label-text">C</span></label>'
        "</fieldset>"
    )
    assert parse_question_fieldset(html).correct_options == ["A", "C"]


def test_clean_link_title():
    assert clean_link_title("Azure virtual network traffic routing | Microsoft Learn") == (
        "Azure virtual network traffic routing"
    )
    assert clean_link_title("Plain title") == "Plain title"


def test_unlinked_page_titles_are_reading_not_rationale():
    # Seen live on Microsoft Learn: reading resources listed as plain-text page titles with no <a>.
    html = (
        '<fieldset><div id="question-legend"><p>Which routing method?</p></div>'
        '<label class="quiz-choice is-correct"><span class="radio-label-text">Performance</span>'
        '</label><label class="quiz-choice false"><span class="radio-label-text">Geographic'
        '</span></label><section id="rationale"><div>'
        "<p>Performance uses latency to the endpoint as the determining factor in routing.</p>"
        "<p>Azure Traffic Manager \u2013 traffic routing methods | Microsoft Learn</p>"
        "</div></section></fieldset>"
    )
    q = parse_question_fieldset(html)
    assert q.explanation == (
        "Rationale:\nPerformance uses latency to the endpoint as the determining factor in "
        "routing.\n\nAdditional Reading:\nAzure Traffic Manager \u2013 traffic routing methods"
    )
    assert q.reading_links == []  # no URL is invented for a title that had none


def test_images_are_returned_with_their_placement_never_dropped():
    html = (
        '<fieldset><div id="question-legend"><p>Refer to the exhibit.</p>'
        '<p><img src="/media/exhibit.png" alt="Network diagram"></p></div>'
        '<label class="quiz-choice is-correct"><span class="radio-label-text">'
        '<img src="https://learn.microsoft.com/opt-a.png" alt="Topology A"></span></label>'
        '<label class="quiz-choice false"><span class="radio-label-text">'
        '<img src="https://learn.microsoft.com/opt-b.png"></span></label>'
        '<section id="rationale"><div><p>Because of the peering.</p>'
        '<p><img src="https://learn.microsoft.com/why.png" alt="Why"></p></div></section>'
        "</fieldset>"
    )
    q = parse_question_fieldset(html)
    assert q.question_text == "Refer to the exhibit."
    # Image-only options get a label (alt text, else a positional one), never invented content.
    assert q.options == ["Topology A", "Option 2 (image)"]
    assert q.correct_options == ["Topology A"]
    assert [(i.placement, i.option_index, i.src, i.alt) for i in q.images] == [
        ("question", None, "https://learn.microsoft.com/media/exhibit.png", "Network diagram"),
        ("option", 0, "https://learn.microsoft.com/opt-a.png", "Topology A"),
        ("option", 1, "https://learn.microsoft.com/opt-b.png", ""),
        ("explanation", None, "https://learn.microsoft.com/why.png", "Why"),
    ]


def test_question_that_is_only_an_image_is_kept():
    html = (
        '<fieldset><div id="question-legend"><img src="https://learn.microsoft.com/q.png">'
        '</div><label class="quiz-choice is-correct"><span class="radio-label-text">Yes</span>'
        '</label><label class="quiz-choice false"><span class="radio-label-text">No</span>'
        "</label></fieldset>"
    )
    q = parse_question_fieldset(html)
    assert q.question_text == "(Question shown in image)"
    assert [i.placement for i in q.images] == ["question"]


@pytest.mark.parametrize("fixture", ANSWERED, ids=lambda p: p.name)
def test_fixture_questions_have_no_images(fixture):
    assert parse_question_fieldset(fixture.read_text()).images == []
