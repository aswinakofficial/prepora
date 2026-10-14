<!-- Thanks for contributing! Keep the PR focused; small PRs review fastest. -->

## What and why

<!-- What does this change, and why? Link the issue it closes: -->
Closes #

## Acceptance results

<!--
Required (CI checks this section). Copy the spec's "Deliverable and UI acceptance" steps and record
how each was checked: the e2e test that covers it (tests/e2e/acceptance/…), or "by hand" with a
screenshot. Then add the evidence link: the CI run whose "Acceptance evidence" summary shows each
step's screenshot and video. For a change with nothing to see in the UI (docs, CI, a pure backend
fix), write one line instead: "N/A: <why>".
-->

| # | Step | Expected | Result | Checked by |
|---|---|---|---|---|
| 1 |  |  |  |  |

Evidence: https://github.com/aswinakofficial/prepora/actions/runs/<run id>

- [ ] Every step above passed, and the e2e tests run in CI (`E2E acceptance (Playwright)`)

## Verify it yourself

<!-- The owner's steps to try it locally, e.g. which page to open and what to click. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (and `ruff`/`pytest` for Python changes)
- [ ] Schema changes include a generated migration (`pnpm db:generate`) and pass `pnpm db:check`
- [ ] **No scraped or third-party question content is committed** — fixtures use real markup with invented text ([content policy](../CONTRIBUTING.md#content-and-scraping-policy))
- [ ] No secrets (API keys, database URLs, passwords) in code, logs or screenshots
- [ ] Docs updated if behaviour changed
