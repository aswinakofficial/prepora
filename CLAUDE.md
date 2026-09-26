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
