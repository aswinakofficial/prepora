# Spec 13 · Math recovery from the PDF

**Status:** Draft. It's written in full when Spec 12 is merged.
**Milestone:** Finish GATE
**Depends on:** Spec 12 (the Markdown and LaTeX format)
**Owner decision (2026-10-04):** PDF first, AI only for the rest.

## Context
52 of the 117 held pilot questions are held only for math, almost all of it sub- and superscripts
the text extraction flattened: "L 1" for L₁, "n 2" for n². The PDF still records each glyph's size
and position: a subscript is smaller and sits lower than its line, a superscript higher. So the
notation can be rebuilt deterministically as LaTeX, with no AI.

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | Re-run `gate-import --all-pilot` | The report shows math-only holds dropping from 52 toward 0; every recovered question is `ready` |
| 2 | Open Admin → Held questions | The "Math that didn't extract cleanly" count is down by the recovered number |
| 3 | Approve the batch, then open a recovered question (for example "Let L₁ and L₂ be two languages") | It reads L₁ and L₂ with real subscripts (Spec 12 rendering) |
| 4 | Open a recovered question with a superscript (for example 2³², Θ(n²)) | The superscript renders correctly |
| 5 | Open a question the rebuilder couldn't fix | It's still held, with its reason; nothing half-fixed is published |

## Scope (to be detailed)
- **`core/math_rebuild.py`:** rebuild sub- and superscripts from `Word.size` and baseline offsets,
  both inline (smaller font) and as separate rows just below their line. Symbol runs in a math font
  (Cambria Math) get wrapped in `$…$`.
- **Detector:** an issue clears only when the rebuild explains every flagged glyph. A partial
  rebuild leaves the question held.
- **A measured report** on the pilot papers, committed (counts only): recovered, still held, and
  why.
