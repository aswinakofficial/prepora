# GATE connector

GATE's official question papers and answer keys, from the organizing institute's site
([dossier](../../../../../docs/sources/gate.md); pilot: [Spec 5](../../../../../docs/specs/05-gate-pilot.md)).

| File | What it does |
|---|---|
| `source.yaml` | The registry entry (`sync-sources`). Position identity: question N of a paper is fixed. |
| `catalog.py` | The papers to import, as a hand-written map. GATE's file naming is too irregular to guess. |
| `key_parser.py` | The answer-key table → `GateKeyRow` (MCQ/MSQ letters, NAT ranges, `MTA`). |

**What's special about GATE**
- Keys are separate PDFs, joined to the paper by question number.
- NAT answers are ranges (`4.24 to 4.26`, sometimes two joined by `OR`).
- `MTA` means marks to all: the question is published with no answer to score.
- MCQs carry negative marks (⅓ of the question's marks); MSQ and NAT don't.

Tests generate invented PDFs in GATE's layout; no real paper or key is committed.
