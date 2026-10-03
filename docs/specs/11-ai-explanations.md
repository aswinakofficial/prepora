# Spec 11 · AI explanations: source first, AI otherwise

**Status:** Draft. It's written in full when Spec 10 is merged.
**Depends on:** Spec 10
**Design:** [ADR-015's amendment](../adr/015-ai-assistance.md) (owner decision, 2026-10-03)

## Scope (to be detailed)
- **One global switch, `ai_explanations`,** in `FEATURE_FLAGS` (`packages/api/src/shared.ts`).
  It's off by default, toggled on the admin Settings page and written to the audit log. There are
  no per-exam settings.
- **Per question, the system decides:**
  - if the question's own source has an explanation, use it, and make no AI call;
  - otherwise, with the flag on and `ANTHROPIC_API_KEY` set, the local job
    `prepora-pipeline explain [--limit]` writes one. It re-reads the flag before every batch.
- **Gates for auto-publishing, labelled "AI-generated explanation":**
  - the explanation's final answer equals the official key (inside the range for numeric
    answers);
  - an independent verifier (a different prompt and model) agrees;
  - static checks pass.

  If a gate fails, the explanation goes to the review queue.
- **An automatic safety net:**
  - calibration per subject against questions that already have source explanations;
  - 5% of auto-published explanations sampled for review;
  - error reports counted;
  - a subject crossing its error threshold falls back to review-only.
- **Cost:** the Message Batches API and prompt caching. Load the `claude-api` skill before writing
  the code.
