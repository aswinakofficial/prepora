# Dev fixtures

docs/roadmap/engineering-roadmap.md item 24 ("Retire the mock datasets") requires that any
hardcoded/placeholder data used for local development live in exactly one clearly-named location
that production code cannot import — this directory.

Anything under `apps/web/app/lib/dev-fixtures/` is for local development only (e.g. Storybook-style
previews, manual QA scratch data). It must never be imported from `apps/web/app/routes/**` —
`scripts/check-no-fixture-imports.ts` enforces this in `pnpm lint` and CI.

Routes must render real data from the database via `orpc`, with an honest empty state when there is
none. If a page needs sample data to look at during development, seed the real database instead of
importing a fixture into the route.
