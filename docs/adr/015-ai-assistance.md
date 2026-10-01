# ADR-015: Optional AI assistance: suggested, flagged, confirmed

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

Many sources publish questions without answers: university papers, GATE 2019–20, model papers.
Others publish questions as images (JEE Main), scans (UPSC, Calicut, older Kerala PSC and GATE) or
legacy-font PDFs (Kerala PSC Malayalam). Topic tagging across hundreds of exams is too much manual
work.

The project's rule has been "never guess a missing answer" (`agents/content/rules.md`,
`docs/vision.md`). The quality gate (`stages/validate.py`) refuses any question without an answer,
and its docstring already anticipates "AI-assisted checks advise, they do not decide".

## Decision

Add an **optional** AI step using Claude (Anthropic API):

1. **Off by default.**
   - It runs only when `ANTHROPIC_API_KEY` is set, and only in the local pipeline, like scraping
     and publishing.
   - The key never reaches the deployed site.
   - Without the key, everything works as before: questions without official answers are held
     back.
2. **What it does:**
   - **suggests answers**, with reasoning and a confidence score, as `ai_suggested` answer claims
     ([ADR-014](014-multi-source-provenance.md));
   - **transcribes** images and scans into text and LaTeX, keeping the original image;
   - **proposes topic tags** against syllabus items.
3. **Nothing is published unconfirmed.**
   - Every AI output is flagged in the review queue and waits for an admin to confirm or correct
     it.
   - Confirmed answers become `ai_suggested_confirmed`, and the site keeps an **"AI-suggested,
     reviewed"** badge on them.
   - Transcriptions become `ai_transcribed_confirmed`.
4. **Measured before it's trusted.**
   - Answer suggestions are first evaluated against questions that have official keys (GATE,
     ISTQB), per subject.
   - They're enabled only for subjects that meet an accuracy threshold.
   - The results are published, in line with the vision's "honest about uncertainty".
5. **Disagreement means no suggestion.** Each question gets two independent runs. If they
   disagree, nothing is suggested and the question waits for a person.

## Consequences

- **The principle in `docs/vision.md` changes** from "never filled in with a guess" to "never
  published without an official key or a person's confirmation, and always labelled".
  `CONTRIBUTING.md` and `agents/content/rules.md` change with it.
- **Model choice** (Claude Opus or Sonnet for reasoning, a smaller model for tagging), prompts and
  costs are decided when the step is built (foundation step S3), with the prompt version recorded
  on every claim (`aiPromptVersion`).
- **Calibration data is a by-product:** GATE's and ISTQB's official keys double as an accuracy
  benchmark.
