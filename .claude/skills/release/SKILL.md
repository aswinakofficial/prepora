---
name: release
description: Releases a reviewed, green Prepora PR (production migration from this machine when needed, then the Release workflow merges and checks the live site) and closes the loop. Use when the owner types /release <pr>, or at the end of /ship-spec and /write-spec.
---

# /release N — ship a green PR

You're the **lead**. Start the `release` agent with the PR number. It:
1. confirms the required checks, the reviewer's "approved" verdict (for code PRs), the acceptance
   results and an up-to-date branch;
2. if the PR adds migrations, runs `scripts/team/migrate-prod.sh N` (additive migrations only;
   local database first, then production);
3. runs `scripts/team/release.sh N` and watches the Release workflow;
4. after success, writes the completion notes, epic ticks and spec status.

**If `migrate-prod.sh` stops because a migration isn't additive,** tell the owner exactly what the
migration does (the checker's or Squawk's findings). If they agree, they run
`scripts/team/migrate-prod.sh N --allow-unsafe` themselves, and then the release continues. **If anything fails,** bring the failing step and the log excerpt to the owner, with a
proposed fix.
