# Writing a connector

A connector is one directory under `apps/pipeline/prepora_pipeline/connectors/`. Adding a source
means adding one directory — no other file in the repo should need to change (see
docs/roadmap/engineering-roadmap.md item 15's "Done when").

This guide was written immediately after migrating the first connector (`indiabix`), while the
friction of doing it was still fresh — follow it in order.

## Layout

```
connectors/<name>/
  __init__.py
  source.yaml         # the registry entry (item 14) — static facts about this source
  connector.py         # discover(html, url) -> list[str]; fetch(url) -> bytes
  parser.py             # extract(content, artifact) -> list[ExtractedQuestion]
  normalizer.py        # normalize(extracted, ...) -> NormalizedQuestion
  fixtures/             # real captured responses, not synthetic HTML
  test_parser.py       # the contract test: fixture in, expected shape out, asserted exactly
  README.md             # what's in this directory and what's different from any prior handler
```

`<name>` is the same slug as the `name` field in `source.yaml` and the registry row it syncs to
(item 14) — keep them identical, or `get_source(name)` lookups from elsewhere in the pipeline won't
resolve.

## Step by step

**1. Read the existing handler, if one exists.** `apps/scraper/handlers/<name>.py` is what you're
migrating. Note its `domain_patterns` (becomes `source.yaml`'s `base_url`), its selectors, and
anything already implemented but dead — `discover_next_links()` exists on every handler and has
never been called by anything. You're about to make it real.

**2. Capture a real fixture — don't write synthetic HTML.** Use the artifact store (item 12) to
fetch and store a real page:

```python
import requests
from prepora_pipeline.core import FilesystemArtifactStore

resp = requests.get(url, headers={"User-Agent": "..."}, timeout=15)
store = FilesystemArtifactStore()
artifact = store.store(
    resp.content, source_slug="<name>", source_url=url,
    content_type="text/html", http_status=resp.status_code,
)
```

Copy the stored file (`artifact.storage_key`) into `connectors/<name>/fixtures/`. A real fixture is
what catches the site having actually changed shape since the handler was written — the indiabix
migration found the live page's CSS classes had partially drifted from what the original handler's
selectors expected, and that some questions render their options as images rather than text, which
only a real fixture reveals. A hand-written synthetic fixture would have hidden both.

**3. Write `parser.py`'s `extract()`.** Signature:
`extract(content: bytes, artifact: RawArtifact, *, exam_hint=None, subject_hint=None) ->
list[ExtractedQuestion]`. Port the original handler's selectors, but verify every one against the
real fixture rather than trusting the old code — it may have silently stopped matching anything
useful. **Never fabricate a placeholder for missing data** (a fake option, a guessed answer) — skip
the question instead (docs/architecture/prepora-next-level-plan.md finding #3). If the source
embeds the correct answer more reliably than its own display text (a hidden field, a data
attribute), prefer that — the indiabix migration found exactly this.

**4. Write `normalizer.py`'s `normalize()`.** Signature:
`normalize(extracted: ExtractedQuestion, *, exam_slug, exam_variant_slug, subject_slug) ->
NormalizedQuestion`. This is where `ExtractedQuestion`'s free-text options/answer become
`NormalizedQuestion`'s structured `{key, text}` options and discriminated-union answer
(docs/roadmap/engineering-roadmap.md item 11). Assign option keys in the order they appear on the
page. If the extracted answer doesn't resolve to a real option key, don't guess — set
`needs_review=True` with a `review_note` explaining why, and fall back to a `TextAnswer` carrying
the raw value.

**5. Write `connector.py`'s `discover()`.** Find the source's *actual* pagination control — a
"Next" link, a `rel="next"` anchor, numbered page links — using the real fixture. Do not return
every link on the page; that's not discovery, it's noise (this was the original
`discover_next_links()`'s bug on more than one handler).

**6. Write `connector.py`'s `fetch()`.** A direct HTTP GET behind
`prepora_pipeline.core.get_allowed_base_urls()` (item 14) is enough for now — a shared, polite HTTP
client with retries and rate limiting is item 16's job, not this step's. `fetch()` existing and
being independently callable is what makes this connector genuinely complete, even before it's
wired into the live trigger path.

**7. Write `test_parser.py` — the contract test.** Load the real fixture, run it through
`extract()` then `normalize()`, and assert the *exact* expected `NormalizedQuestion` fields for at
least one real question from the fixture — not just "some result came back non-empty." Also test:
the case(s) your parser deliberately skips (image-only options, missing answers, etc.), and
`discover()` against the same fixture's real pagination markup.

**8. Write this directory's `README.md`.** What's different from the original handler, and why —
future readers (including future you) need this more than they need a restatement of what the code
already says.

**9. Do not touch `apps/scraper/` or delete anything.** The old handler stays the live
implementation until every source has a connector — see item 15's own sequencing ("migrate the
five handlers one at a time... delete apps/scraper/ once the last handler has moved"). Wiring this
connector into the actual trigger path, and eventually retiring the old handler and
`apps/scraper/main.py`'s dispatch entirely, is a separate, later step once every source has moved.

**10. Confirm no file outside this directory changed.** If you touched anything else to make a
source work, that's a sign a piece of shared machinery is missing (add it to `core/`), not that
this connector needed a special case.

## What "Microsoft Learn last" means

`docs/roadmap/engineering-roadmap.md` item 15 explicitly calls out Microsoft Learn as the hardest
migration — Playwright automation plus an interactive, replayed authentication flow
(`docs/architecture/prepora-next-level-plan.md` risk R3). Migrate every source that's a plain HTTP
fetch first; that authenticated, browser-driven connector should be the last one, once the pattern
established by the simpler sources is solid.
