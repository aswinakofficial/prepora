# GATE connector

GATE's official question papers and answer keys, from the organizing institute's site
([dossier](../../../../../docs/sources/gate.md); pilot: [Spec 5](../../../../../docs/specs/05-gate-pilot.md)).

| File | What it does |
|---|---|
| `source.yaml` | The registry entry (`sync-sources`). Position identity: question N of a paper is fixed. |
| `catalog.py` | The papers to import, as a hand-written map. GATE's file naming is too irregular to guess. |
| `key_parser.py` | The answer-key table → `GateKeyRow` (MCQ/MSQ letters, NAT ranges, `MTA`). |
| `paper_parser.py` | The question paper → `GateQuestion`: stem (code fenced), options, marks heading, a crop region, and flags (`figure`, `math`, `layout`) when the text alone can't be trusted. It rebuilds each question's math (below). |
| `normalizer.py` | A question and its key row → `NormalizedQuestion` (parser `gate-2`). |
| `run.py` | `import_paper`: parse, join, intake, one review batch; `write_report` for the counts-only reports. |
| `testing.py` | `make_pdf`, `key_pdf` and `paper_page`: invented GATE-shaped PDFs for tests. |
| `e2e_math_paper.py` | The e2e fixture for Spec 13 (below). |

**Math rebuilt from the PDF** ([Spec 13](../../../../../docs/specs/13-math-recovery.md),
[ADR-016](../../../../../docs/adr/016-deterministic-rebuilds-are-parsing.md))
- `core/math_rebuild.py` turns sub- and superscripts, Symbol-font glyphs and every math-font run
  into LaTeX, from the PDF's own glyph positions and fonts. All or nothing per question: a rebuild
  the stage can't fully explain (a fraction, an overbar, a matrix or case split, a symbol outside
  `core/latex_symbols.json`) keeps the question's extracted text, and a question held for math
  stays held with the reason (an `Issue("math", …)`).
- `GATE_MATH` (`core/math_rebuild.py`) is measured on the four pilot papers (2026-10-16): scripts
  are 0.71 of the base (8.5pt in 12pt), centred 0.25-0.30 of the base off it (threshold 0.12);
  Word sets scripts within 2.5pt of the base, and a space is at least 2pt, so words closer than
  1.2pt are written together; fraction bars are 0.7-1.1pt thick and 7-35pt long (table borders
  are 42pt and longer); a lone bracket 1.3 times the body is a stretched bracket.
- Parser version `gate-2`. Re-running `gate-import` sends a changed published question back to
  review; approving it as "same question, use the new wording" keeps the old wording as a variant.

**Refreshing the report**
`gate-import --all-pilot --report-dir docs/sources/reports/gate`, on a fresh local database
(`scripts/dev-db.sh`, `create database …`, `pnpm db:migrate`, `sync-sources`). It writes one
counts-only JSON per paper and a README summing them; no question text is committed.

**The e2e fixture**
`python -m prepora_pipeline.connectors.gate.e2e_math_paper [--sitting E2E-abc123]` imports an
invented 7-question `GATE 2099` paper and prints `{"paper_key", "sitting", "title", "batch_id",
"lines"}` as JSON; `--cleanup` deletes year 2099's session and what hangs off it.

**What's special about GATE**
- Keys are separate PDFs, joined to the paper by question number.
- NAT answers are ranges (`4.24 to 4.26`, sometimes two joined by `OR`).
- `MTA` means marks to all: the question is published with no answer to score.
- MCQs carry negative marks (⅓ of the question's marks); MSQ and NAT don't.

Tests generate invented PDFs in GATE's layout; no real paper or key is committed.
