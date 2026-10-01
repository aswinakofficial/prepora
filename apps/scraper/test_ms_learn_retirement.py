"""retirement_notice(): reading an MS Learn exam page's Warning box. The HTML here is invented, shaped
like the real pages' markup."""
from ms_learn_catalog_crawler import retirement_notice


def page(warning_text: str) -> str:
    return f"""<html><body><h1>Exam XY-100: Example Fundamentals</h1>
    <div class="WARNING"><p>Warning</p><p>{warning_text} <a href="#">Learn more</a>.</p></div>
    <p>This exam measures your ability to do things.</p></body></html>"""


def test_retired_and_replaced():
    html = page(
        "The certification requirements have changed. The XY-100 exam was retired on June 30, "
        "2026, and has been replaced by XY-101. To earn this certification, candidates must now "
        "pass XY-101."
    )
    assert retirement_notice(html) == (
        "The XY-100 exam was retired on June 30, 2026, and has been replaced by XY-101."
    )


def test_retired_without_date():
    assert retirement_notice(page("This exam and the renewal assessment are retired.")) == (
        "This exam and the renewal assessment are retired."
    )


def test_upcoming_retirement_is_not_retired():
    assert retirement_notice(page("This exam will be retired on March 31, 2027.")) is None


def test_no_warning_box():
    assert retirement_notice("<html><body><h1>Exam XY-200</h1><p>Retired topics.</p></body></html>") is None


def test_unrelated_warning():
    assert retirement_notice(page("The exam was updated on May 1, 2026.")) is None
