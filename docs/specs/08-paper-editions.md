# Spec 8 · Paper editions: several sources for one paper

**Status:** Draft. It's written in full when Spec 7 is merged.
**Depends on:** Spec 7
**Design:** [knowledge-index §4a](../architecture/knowledge-index.md), and §4 (attestations)

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
