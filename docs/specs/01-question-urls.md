# Spec 1 · S0: Question URLs that work

**Issues:** #19 (fabricated question set), #34 (canonical question URLs), #26 (no-year lookup, superseded)
**Milestone:** S0 · Stable URLs
**Depends on:** nothing
**Production database:** yes, one migration (a unique index). Needs the owner's go-ahead before it's applied.
**Status:** implemented (PR for #34).

## Context

A question page's URL is `/questions/{exam}/{variant}/{year}/{subject}/{questionSlug}`
([route file](../../apps/web/app/routes/questions/%24examSlug.%24variantSlug.%24year.%24subjectSlug.%24questionSlug.tsx)).
Its lookup (`findPublishedQuestionByPath` in
[catalog-questions.ts](../../packages/api/src/lib/catalog-questions.ts)) filters `es.year = ${year}`.

On production, **all 2,516 published questions** (as of 2026-10-02) sit in a "Version 1" session
with **no year**. So:

- **Pages don't resolve:** no published question has a working detail page.
- **Links aren't rendered:** the search, topic, subject and question-set pages render question
  links only when `year != null`, so these questions have none.
- **The sitemap leaves them all out:** `getQuestionSitemapUrls` joins sessions and subjects and
  needs both.

Separately, the exam page invents a question set when an exam has none. It shows "{Exam} — Official
Assessment Set 01", tagged "MICROSOFT LEARN OFFICIAL", with a fake count of 5, and defaults the
organization to "Microsoft Learn". That breaks the project's first principle (nothing invented is
published).

## Decisions

1. **The canonical URL is `/questions/{questionSlug}`**, with no hierarchy in it.
   - `questions.slug` is already unique in practice: 2,516 distinct slugs for 2,516 rows.
   - Publishing sets it once, to `stable_content_id.lower()`, and never changes it.
   - So we **don't add the `publicId` column** the knowledge-index doc proposed. The existing slug
     is the public key; the doc is updated to match.
2. **Add a unique index on `questions.slug`** so collisions are impossible from now on.
3. **The old five-segment URL becomes a permanent (301) redirect** to `/questions/{questionSlug}`,
   using the last segment.
   - No database lookup is needed: if the slug doesn't exist, the new page shows its normal "not
     found" state.
   - **#26 is fixed by this** (the year is no longer used anywhere), so the PR also closes #26.
4. **The question page shows where the question appeared**: exam, question set, year or session
   label, and question number. It's built from its occurrences, so a question in several papers
   lists all of them.
5. **The page title and description come from the question text**, cut to 60 characters, not from
   the slug (slugs look like `ab-100-standard-v1-microsoft-certification-c0c4…`).

## Changes

### Database (`packages/db`)
- [`src/schema/questions.ts`](../../packages/db/src/schema/questions.ts): replace
  `index("questions_slug_idx").on(t.slug)` with `uniqueIndex("questions_slug_unique").on(t.slug)`.
- Run `pnpm db:generate` to produce the next migration (`drizzle/0017_*.sql`). It should contain only
  the index swap.
- `pnpm db:check` must pass.

### API (`packages/api`)
- **[`src/lib/catalog-questions.ts`](../../packages/api/src/lib/catalog-questions.ts):**
  - add `findPublishedQuestionBySlug(db, slug)` returning
    `{ id, topicName, occurrences: Array<{ examSlug, examName, questionSetSlug, questionSetTitle, year, sessionLabel, originalQuestionNumber }> }`,
    or `null` when there's no published question with that slug;
  - order occurrences by `es.year DESC NULLS LAST, o.created_at ASC`;
  - delete `findPublishedQuestionByPath`.
- **[`src/routers/questions.router.ts`](../../packages/api/src/routers/questions.router.ts):**
  - replace `getByPath` with `getBySlug`: `GET /questions/by-slug/{questionSlug}`, input
    `{ questionSlug: z.string().min(1) }`;
  - same response as today (`id`, `text`, `images`, `answerCount`, `options`, `topic`), plus
    `occurrences` from above;
  - keep the rule that options come back **without** correctness.
- **[`src/lib/sitemap.ts`](../../packages/api/src/lib/sitemap.ts), `getQuestionSitemapUrls`:**
  - select every published question (`SELECT slug, updated_at FROM questions WHERE status = 'published'`);
  - emit `${baseUrl}/questions/${slug}`;
  - remove the occurrence/session/subject joins and the "earliest occurrence" logic, along with the
    docstring paragraph explaining it.

### Web (`apps/web`)
- **New route `app/routes/questions/$questionSlug.tsx`:**
  - Move the page component from the old route file and switch it to `getBySlug`.
  - `head`:
    - the title is `{first 60 chars of question text} | Prepora`;
    - the canonical link is `/questions/{questionSlug}`;
    - breadcrumbs: Home → Exams → `{first occurrence's exam}` (`/exams/{examSlug}`) → `{question set}`
      (`/question-sets/{slug}`) → the question.

    If `head` can't see the loaded data, add a route `loader` that calls
    `context.queryClient.ensureQueryData(orpc.questions.getBySlug.queryOptions(...))` and read
    `loaderData` in `head`. Check how `__root.tsx` provides the query client before adding it.
  - Below the answer reveal, add an **"Appeared in"** list: one line per occurrence, e.g.
    "AB-100 · Official Microsoft Practice Assessment · Version 1 · Q12", each linking to its question
    set.
  - Keep the `question_view` analytics event and the submit/reveal behaviour unchanged.
- **Old route file** `app/routes/questions/$examSlug.$variantSlug.$year.$subjectSlug.$questionSlug.tsx`:
  - replace its body with a route whose `beforeLoad` throws
    `redirect({ to: "/questions/$questionSlug", params: { questionSlug }, statusCode: 301 })`;
  - no component;
  - keep a two-line comment saying why it exists (old links and sitemaps).
- **Routing check:** `/questions/$questionSlug` (one segment) and the old five-segment route must
  both match correctly. Test both URLs in the browser. If TanStack Router mis-matches them, use
  `/q/$questionSlug` instead and note it in the PR.
- **Links:** use `to="/questions/$questionSlug"` with `params={{ questionSlug }}` everywhere, and
  **remove the `year != null` (and subject) guards** that hide links:
  - `app/routes/search.tsx` (~line 175–200);
  - `app/routes/question-sets/$slug.tsx` (~line 104);
  - `app/routes/exams/$examSlug/subjects/$subjectSlug.tsx` (~line 117);
  - `app/routes/topics/$topicSlug.tsx` (~line 250).

  The API payloads behind those pages already include the question slug (`questionSlug`).
- **#19, `app/routes/exams/$examSlug/index.tsx` (~lines 47–60):**
  - delete the fabricated placeholder set and the `"Microsoft Learn"` organization fallback;
  - with zero sets, render an empty state: "No question sets published for this exam yet.";
  - show the organization only when the exam has one.
- `pnpm dev` regenerates `app/routeTree.gen.ts`. Commit the regenerated file.

## Tests
- **[`packages/api/src/lib/sitemap.test.ts`](../../packages/api/src/lib/sitemap.test.ts):** update
  the two question-URL expectations to `${BASE_URL}/questions/q1-${unique}`. Add a case: a published
  question in a session with **no year** and a set with **no subject** is included.
- **A new test for `findPublishedQuestionBySlug`:**
  - returns occurrences for a question in two sets;
  - returns `null` for a draft question and for an unknown slug.

  Put it in a new `catalog-questions.test.ts`, following `sitemap.test.ts`'s database pattern
  (requires `DATABASE_URL`, cleans up after itself).
- **E2E** ([`tests/e2e/item-24-real-data.spec.ts`](../../tests/e2e/item-24-real-data.spec.ts) and
  [`search.spec.ts`](../../tests/e2e/search.spec.ts)): update any five-segment URLs, and add an
  assertion that the old URL redirects to the new one.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm db:check`.

## Acceptance
- **Locally,** using a local database seeded with a no-year question set:
  - `/questions/{slug}` renders the question;
  - answering works;
  - "Appeared in" lists its set;
  - the old five-segment URL returns **301** to the new one.
- **Search, topic, subject and question-set pages** all link to questions, including no-year ones.
- **The sitemap** includes every published question.
- **An exam with no sets** shows the empty state, with no fabricated set or organization.

## Owner checkpoints
- **Before merging:** confirm a read-only duplicate check on production returns 0 rows:
  `SELECT slug, count(*) FROM questions GROUP BY slug HAVING count(*) > 1`.
- **After merging:** the owner (or Claude, with the owner's explicit go-ahead) runs
  `pnpm db:migrate` against production. The deploy works either way, since the index only adds a
  constraint.

## Decided during implementation

- **Page title.** This app has no route loaders or router context (pages fetch on the client), so
  `head()` can't see the question. `head()` sets a generic title and the canonical link; the
  component sets `document.title` from the question text once it loads and renders the
  BreadcrumbList JSON-LD inline — the same pattern the exam page already uses for data-dependent
  JSON-LD. Adding loaders app-wide is a separate change.
- **A fifth link site.** The header search modal
  (`app/components/search/SearchCommandModal.tsx`) also built five-segment URLs and hid links for
  year-less questions; it now links by slug too.
- **E2E runs.** `playwright.config.ts` starts the app on port 3000 with the root `.env`, which points
  at production — don't run the e2e suite that way. Point a throwaway config's `baseURL` at a local
  dev server started with the local `DATABASE_URL` instead.

## Risks
- **Two routes sharing a dynamic first segment** may conflict in TanStack Router. Covered by the
  routing check above, with a fallback prefix.
- **Old URLs were never in a sitemap** (the year filter excluded them all), so the SEO cost of
  changing the URL shape is close to zero. The redirect is for any shared links.
