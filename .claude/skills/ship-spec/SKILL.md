---
name: ship-spec
description: Ships one Ready Prepora spec end to end with the engineering team — builder and QA in parallel, independent review and fixes, evidence, then release. Use when the owner types /ship-spec <n>. The owner is only asked if the spec turns out silent or wrong on a real decision.
---

# /ship-spec N — from an approved spec to production

You're the **lead** (docs/specs/16-engineering-team.md). The spec is approved; run the team
without asking the owner, unless a real decision comes up.

1. **Check it's ready:** `docs/specs/NN-*.md` has status Ready and its dependencies are Done
   (`/next`'s rules). If not, say why and stop.
2. **Build and test, in parallel:**
   - start the `builder` agent with the spec path and issue number. It branches, implements with
     unit tests, runs the checks, and opens the PR;
   - start the `qa` agent at the same time with the spec path. It writes
     `tests/e2e/acceptance/<NN>-*.spec.ts` from the acceptance steps. Once the PR exists, it
     commits the tests to the PR's branch and runs the full suite.
3. **Questions:** if either agent returns a question the spec doesn't answer, batch it to the owner
   (`AskUserQuestion`), record the answer in the spec on the PR's branch, and continue.
4. **Review:** start the `reviewer` agent on the PR. For each finding, the `builder` fixes it or
   explains; the reviewer re-reviews, until the verdict is "approved". Every fix is followed by QA
   re-running the suite.
5. **Evidence:** QA fills in the PR's Acceptance results with the CI evidence link once all
   required checks are green.
6. **Release:** run `/release <PR>`.
7. **Report to the owner, in five lines:** what shipped, the PR, the evidence link, review
   findings fixed, anything waiting on them.
