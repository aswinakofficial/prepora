# Spec 15 · AI transcription for what the PDF can't give

**Status:** Draft. It's written in full when Spec 14 is merged.
**Milestone:** Finish GATE
**Depends on:** Specs 12–14
**Owner decision (2026-10-04):** auto-checked against the PDF, labelled, sampled (amends ADR-015).

## Context
What's left after Specs 13 and 14, about 30 pilot questions, is math mixed with tables or
side-by-side layouts, such as truth tables and pseudocode in two columns. These are transcribed by
Claude (vision) from the question's page image into Markdown and LaTeX. That runs only when the
global AI feature flag is on and `ANTHROPIC_API_KEY` is set.

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | Turn on the AI flag in Admin → Settings, and run the transcription job | Each remaining held question gets a transcription and a check result |
| 2 | Open Admin → Held questions | Each question shows as transcribed and auto-published, transcribed but needs review, or still held, with the reason |
| 3 | Open an auto-published transcription (for example a truth-table question) | It renders as a proper table with math, labelled "Transcribed from the official paper" |
| 4 | Open one that failed a check, in the review queue | It's shown side by side with its page image, and can be approved or rejected |
| 5 | Turn the AI flag off and run the job | Nothing is transcribed |

## Scope (to be detailed)
- **Auto-publishing gates:**
  - every word and number the PDF's own text contains for that question appears in the
    transcription;
  - an independent second pass agrees;
  - the Markdown renders with no KaTeX errors.

  Anything else goes to review. 5% of auto-published transcriptions are sampled for review.
- **Revision rows:** the result is stored as `question_revisions` with origin `ai_transcribed`,
  from knowledge-index §4a.
- **Cost:** the Message Batches API. Load the `claude-api` skill before writing the code.
