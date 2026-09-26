# indiabix

Multiple-choice question archives (civil engineering, aptitude, and other categories) at
[indiabix.com](https://www.indiabix.com).

- **Registry entry:** `source.yaml` in this directory (see docs/roadmap/engineering-roadmap.md
  item 14).
- **Auth required:** no.
- **Ported from:** `apps/scraper/handlers/indiabix.py` (still the live implementation until every
  handler has migrated — see `docs/connectors/README.md`).

## What's different from the original handler

The original handler scraped the "Answer: Option X" display text inside a loosely-matched
`bix-ans-option|flex-row` selector. Capturing this connector's fixture surfaced that IndiaBix
actually embeds the correct answer explicitly in a hidden input
(`<input class="jq-hdnakq" value="B">`), so `parser.py` reads that directly instead — a strictly
more reliable source of truth than parsing rendered text.

The original handler also padded any question with fewer than 2 usable options with fabricated
`"Option A"`/`"Option B"`/... placeholder text (visible in `handlers/indiabix.py`'s
`options if len(options) >= 2 else [...]` fallback). Some IndiaBix questions render their options
as images rather than text (typically ones involving formulas or diagrams) — `parser.py` skips
these entirely rather than inventing placeholder option text for them
(docs/architecture/prepora-next-level-plan.md finding #3).

The original handler's `discover_next_links()` returned *every* link on the page containing
`indiabix.com` — not pagination, just every internal link. `connector.py`'s `discover()` looks
specifically for the page's real "Next" control (an `<a>` whose text is exactly "Next", inside the
site's `page-item` pager).

## Fixture

`fixtures/strength_of_materials.html` is a real page —
https://www.indiabix.com/civil-engineering/strength-of-materials/ — captured via the raw artifact
store (item 12) on 2026-09-20. It has 5 questions on it: 3 have real text options, 2 render their
options as images. `test_parser.py` asserts both outcomes.

## Running the connector directly

```python
from prepora_pipeline.connectors.indiabix import connector, parser
from prepora_pipeline.connectors.indiabix.normalizer import normalize

content = connector.fetch("https://www.indiabix.com/civil-engineering/strength-of-materials/")
# ... wrap content in a RawArtifact via the artifact store (item 12), then:
extracted = parser.extract(content, artifact)
normalized = [normalize(q, exam_slug=..., exam_variant_slug=..., subject_slug=...) for q in extracted]
```
