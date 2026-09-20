# @prepora/content

The Prepora Markdown format spec and its TypeScript reference implementation
(`parsePreporaMarkdown`, `validateParsedQuestionSet`, `contentHash`, `findDuplicates`).

**This package is not the executing path.** As of
docs/roadmap/engineering-roadmap.md item 22, Markdown content is imported through
`apps/pipeline/prepora_pipeline/connectors/markdown/` (a Python port of `src/parser.ts`) — the same
pipeline every other source goes through, gated by the same validation, deduplication, and
publishing. This package stays in the repository for two reasons: `agents/content/schema.md`'s
format spec needs a canonical, tested reference implementation, and `scripts/validate-content.ts`,
`scripts/check-duplicates.ts`, and `scripts/content-report.ts` (authoring-time linting, not a write
path) still use it directly.

If you change the Markdown format's parsing rules, update both `src/parser.ts` here and
`apps/pipeline/prepora_pipeline/connectors/markdown/parser.py` — there is no code sharing between
the two, so keeping them in sync is a manual, deliberate step, not something a type system catches
for you.
