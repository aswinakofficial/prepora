# Agentic development workflow

This repo is set up so Claude can run the app, drive the UI, and read logs itself during a
debugging session — instead of relying on the user to relay terminal output and click things.

## Running the dev servers so logs are readable

If you (Claude) are debugging something live, start the dev servers yourself rather than asking
the user to paste console output from their own terminal:

```
mkdir -p .dev-logs
pnpm dev > .dev-logs/dev.log 2>&1
```

Run that via Bash with `run_in_background: true`, then read/tail `.dev-logs/dev.log` directly.
It carries the same `[WEB]`/`[PYTHON]`/`[PIPELINE]` prefixes `pnpm dev` (via `concurrently`)
always produces — `[PYTHON]` is the scraper (port 8000), `[PIPELINE]` is `apps/pipeline`'s own
FastAPI service (port 8001, `/publish` and `/dedupe/check` — the admin review queue's
approve/reject flow silently fails on every item without it, since `packages/api`'s
`fetchPipeline()` calls it directly). `.dev-logs/` is gitignored.

The Python scraper's own debug log is separately written to `/tmp/ms_learn_scraper.log`
regardless of who starts the process (see `apps/scraper/ms_learn_catalog_crawler.py`'s `log()`
helper) — read that too when debugging MS Learn scraping specifically. Note interactive Playwright
auth flows use bare `print()` in a couple of spots, which only reaches `.dev-logs/dev.log`, not
that file.

`uvicorn --reload` (the Python scraper) does not reliably pick up every code change — if scraper
behavior doesn't match the current source, restart the whole `pnpm dev` process rather than trusting
the reload.

## Driving the UI

This repo's `.mcp.json` configures the Playwright MCP server (`@playwright/mcp`), which gives
Claude direct browser tools — navigate, click, fill forms, read the accessibility tree, check
console/network output, screenshot — without writing a one-off script per task. Prefer those tools
over ad hoc Playwright scripts for interactive debugging; reserve `tests/e2e` (the project's actual
Playwright test suite, run via `pnpm test:e2e`) for durable, repeatable regression tests.

## Loop

1. Start the dev servers with output captured (above).
2. Use the Playwright MCP tools to reproduce the reported behavior.
3. Read `.dev-logs/dev.log` (and `/tmp/ms_learn_scraper.log` for scraper work) for the matching
   backend output.
4. Diagnose, fix, verify (typecheck/lint/tests as appropriate), and re-run the same UI steps to
   confirm before reporting done.

# The engineering team

Prepora is built **spec-driven** by a team of agents ([Spec 16](docs/specs/16-engineering-team.md)).
The owner is the stakeholder: they approve specs and answer questions. Everything after an approved
spec is automated, and enforced by tools rather than intentions.

- **The lead** is the main session. It's the only one that talks to the owner, picks the work and
  runs the others. It doesn't write product code.
- **The personas** live in `.claude/agents/`:
  - `spec-writer`, `source-researcher` and `architect` plan and design;
  - `builder` writes product code and unit tests;
  - `qa` writes the acceptance tests from the spec and produces the evidence;
  - `reviewer` does independent review and never edits;
  - `release` ships and records.
- **Commands** (`.claude/skills/`):
  - `/next`: what's next, and what's waiting on the owner;
  - `/write-spec <topic>`: a spec, with the owner's questions and approval;
  - `/research-source <source>`: a source dossier;
  - `/ship-spec <n>`: build, test, review, evidence and release, with no owner input unless the
    spec is silent or wrong;
  - `/release <pr>`: ship a green PR.
- **Guardrails** (`.claude/settings.json` and `scripts/team/hooks/guard_bash.py`, tested in CI)
  block, for every agent:
  - pushing to `main` and force-pushing;
  - merging any other way than the Release workflow;
  - loading `.env` (production);
  - database writes without the local database;
  - destructive `rm -rf`.

  Read-only production questions go through `scripts/team/prod-read.sh`.
- **Questions go to the owner in chat,** batched by the lead.

# Working agreements

These apply to every change, whichever model or person makes it.

## What to work on

- The order of work is [docs/specs/README.md](docs/specs/README.md). Take the next spec whose
  dependencies are merged; don't start a spec marked **Draft**.
- Implement what the spec says. If the spec is wrong or silent on a real decision, stop and ask the
  owner — don't invent the design. Record the answer in the spec in the same PR.
- **Deliverable first.** Before writing code, the spec has a "Deliverable and UI acceptance" section:
  what the owner will be able to see or do when it's done, as numbered steps in the UI, each with
  its expected result. A spec without one isn't ready to build.
- Keep scope to the spec's issue(s). Notice something else? Open (or suggest) a separate issue.

## Issue workflow (the board moves itself)

1. **Start:** assign the issue to the owner (`gh issue edit N --add-assignee aswinakofficial`) — the
   project board moves it to *In progress*.
2. **Branch** from up-to-date `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. **PR:** the description says `Closes #N` for every issue it finishes (this moves cards to
   *In review*), summarises what and why, and lists how it was tested. End PR bodies with the
   attribution line from the session's instructions.
4. **Review, test, then release.** No owner sign-off is needed (owner, 2026-10-13):
   - **Independent review:** the `reviewer` agent reviews every code PR (`/code-review` at
     `high`) and posts its findings on the PR. The author fixes every real finding, and the
     reviewer confirms. Add a short "Review" section to the PR description.
   - **Acceptance results with evidence:** every acceptance step, its result, the test that
     checked it, and the `Evidence:` link to the CI run whose summary shows each step's screenshot
     and video (see Testing). CI fails a PR without them.
   - **Release only through the Release workflow** (`/release N`, which runs
     `scripts/team/release.sh N`). It merges only when every required check is green and the
     branch is up to date (`gh api -X PUT repos/aswinakofficial/prepora/pulls/N/update-branch`
     first).
     - **Migrations:** it migrates production *before* merging, automatically when Squawk
       (`.squawk.toml`) finds every new migration safe; anything that drops, renames, retypes or
       rewrites data waits for the owner's approval in GitHub.
     - **After merging:** it waits for the live site to report the merge commit and smoke-tests
       it.
     - Agents never merge, or migrate production, any other way (the guardrails enforce it).
   - **Migrations only add things.** A new column comes with a default or is nullable, so the code
     already live keeps working once production is migrated ahead of the merge.
5. **After merge:** comment on each closed issue with a short completion note — what changed, the
   PR, how it was verified, and any follow-ups (opened as new issues). If the issue belongs to an
   epic, tick its checkbox in the epic's body. Update the spec's status in docs/specs/README.md.

## Testing (mandatory before merging)

- **Every spec's acceptance steps are e2e tests,** written by `qa` from the spec in
  `tests/e2e/acceptance/<NN>-*.spec.ts`:
  - one `acceptanceStep(page, "<n>. <step>", …)` per acceptance step (`tests/e2e/helpers/evidence.ts`);
  - `checkAccessibility(page)` on every page tested (`tests/e2e/helpers/a11y.ts`);
  - each test seeds its own rows with invented content, and cleans up.

  A step that truly can't be automated is done by hand, with a screenshot in the PR.
- **The core regression suite stays green:** browsing, the question page, practice, search, the
  admin review → publish flow, and contributions. A change that breaks it doesn't merge.
- **Run them locally** against a throwaway local database (never `.env`'s; the config refuses
  anything that isn't local):
  ```
  E2E_DATABASE_URL=$(bash scripts/dev-db.sh url) pnpm test:e2e
  ```
  It starts its own web app (port 3100) and pipeline service (port 8101), so dev servers on
  3000/8001 don't matter. CI runs the same suite on every PR (`E2E acceptance (Playwright)`), and
  that check is required.
- **Evidence:** CI records a screenshot per acceptance step and a video per acceptance test. The
  job summary's "Acceptance evidence" table lists them, and the files are in the run's
  `acceptance-evidence` artifact.
- **Record the results** in the PR's "Acceptance results" table: each step, its expected result,
  pass or fail, the test that checked it, and `Evidence: <CI run URL>`. Add "Verify it yourself"
  steps, so the owner can spot-check whenever they like.

## Checks before every PR

```
pnpm lint && pnpm typecheck && pnpm test          # with DATABASE_URL pointing at the LOCAL db for DB tests
E2E_DATABASE_URL=<local db url> pnpm test:e2e      # the UI acceptance suite (see Testing)
(cd apps/pipeline && venv/bin/ruff check . && venv/bin/pytest -q)
(cd apps/scraper && venv/bin/ruff check . && venv/bin/pytest -q)
pnpm db:check                                       # whenever packages/db or drizzle/ changed
```

Run DB-backed tests against the **local** database (`scripts/dev-db.sh start`; URL from
`scripts/dev-db.sh url`), never production. Python venvs are uv-managed Python 3.12
(`uv venv --python 3.12 venv && uv pip install --python venv/bin/python -r requirements.txt`).

## Production safety

- The root `.env` points at the **production** Neon database.
  - **Agents never change production directly.** Migrations happen in the Release workflow.
    Back-fills, deletes, `sync-sources`, imports and publishing need the owner's explicit
    go-ahead in the conversation, even if a spec says the step is needed.
  - **Read-only questions** go through `scripts/team/prod-read.sh`.
- **Merging to `main` deploys the site** (Cloudflare Pages). The Release workflow migrates first,
  then merges, then checks the live site.
- Scraping and publishing are local-only by design (`lib/local-only-services.ts`); don't weaken that.
- Never enter, print or commit credentials (API keys, tokens, database URLs). Secrets are set by the
  owner (`gh secret set …`, Cloudflare dashboard).

## Content policy

- The repo holds code only — no scraped or third-party question content. Test fixtures use real
  layouts with **invented** text (generate PDFs in tests rather than committing real ones).
- Use a source only as its dossier ([docs/sources](docs/sources/README.md)) and licence allow;
  reference-only sources may cross-check, never be displayed. Never use certification dump sites.
- Nothing invented is published; every answer records its provenance; AI output is optional,
  flagged and reviewer-confirmed ([ADR-015](docs/adr/015-ai-assistance.md)).
