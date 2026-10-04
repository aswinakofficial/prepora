# Spec 8 · Paper editions: several sources for one paper

**Status:** Draft. It's written in full when Spec 7 is merged.
**Depends on:** Spec 7
**Design:** [knowledge-index §4a](../architecture/knowledge-index.md), and §4 (attestations)

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | Import GATE CS 2022, 2023 and 2024 (official site) and 2014, 2016 and 2018 (Drive) | Admin → Held questions lists every paper, each with its edition |
| 2 | Open a question that appears in two sources | The question page says "Seen in 2 sources" |
| 3 | Compare a paper whose editions differ in quality | Each question's text comes from the cleaner edition; the other edition's items show as superseded |
| 4 | Open `docs/sources/reports/` in the repo | One committed report per paper (counts only), which CI compares on re-runs |

## Scope (to be detailed)
- **Editions in the catalog.** The GATE catalog becomes a list of *editions* per paper, each with a
  source, URLs, and a format profile:
  - the key in a separate PDF, or in the same file with page ranges (2014, 2016, 2018);
  - per-booklet-code keys (2012).
- **The importer parses every available edition.** It joins questions by paper and number, and
  takes each question's text from its cleanest edition: fewest issues, then source precedence.
  Other editions' items become `superseded`.
- **Attestations:** a minimal `question_sources` table ([ADR-014](../adr/014-multi-source-provenance.md)),
  one row per edition that carried a published question, so pages can say "seen in 2 sources".
- **First case:** GATE's IITG site plus the Drive folder.
  - `drive.google.com` and `drive.usercontent.google.com` are added to the `gate` source's allowed
    hosts, and the HTTP client handles Drive's large-file confirmation step.
  - New papers: 2014, 2016, 2018 and 2022–2024. They're text PDFs with keys, per
    [gate.md §3](../sources/gate.md).
- **A per-paper quality report** (counts only) is committed under `docs/sources/reports/`. CI
  compares a re-run against it to catch parser regressions.
