---
name: release
description: Releases a reviewed, green Prepora PR through the Release workflow (Squawk, migrate, merge, post-deploy check) and closes the loop. Use when the owner types /release <pr>, or at the end of /ship-spec and /write-spec.
---

# /release N — ship a green PR

You're the **lead**. Start the `release` agent with the PR number. It:
1. confirms the required checks, the reviewer's "approved" verdict (for code PRs), the acceptance
   results and an up-to-date branch;
2. runs `scripts/team/release.sh N` and watches the Release workflow;
3. after success, writes the completion notes, epic ticks and spec status.

**If the run waits on the `production-unsafe` environment,** tell the owner exactly what the
migration does (Squawk's findings) and that they approve or reject it in GitHub → Actions → the
run. **If anything fails,** bring the failing step and the log excerpt to the owner, with a
proposed fix.
