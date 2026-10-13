# Spec 16 · The engineering team: spec-driven, automated from spec to production

**Issue:** #83
**Milestone:** Engineering team
**Depends on:** #76 (mandatory UI acceptance testing), merged
**Production database:** no schema change. A release workflow gains the ability to migrate
production, set up by the owner (see Owner setup).
**Status:** Approved by the owner (2026-10-13); implemented, with the owner's one-time setup and the pilot (`/ship-spec 12`) to follow

## Context

Prepora is built **spec-driven**. The owner is the stakeholder and project manager: they decide
*what* and *why*, and answer questions. Everything else should be done by a team of agents, with
quality enforced by tools rather than trusted to intentions.

So far, one agent session has done everything (planning, coding, reviewing its own code, testing,
merging), and the owner has been the hands for anything touching production or the UI. Over this
project that cost:
- PRs waiting days for a manual UI sign-off;
- production migrations run by hand, one of them against the wrong database;
- a deploy that could race its own migration;
- the author reviewing its own code.

This spec turns that into a team (decisions from the owner, 2026-10-13):
- **Chat-driven.** The team works when the owner opens a session. The owner talks to one lead
  agent, and the lead runs the others.
- **Questions to the owner come in chat,** batched by the lead.
- **UI sign-off is automatic,** backed by evidence: screenshots and video of every acceptance step
  on the PR. The owner spot-checks whenever they like; they're no longer a gate.
- **Production migrations are automatic when they're safe** (checked by Squawk). Anything that
  drops, renames or rewrites data waits for the owner's one-click approval in GitHub.
- **Free and open-source tools** wherever possible.

**The workflow:** once the owner approves a spec, everything after it is automated: build, test,
independent review, evidence, migration, merge, deploy, post-deploy check, issue closure.

## Deliverable and UI acceptance

When this is done, the owner can run a spec from approval to production by asking in chat, and see
every step's evidence on GitHub. A step that can't be a browser test is checked once by hand, and
recorded in the PR with a screenshot or log.

| # | Step | Expected |
|---|---|---|
| 1 | In a Claude Code session in the repo, type `/next` | The lead names the next Ready spec from `docs/specs/README.md`, its issue, and what will happen; it starts nothing yet |
| 2 | Type `/write-spec <topic>` for a new piece of work | The lead asks the owner only stakeholder questions, batched; the spec writer drafts the spec with UI acceptance steps; the architect's check is noted; the spec is marked Ready only after the owner says "approved" |
| 3 | Type `/ship-spec 12` | Without further input, unless a real question arises: an issue is assigned, a branch and PR appear, and the PR has a filled Acceptance results table |
| 4 | Open that PR on GitHub | A review comment from the reviewer persona (not the builder), with every finding marked fixed or explained; an "Acceptance evidence" check whose summary lists each acceptance step with its screenshot and a downloadable video |
| 5 | Open the PR's checks | Required checks green, including Squawk (if the PR has a migration), CodeQL and accessibility (axe) |
| 6 | Wait for the release | If the PR has a safe migration, the Release workflow migrates production *before* merging (visible in Actions). It merges, then the post-deploy check reports the live site serving the new commit, healthy |
| 7 | Open the closed issue | A completion note (what changed, the PR, how it was verified); the board shows Done; the spec's status in `docs/specs/README.md` is updated |
| 8 | Create a test PR whose migration drops a column | Squawk flags it, and the Release workflow pauses at the `production-unsafe` environment, asking for the owner's approval |
| 9 | In a session, ask an agent to push to `main`, or to run a migration against the production database | The agent is blocked by a hook with a clear message; nothing happens |
| 10 | Open GitHub → Security, and the Pull requests list | CodeQL results, and Dependabot update PRs; Dependabot PRs go through the same gates |
| 11 | The site goes down (simulated in the check's own test) | Within the hour, the scheduled health check opens (or updates) an issue labelled `incident` |

## Scope

**In scope:**
- the personas, the workflows (skills) and the guardrails (hooks);
- an independent review;
- an evidence-producing test run;
- a release workflow (Squawk check, then migrate, then merge, then a post-deploy check);
- a scheduled health check;
- CodeQL, Dependabot, accessibility checks;
- the read-only Postgres MCP for local inspection;
- removing the `owner-verified` gate;
- documentation.

**Out of scope:**
- unattended agents (the owner chose chat-driven; the Agent SDK version is a later option);
- per-PR preview environments (not needed now that sign-off is automatic);
- moving media to a custom domain (#82).

## Decisions

### 1. The team: personas as Claude Code subagents
Each persona is a file `.claude/agents/<name>.md` (YAML frontmatter: `name`, `description`,
`tools`, `model`, then its instructions). Each runs in its own context and, for code work, its own
git worktree.

| Persona | Responsibility | Tools (enforced) | Model |
|---|---|---|---|
| **lead** (the main session; instructions in `CLAUDE.md` and the skills) | Only contact with the owner. Picks work from the spec order, dispatches personas, batches questions, reports. | All, but writes no product code by convention, and a hook blocks it from merging | Opus 5.5 |
| **spec-writer** | Drafts specs (template from Spec Kit's spec → plan → tasks, in our format), including UI acceptance. Lists questions for the lead. | Read, search, write under `docs/` only | Opus 5.5 |
| **source-researcher** | Exam-source dossiers: legitimacy, licence, formats, completeness across sources. | Read, web, write under `docs/sources/` only | Sonnet 5.5 |
| **architect** | Checks a spec against `docs/architecture/` and the ADRs before Ready; writes ADRs. | Read, search, write under `docs/adr/` and `docs/architecture/` only | Opus 5.5 |
| **builder** | Implements one Ready spec plus unit tests in its worktree; opens the PR; fixes review findings. | Read, write, Bash (repo), GitHub (no merge) | Sonnet 5.5 |
| **qa** | Writes the e2e tests from the **spec's acceptance steps** (not from the code), runs them, and produces the evidence. | Read; write under `tests/e2e/` only; Bash for tests | Sonnet 5.5 |
| **reviewer** | Independent review of the PR diff (`/code-review` at high), posted as a PR review comment; confirms each fix. | Read, search, GitHub comment only (no edits) | Opus 5.5 |
| **release** | Starts the Release workflow, watches it, writes completion notes, ticks epics, updates spec status. | GitHub and `scripts/team/*` only (no code edits) | Sonnet 5.5 |

**Why:**
- Opus handles judgement (specs, architecture, review); Sonnet handles volume (build, test,
  release), to keep cost down.
- The reviewer never writes code, and QA never writes product code, so each checks the others'
  work.

**What's enforced, and what's an instruction** (corrected during review):
- **Enforced:**
  - which tools each persona has, for example the reviewer has no `Edit` or `Write`;
  - the guardrail hook, for every persona;
  - the required checks and the Release workflow.
- **By instruction:** the path limits in the table ("under `docs/` only", "`tests/e2e/` only").
  Claude Code scopes tools per agent, not file paths per agent.
- **Backstop for the path limits:** the reviewer checks every PR's diff against the persona that
  made it, and CI checks the outcome (evidence, tests, Squawk).

### 2. Workflows as skills (`.claude/skills/<name>/SKILL.md`)
- **`/next`:** reads `docs/specs/README.md` and the issues, then reports the next Ready spec whose
  dependencies are merged, and anything waiting on the owner.
- **`/write-spec <topic>`:**
  1. spec-writer drafts;
  2. the lead batches the stakeholder questions to the owner;
  3. the answers are recorded in the spec;
  4. the architect checks it;
  5. the owner says "approved", and the spec is marked Ready and its issue opened.
- **`/research-source <source>`:** the source-researcher writes a dossier, and the lead brings any
  permission or licence decisions to the owner.
- **`/ship-spec <n>`:**
  1. assign the issue and branch;
  2. builder and qa run in parallel (qa works only from the spec);
  3. builder opens the PR;
  4. the reviewer reviews; the builder fixes; the reviewer confirms;
  5. qa runs the full e2e suite and the evidence;
  6. the PR body gets its Acceptance results;
  7. `/release`.

  Questions to the owner happen only when the spec is silent or wrong (the existing rule).
- **`/release <pr>`:** starts the Release workflow for a green PR and reports the result.

### 3. Guardrails as hooks (`.claude/settings.json`, scripts in `scripts/team/hooks/`)
A `PreToolUse` hook on Bash blocks, with a message saying why and what to do instead:
- `git push` to `main`, and `git push --force` to any branch other than the agent's own;
- `gh pr merge` and the merge API: merging happens only in the Release workflow;
- any command using the root `.env`'s `DATABASE_URL` for writing, or `db:migrate` / `db:push` /
  `psql` against a non-local host. Production is changed only by the Release workflow;
- `rm -rf` outside the scratch and worktree directories.

Read-only questions about production (counts, checks) go through `scripts/team/prod-read.sh`,
which connects with `default_transaction_read_only=on`.

### 4. Evidence instead of the owner's sign-off
- **Recording:** Playwright records `video: "on"` and `screenshot: "on"` for tests in
  `tests/e2e/acceptance/` (one file per spec, each test step named after its acceptance step).
  The core regression tests keep failure-only recording.
- **Publishing:** the CI job `E2E acceptance (Playwright)` uploads an `acceptance-evidence`
  artifact, and writes a job summary: one row per acceptance step with its result, screenshot
  thumbnail and video file name.
- **Linking:** the `PR acceptance` check requires the PR body's Acceptance results to link the
  evidence run.
- **The label gate goes:** `ui-change` stays as information, the `owner-verified` requirement is
  removed from `pr-acceptance.yml`, and `CLAUDE.md` is updated (owner decision, 2026-10-13).

### 5. Releases: migrate, then merge, then verify (`.github/workflows/release.yml`)
Merging to `main` deploys through Cloudflare Pages' own git integration, which stays as it is. So
the safe order is **migrate production before merging**. Our migrations are additive by rule,
which means the old code keeps working after the migration runs.

The Release workflow (`workflow_dispatch` with a PR number, started by the release persona):
1. **Verify the PR:** open, all required checks green, branch up to date.
2. **Find its migrations:** new files under `drizzle/` compared with `main`.
3. **Check them with Squawk** (OSS; `sbdchd/squawk-action`, configured for drizzle's SQL).
   - **Safe:** only adds tables, columns with defaults, or indexes. Run `pnpm db:migrate` against
     production (secret `PROD_DATABASE_URL`) in the environment `production-migrate`, which has
     no reviewers.
   - **Unsafe** (drop, rename, type change, a blocking index, a rewrite): the job runs in the
     environment `production-unsafe`, which **requires the owner's approval**; GitHub notifies
     them.
   - **Re-check:** after migrating, production's applied-migration count must equal the journal's.
     `pnpm db:check` checks only the journal, not a database, so it runs in CI instead.
   - **Data statements** (`DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, `RENAME`, and `DROP` other
     than `DROP DEFAULT`) are unsafe whatever Squawk says. Squawk checks schema changes, not data.
   - **Migrations run with `main`'s tooling** (package scripts, drizzle config, no install scripts)
     and only the PR's `drizzle/` files. A PR's own code never runs with the production database
     URL.
4. **Merge** the PR (merge commit).
5. **Post-deploy check:**
   - poll `https://prepora.xpar.in/api/health` (for up to 15 minutes) until it reports the merge
     commit (decision 6);
   - then run the read-only smoke suite `tests/smoke/` against production: home, an exam page, a
     question page, search;
   - it never submits answers or logs in.
6. **On failure:** open an `incident` issue with the logs. Nothing is rolled back automatically.
   The lead brings it to the owner with a proposed fix.

### 6. Health reports the commit
`/api/health` adds `commit`, the git SHA the build came from. Cloudflare Pages exposes it at build
time as `CF_PAGES_COMMIT_SHA`, injected through Vite's `define`. It's `null` in local builds.

### 7. Continuous checks (free for public repositories)
- **CodeQL:** `.github/workflows/codeql.yml`, JavaScript/TypeScript and Python. A required check.
- **Dependabot:** `.github/dependabot.yml`, weekly, for npm (root workspace), pip
  (`apps/pipeline`, `apps/scraper`) and GitHub Actions, with grouped minor and patch updates. Its
  PRs go through the same gates, except "Acceptance results recorded", which skips them (a version
  bump has no acceptance steps); the release persona releases the green ones.
- **Accessibility:** `@axe-core/playwright` checks every page the acceptance and core tests visit.
  Serious and critical violations fail; others are reported in the summary.
- **Health:** `.github/workflows/health.yml`, hourly. It's the read-only smoke suite against
  production. On failure it opens or updates one `incident` issue; on recovery it comments and
  closes it.
- **Lighthouse CI** (phone performance) and **knip** (unused code): report-only to begin with,
  made blocking once there's a baseline (follow-up issues).

### 8. Tools for the agents (MCP)
- **Kept:** Playwright MCP (driving the UI) and the GitHub MCP (issues, PRs, checks).
- **Added in `.mcp.json`:** a read-only Postgres MCP pointed **only at the local database**
  (`postgresql://…@127.0.0.1:5544/prepora_dev`), so the builder and qa can inspect data. It's
  never given the production URL.

### 9. What's borrowed, not adopted
- **GitHub Spec Kit** (MIT): its spec → plan → tasks structure informs the spec-writer's template,
  but our specs stay in `docs/specs`.
- **CCPM's** issues-as-source-of-truth and worktree-per-task ideas are already how we work.
- No third-party orchestrator: Claude Code's subagents, skills and hooks are supported and enough.
  Revisit if unattended runs are wanted.

## Changes

| Area | Files |
|---|---|
| Personas | `.claude/agents/{spec-writer,source-researcher,architect,builder,qa,reviewer,release}.md` |
| Workflows | `.claude/skills/{next,write-spec,research-source,ship-spec,release}/SKILL.md` |
| Guardrails | `.claude/settings.json` (hooks, permissions), `scripts/team/hooks/*.sh`, `scripts/team/prod-read.sh` |
| Tools | `.mcp.json` (read-only local Postgres MCP) |
| Evidence | `playwright.config.ts` (an acceptance project with video and screenshots), `tests/e2e/acceptance/`, `.github/workflows/ci.yml` (artifact and summary), `.github/workflows/pr-acceptance.yml` (evidence link; `owner-verified` gate removed) |
| Release | `.github/workflows/release.yml`, `tests/smoke/`, `apps/web/app.config.ts` + `app/ssr.tsx` (`commit` in health) |
| Continuous | `.github/workflows/{codeql,health}.yml`, `.github/dependabot.yml`, `@axe-core/playwright` in the e2e helpers |
| Docs | `CLAUDE.md` (the team, how to start it, new merge and release rules), `CONTRIBUTING.md` (how human contributors fit in), `docs/specs/README.md` (order), this spec |
| Labels | `incident`; `owner-verified` is retired |

The existing tests that move into `tests/e2e/acceptance/` keep their names, and the core regression
suite stays in `tests/e2e/`.

## Owner setup (outside the agents' reach, about 15 minutes, step by step in the PR)

1. **Three environments** (GitHub → Settings → Environments): `production-migrate` (no
   reviewers), `production-unsafe` (required reviewer: you) and `release` (no reviewers). In each,
   set **Deployment branches and tags → Selected branches → `main`**, so only `main`'s copy of the
   Release workflow can use their secrets: a branch with an edited workflow gets none.
2. **Secrets, as environment secrets, never repository secrets:**
   - `PROD_DATABASE_URL` in `production-migrate` and `production-unsafe`, so only the migrate jobs
     can read it;
   - `RELEASE_TOKEN` in `release`: a fine-grained personal access token for this repository only,
     with *Contents: read and write* and *Pull requests: read and write*. The merge step uses it
     rather than the built-in `GITHUB_TOKEN`, because GitHub doesn't start other workflows (the
     project board, the labels sync) from events the built-in token causes. The ruleset "Protect
     main" already allows merging when checks pass, so no bypass is needed.
3. **Enable Dependabot alerts and security updates** (Settings → Code security).
4. **Confirm Cloudflare Pages** deploys `main` from git (unchanged), and that `CF_PAGES_COMMIT_SHA`
   is available in its build (it is by default).

## Tests
- **E2e:**
  - `tests/e2e/acceptance/engineering-team.spec.ts` checks what's checkable in the browser: the
    evidence summary format.
  - The health `commit` field is unit-tested.
- **Hooks:** a script test feeds each blocked and each allowed command to the hook and checks the
  exit codes.
- **Release workflow:**
  - `act`-free: a dry-run mode (`dry_run: true`) runs every step except migrating and merging, on a
    test PR;
  - the unsafe-migration path is checked once with a throwaway PR whose migration drops a column
    (acceptance step 8), then closed unmerged.
- **The pilot:** Spec 12 shipped end to end with `/ship-spec 12` is this spec's real acceptance
  (steps 3–7).

## Acceptance results, how they're recorded
- Steps 1–3 and 9 happen in a session, recorded in the PR with transcript excerpts.
- Steps 4–8, 10 and 11 are recorded with links to the PR, the workflow run and the issue.

## Owner checkpoints
- **Approve this spec as a whole** (and say if a persona's model or tools should differ).
- **The owner setup above,** once.
- **Approve the throwaway unsafe migration** in step 8 when GitHub asks; it's the test of that
  gate. Then reject it.

## Risks
- **Agents can still be wrong in ways tests don't catch.** Mitigations: an independent reviewer,
  QA testing from the spec rather than the code, required checks, the post-deploy smoke test, and
  the owner's spot-checks with incident issues. The owner can reopen anything with an issue.
- **Cost:** Opus is used for judgement only; builds and tests use Sonnet. The lead reports the
  session's usage at the end of each shipped spec.
- **Migrate-before-merge** relies on migrations being additive. That's already the rule, and
  Squawk now enforces it; anything else needs the owner.
- **A production URL in GitHub secrets:** scoped to two environments, readable only by the Release
  workflow's migrate job. Agents never see it; the hooks block local use.
- **Chat-driven means work stops when the session ends.** Each persona leaves its state in GitHub
  (issue comments, PRs), so the next session resumes with `/next`.

## Decided during implementation (review of #85)

The independent review (the reviewer persona, run as a separate agent) found two high and five
medium issues. All are fixed:
1. **The guard's local-database check** is anchored to `DATABASE_URL=` in the same sub-command.
   `E2E_DATABASE_URL=…`, a local URL on another sub-command, or a comment no longer let a
   production migration through.
2. **Data statements are unsafe** in the Release workflow, before Squawk runs (decision 5).
3. **Migrations run with `main`'s tooling** and the PR's `drizzle/` only (decision 5).
4. **`release.sh` finds exactly the run it started,** through a request id in the run's name.
5. **The guard checks each line and sub-command on its own,** so a `git push` followed by a
   `gh pr create --base main` on the next line is no longer blocked. Pipes are split too.
6. **The evidence link** must be this repository's successful CI run for the PR's current head
   (checked through the API), and `N/A:` doesn't excuse filled-in rows.
7. **QA must use `acceptanceStep`,** and CI fails an acceptance step without a screenshot.

The lower-severity findings are fixed too:
- **Guard coverage:** `export … .env` and `xargs` are blocked, and so is `psql` against a non-local
  URL; `rm -rf` matches `~/`, `"$HOME"`, `-r -f` and the repository's own path.
- **The post-deploy wait** has curl timeouts, a 30-minute job limit and a check that the merge
  commit is known.
- **The evidence reporter** keeps only each test's last attempt.
- **Tool limits:** the spec now says which limits are enforced and which are instructions.

The guard's tests grew from 36 to 49 cases.

The re-review found one more medium issue and three low ones, all fixed:
- **The data-statement check** matched the `ON DELETE … ON UPDATE …` clause of every foreign key,
  so it held 10 of the 19 existing migrations, most of them additive. It's now
  `scripts/team/migration_data_check.py`, which checks each statement. It flags statements that
  start with DELETE, UPDATE, INSERT, TRUNCATE, COPY or MERGE (or a WITH holding one); DROP TABLE,
  SCHEMA, TYPE and VIEW; and an ALTER that drops a column or renames anything. DROP INDEX and DROP
  CONSTRAINT are left to Squawk. Of the existing migrations it flags only 0003's three column
  drops. The Release workflow runs main's copy of the checker and of `.squawk.toml`, so a PR can't
  loosen the checks on its own migrations. It has its own tests in CI.
- **The guard's repository path** was `scripts/`, not the repository root, so `rm -rf <repo>`
  wasn't blocked.
- **`psql` with a value read from `.env`** through `$(grep … .env | cut …)` is blocked; the check
  looks at the whole line.
- **Dependabot PRs** skip "Acceptance results recorded".

The third pass found that data changes inside procedural code (a `DO $$ … $$` block, a function
then `SELECT f()`) passed both checks. The checker now reads SQL token by token: a dollar-quoted
body, string or comment can't hide or split a statement. Any `DO`, `CALL`, `SELECT`, `PREPARE`, `EXECUTE`, function,
procedure, trigger or rule, or any dollar-quoted body, waits for the owner.

The guard has 53 cases and the migration checker 32.
