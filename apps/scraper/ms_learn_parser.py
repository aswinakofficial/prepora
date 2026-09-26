"""
Parses one Microsoft Learn practice-assessment question from its rendered <fieldset> HTML.

Kept free of Playwright so it can be tested against real captured pages
(fixtures/ms_learn/*.html) — the crawler (ms_learn_catalog_crawler.py) only drives the browser
and hands the fieldset's outerHTML to parse_question_fieldset().

Every assessment renders the same structure:

    fieldset
      #question-legend          the question stem (paragraphs, sometimes a list or table)
      label.quiz-choice         one per option; the correct one(s) gain `is-correct` once
                                "Check Your Answer" has been clicked
      section#rationale         the explanation and reading links — present in the DOM (hidden)
                                even before the answer is checked

What differs is only what's inside #rationale. Some exams (the AB-* ones) use labelled sections
("Objective:", "What This Item Tests:", "Additional Reading:", "Rationale:"); others (the AZ-*
ones) are plain paragraphs followed by links. The crawler previously took every <p> in the
fieldset as the question — so an unlabelled rationale and its link titles ("... | Microsoft
Learn") ended up inside the question text — and looked for the rationale by a class it doesn't
have, leaving a placeholder explanation. Reading structure instead of text labels handles both.

Images are never dropped: every <img> in the stem, an option or the rationale is returned in
ParsedQuestion.images with where it appeared, for the crawler to download and store. An option
that is only an image gets its alt text (or "Option N (image)") as its text label.

Nothing is ever invented: a question with no stem, fewer than two options, or no identified
correct answer raises MsLearnParseError rather than being filled in with placeholders.
"""
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

BASE_URL = "https://learn.microsoft.com"

# Section labels as they appear in labelled rationales, in the order the explanation lists them.
_SECTION_ORDER = ["Rationale", "Objective", "What This Item Tests", "Additional Reading"]
_TITLE_SUFFIX = re.compile(r"\s*\|\s*Microsoft Learn\s*$", re.I)
# Some questions list their reading as plain-text page titles rather than links.
_UNLINKED_TITLE = re.compile(r"\|\s*Microsoft Learn\s*$", re.I)


class MsLearnParseError(ValueError):
    pass


@dataclass
class ParsedImage:
    placement: str  # "question" | "option" | "explanation"
    src: str  # absolute http(s) URL, or a data: URI
    alt: str
    option_index: int | None = None  # 0-based, for placement == "option"


@dataclass
class ParsedQuestion:
    question_text: str
    options: list[str]
    correct_options: list[str]
    explanation: str | None
    reading_links: list[dict] = field(default_factory=list)
    images: list[ParsedImage] = field(default_factory=list)


def _text(el) -> str:
    return " ".join(el.get_text().split())


def _block_text(el: Tag) -> list[str]:
    """Readable lines for one block-level element of the question stem."""
    if el.name in ("ul", "ol"):
        return [f"- {_text(li)}" for li in el.find_all("li", recursive=False) if _text(li)]
    if el.name == "table":
        rows = []
        for tr in el.find_all("tr"):
            cells = [_text(c) for c in tr.find_all(["th", "td"])]
            if any(cells):
                rows.append(" · ".join(cells))
        return rows
    text = _text(el)
    return [text] if text else []


def _stem_text(legend: Tag) -> str:
    blocks: list[str] = []
    for child in legend.children:
        if isinstance(child, NavigableString):
            if child.strip():
                blocks.append(" ".join(child.split()))
        elif isinstance(child, Tag):
            lines = _block_text(child)
            if lines:
                blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _images_in(el: Tag, placement: str, option_index: int | None = None) -> list[ParsedImage]:
    images = []
    for img in el.find_all("img"):
        raw = (img.get("src") or img.get("data-src") or "").strip()
        src = raw if raw.startswith("data:image/") else _absolute_url(raw) if raw else None
        if src:
            alt = " ".join((img.get("alt") or "").split())
            images.append(ParsedImage(placement, src, alt, option_index))
    return images


def clean_link_title(title: str) -> str:
    """Drops the " | Microsoft Learn" page-title suffix Microsoft puts on every linked page."""
    return _TITLE_SUFFIX.sub("", " ".join(title.split()))


def _absolute_url(href: str) -> str | None:
    href = href.strip()
    if href.startswith("/"):
        href = BASE_URL + href
    return href if re.match(r"^https?://", href, re.I) else None


def _section_label(p: Tag) -> str | None:
    """A labelled-rationale heading: a paragraph that is just "<strong>Label:</strong>"."""
    strong = p.find("strong")
    text = _text(p)
    if strong and text == _text(strong) and text.endswith(":"):
        return text[:-1].strip()
    return None


def _parse_rationale(section: Tag | None) -> tuple[str | None, list[dict]]:
    if section is None:
        return None, []

    sections: dict[str, list[str]] = {}
    order: list[str] = []
    links: list[dict] = []
    unlinked_titles: list[str] = []
    current = "Rationale"  # unlabelled paragraphs are the rationale itself

    for p in section.find_all("p"):
        label = _section_label(p)
        if label:
            current = label
            continue
        anchors = [a for a in p.find_all("a", href=True) if _absolute_url(a["href"])]
        for a in anchors:
            title = clean_link_title(_text(a))
            url = _absolute_url(a["href"])
            if title and not any(link["url"] == url for link in links):
                links.append({"text": title, "url": url})
        # A paragraph that is only link(s) belongs in Additional Reading, not the prose.
        if anchors and _text(p) == " ".join(_text(a) for a in anchors):
            continue
        text = _text(p)
        if text and _UNLINKED_TITLE.search(text):
            # A page title with no link: a reading resource, never part of the rationale — and
            # no URL is made up for it.
            unlinked_titles.append(clean_link_title(text))
            continue
        if text:
            if current not in sections:
                order.append(current)
            sections.setdefault(current, []).append(text)

    reading = [link["text"] for link in links]
    reading += [t for t in unlinked_titles if t and t not in reading]
    if reading:
        if "Additional Reading" not in sections:
            order.append("Additional Reading")
        sections["Additional Reading"] = reading

    ranked = sorted(order, key=lambda s: _SECTION_ORDER.index(s) if s in _SECTION_ORDER else 99)
    parts = [f"{label}:\n" + "\n".join(sections[label]) for label in ranked if sections.get(label)]
    return ("\n\n".join(parts) or None), links


def parse_question_fieldset(html: str) -> ParsedQuestion:
    soup = BeautifulSoup(html, "html.parser")
    fieldset = soup.find("fieldset") or soup

    legend = fieldset.select_one("#question-legend")
    question_text = _stem_text(legend) if legend else ""
    if not question_text and not (legend and legend.find("img")):
        raise MsLearnParseError("No question text found in #question-legend.")

    images = _images_in(legend, "question") if legend else []
    if not question_text and images:
        # Same rule as image-only options: a label, not content.
        question_text = images[0].alt or "(Question shown in image)"
    options: list[str] = []
    correct: list[str] = []
    for label in fieldset.select("label.quiz-choice"):
        text_el = label.select_one(".radio-label-text, .checkbox-label-text") or label
        option_images = _images_in(text_el, "option", len(options))
        text = _text(text_el)
        if not text and option_images:
            # An image-only option still needs a text label (answer matching and the contract
            # both key on it): its alt text, else a neutral positional label — never content.
            text = option_images[0].alt or f"Option {len(options) + 1} (image)"
        if not text or text in options:
            continue
        options.append(text)
        images.extend(option_images)
        if "is-correct" in (label.get("class") or []):
            correct.append(text)

    if len(options) < 2:
        raise MsLearnParseError(f"Expected at least two options, found {len(options)}.")
    if not correct:
        raise MsLearnParseError(
            "No option is marked correct — the answer wasn't revealed, so this question is skipped "
            "rather than guessed."
        )

    rationale = fieldset.select_one("section#rationale")
    explanation, links = _parse_rationale(rationale)
    if rationale is not None:
        images.extend(_images_in(rationale, "explanation"))
    return ParsedQuestion(question_text, options, correct, explanation, links, images)
