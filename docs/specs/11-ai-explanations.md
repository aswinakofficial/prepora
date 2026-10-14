# Spec 11 · AI explanations: source first, AI otherwise

**Status:** Draft. It's written in full when Spec 10 is merged.
**Depends on:** Spec 10
**Design:** [ADR-015's amendment](../adr/015-ai-assistance.md) (owner decision, 2026-10-03)

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | With the `ai_explanations` flag off in Admin → Settings, run `explain` | Nothing is generated |
| 2 | Turn the flag on and run `explain --limit 20` on GATE questions without explanations | Each gets an explanation; ones passing every check are published, the rest wait in review |
| 3 | Reveal an auto-published one | It shows, labelled "AI-generated explanation · report an error", and its answer matches the official key |
| 4 | Run `explain` on an MS Learn question that has its own explanation | No AI call is made; the official explanation stays |
| 5 | Open the AI explanations page in Admin | Accuracy per subject, the sampled review queue, and any subject that fell back to review-only |

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
