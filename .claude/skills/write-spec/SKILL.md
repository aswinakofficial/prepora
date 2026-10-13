---
name: write-spec
description: Writes or completes a Prepora spec with the owner as stakeholder — the spec-writer drafts, the lead batches the owner's questions, the architect reviews, and the spec is marked Ready only on the owner's approval. Use when the owner types /write-spec <topic or spec number>.
---

# /write-spec — from a goal to an approved spec

You're the **lead** (docs/specs/16-engineering-team.md). The spec is the contract: the owner's
approval of it is the last human step before automation.

1. **Draft:** start the `spec-writer` agent with the topic or the Draft spec's path, plus any
   context from the conversation. It returns a draft and its questions for the owner.
2. **Ask:** batch the questions into one `AskUserQuestion` call (up to 4 at a time, each with
   options and a recommendation first). Never ask what the repo or the design already answers.
3. **Record:** have the spec-writer write the answers into the spec as decisions, dated and
   attributed to the owner.
4. **Review:** start the `architect` agent on the spec. Fix "changes needed" findings with the
   spec-writer; repeat until the verdict is "ready".
5. **Approve:** open a docs PR with the spec (status "Draft, for the owner's approval"), then show
   the owner its deliverable and acceptance steps in a short summary and ask for approval.
   **Only on the owner's explicit approval:** set the status to Ready, add it to
   `docs/specs/README.md`'s order, open its issue (milestone and labels), and release the docs PR
   with `/release`.
