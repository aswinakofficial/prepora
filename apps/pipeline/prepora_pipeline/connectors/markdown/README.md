# markdown

Contributed/authored content in Prepora's own Markdown format (`agents/content/schema.md`) —
`content/**/*.md`. Unlike every other connector in this directory, there is no remote site behind
this one: it discovers local files and reads them.

- **Registry entry:** `source.yaml` in this directory (see docs/roadmap/engineering-roadmap.md
  item 14) — `base_url: file://content` is a placeholder to satisfy the schema, not a real
  allowlist entry; `fetch()` never calls `prepora_pipeline.core.http_client`.
- **Auth required:** no.
- **Ported from:** `packages/content/src/parser.ts`, which stays in the repository as the format
  spec and reference implementation — this connector is the executing path. Keep the two in sync
  by hand when the format changes; there is no code-sharing between TypeScript and Python here.
- **Replaces:** `scripts/import-content.ts`, deleted by this item — its canonical import path was a
  commented-out stub referencing an `importQuestionSet` function that never existed, so nothing
  written as Markdown ever actually reached the database before this connector.

## Why this connector's shape differs from a scraper connector

`docs/connectors/README.md`'s template assumes a connector's `parser.py` produces
`list[ExtractedQuestion]` — free-text options, an unresolved free-text answer — because that is
what a scraped HTML page actually gives you. Markdown was never ambiguous: `- B. some text` is
already a keyed option, and `**Answer:** B` is already an unambiguous mcq answer. Routing it
through `ExtractedQuestion`'s shape would mean discarding real option keys just to reconstruct them
positionally a line later, for no benefit. `parser.py` here produces `ParsedQuestion` objects whose
`answer` field is already a `NormalizedAnswer` (`McqAnswer`/`MultipleCorrectAnswer`/`TextAnswer`/
`NumericalAnswer`) — `normalizer.py`'s job shrinks to attaching frontmatter-derived catalog context
and slugifying `**Topic:**`, not resolving an answer at all.

`connector.py`'s `fetch()` reads a file instead of making an HTTP request, so none of
`prepora_pipeline.core.http_client`'s concerns (rate limiting, robots.txt, retries) apply. The
content hash every fetch goes through via the artifact store (item 12) still gives this source
change detection (item 17) for free — a file that hasn't changed hashes the same as last time
regardless of whether the bytes came from a socket or a local read.

`run.py` exists because this is (at the time of writing) the *only* connector with a full
discover → fetch → parse → normalize → publish orchestration wired up end to end, wrapped in the
durable job model (item 13) exactly like a scrape run — a Markdown import shows up in the admin
Pipeline view (item 21) the same way. A generic orchestrator covering every connector the same way
is later roadmap work, once more than one connector needs it; see `cli.py`'s own note.

## Two real bugs found while building this connector

**`**Tags:**` was specified in `agents/content/schema.md` but never parsed** — one of this item's
two documented drifts. Fixed in both `parser.ts` and this port.

**A file using both `# Question N` headings *and* a trailing `---` between them produced a phantom
empty, needs-review question between every real pair** — not a documented drift, a genuine bug
found by actually running `agents/content/examples/kpsc-ae-2025-civil.md` through the parser rather
than trusting only synthetic unit-test snippets. `agents/content/schema.md`'s own File Structure
example uses exactly this combination, so both real example files were affected. Fixed in both
`parser.ts` and this port — see the regression tests in each.

## Contract test fixtures

No `fixtures/` directory: the "real captured" fixtures for this connector are
`agents/content/examples/*.md` themselves — the canonical reference examples the format is defined
against — not a separate copy that could drift from them. `test_parser.py` reads them directly by
path.

## Running the connector directly

```python
from prepora_pipeline.connectors.markdown.run import run

results = run(content_dir="content")
for r in results:
    print(r.status, r.path, r.detail)
```

Or from the CLI: `python -m prepora_pipeline.cli import-markdown --content-dir content`.
