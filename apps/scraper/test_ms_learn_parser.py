"""
Contract tests for ms_learn_parser against real captured Microsoft Learn assessment questions
(fixtures/ms_learn/, the <fieldset> of each page with scripts stripped). Two layouts are covered:
AZ-700 (unlabelled rationale followed by links) and AB-730 (labelled "Objective:" / "What This
Item Tests:" / "Additional Reading:" / "Rationale:" sections).
"""
from pathlib import Path

import pytest

from ms_learn_parser import MsLearnParseError, clean_link_title, parse_question_fieldset

FIXTURES = Path(__file__).parent / "fixtures" / "ms_learn"
ANSWERED = sorted(FIXTURES.glob("*-after.html"))


def parse(name: str):
    return parse_question_fieldset((FIXTURES / name).read_text())


def test_unlabelled_rationale_is_split_out_of_the_question():
    q = parse("az-700-q1-after.html")

    assert q.question_text == (
        "Your on-premises network and Azure subscription are connected via a Site-to-Site (S2S) "
        "VPN.\n\n"
        "You have an Azure Storage account named storage1 with a file share named share1.\n\n"
        "You are configuring a private endpoint for storage1.\n\n"
        "You need to ensure that the DNS name of storage1 will be resolvable to its private IP "
        "address from the on-premises network. The solution must minimize the effort of "
        "maintaining updates in case of private endpoint changes\n\n"
        "What should you configure?"
    )
    assert q.options == [
        "a DNS forwarder and an Azure Private DNS zone",
        "an Azure Private DNS zone linked to a virtual network",
        "an on-premises forward lookup zone",
        "an on-premises reverse lookup zone",
    ]
    assert q.correct_options == ["a DNS forwarder and an Azure Private DNS zone"]
    assert q.explanation == (
        "Rationale:\n"
        "A private DNS zone group creates an association between the private endpoint and the "
        "zone, so if the endpoint is deleted it will remove it from DNS.\n"
        "A forward lookup zone will work but needs to be updated manually for new endpoints or "
        "removals. A private DNS zone group will only work for Azure virtual machines.\n\n"
        "Additional Reading:\n"
        "Design and implement private access to Azure Services - Training\n"
        "Azure Private Endpoint DNS configuration"
    )
    assert q.reading_links == [
        {
            "text": "Design and implement private access to Azure Services - Training",
            "url": "https://learn.microsoft.com/training/modules/"
            "design-implement-private-access-to-azure-services/",
        },
        {
            "text": "Azure Private Endpoint DNS configuration",
            "url": "https://learn.microsoft.com/azure/private-link/private-endpoint-dns"
            "#on-premises-workloads-using-a-dns-forwarder",
        },
    ]


def test_labelled_rationale_sections_are_kept_in_order():
    q = parse("ab-730-q1-after.html")

    assert q.correct_options == ["Copilot prioritized the data in the current workbook."]
    assert q.explanation.split("\n\n")[0].startswith("Rationale:\nCopilot uses the context")
    assert "\n\nObjective:\n1.1 Understand generative AI capabilities" in q.explanation
    assert "\n\nWhat This Item Tests:\nUnderstand how the context" in q.explanation
    assert q.explanation.endswith("Additional Reading:\nApplication card: Microsoft 365 Copilot")
    assert q.reading_links == [
        {
            "text": "Application card: Microsoft 365 Copilot",
            "url": "https://learn.microsoft.com/en-us/microsoft-365/copilot/"
            "microsoft-365-copilot-application-card#grounding-and-context",
        }
    ]


def test_inline_emphasis_keeps_word_spacing():
    assert "does NOT reference industry benchmarks" in parse("ab-730-q1-after.html").question_text


def test_lists_in_the_question_stem_are_kept():
    # The old crawler read only <p> elements, silently dropping this list of resources.
    q = parse("az-700-q2-after.html")
    assert "- VNet1: Virtual network in the West Europe Azure region" in q.question_text
    assert "- SQL1: Azure SQL server in the UK West region" in q.question_text


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
        parse("az-700-q1-before.html")


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
    # Seen live on AZ-700: reading resources listed as plain-text page titles with no <a>.
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
def test_real_captured_questions_have_no_images(fixture):
    assert parse_question_fieldset(fixture.read_text()).images == []
