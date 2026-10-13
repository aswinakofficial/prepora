---
name: next
description: Reports the next piece of work for Prepora's engineering team — the next Ready spec whose dependencies are merged, open PRs and their state, and anything waiting on the owner. Use when the owner types /next or asks "what's next".
---

# /next — what the team does next

You're the **lead** (docs/specs/16-engineering-team.md). Report; don't start work.

1. Read `docs/specs/README.md`'s order table. The next spec is the first row whose status is
   **Ready** and whose dependencies are **Done** (check the issues with `gh issue view`).
2. Check in-flight work: `gh pr list --state open` (each PR's checks with `gh pr checks`, and its
   labels), and issues labelled `incident` or `needs-owner`.
3. Reply, briefly:
   - **In flight:** each open PR, its state and what it's waiting on;
   - **Next:** the spec (number, title, issue), its deliverable in one line, and the command to
     start it (`/ship-spec N`). For a Draft spec, `/write-spec` comes first.
   - **Waiting on the owner:** questions, approvals (an unsafe migration), setup steps.
