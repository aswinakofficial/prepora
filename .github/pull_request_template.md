<!-- Thanks for contributing! Keep the PR focused; small PRs review fastest. -->

## What and why

<!-- What does this change, and why? Link the issue it closes: -->
Closes #

## How I tested it

<!-- Commands you ran, and screenshots for UI changes. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (and `ruff`/`pytest` for Python changes)
- [ ] Schema changes include a generated migration (`pnpm db:generate`) and pass `pnpm db:check`
- [ ] **No scraped or third-party question content is committed** — fixtures use real markup with invented text ([content policy](../CONTRIBUTING.md#content-and-scraping-policy))
- [ ] No secrets (API keys, database URLs, passwords) in code, logs or screenshots
- [ ] Docs updated if behaviour changed
