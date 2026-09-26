# Data collection

docs/roadmap/engineering-roadmap.md item 27 requires this to be documented before shipping product
analytics. `SECURITY.md` doesn't exist yet in this repo (it's scoped to a separate, earlier roadmap
item covering reporting policy and scraping ethics) — this file is the "or a privacy note"
alternative the item itself allows, scoped only to what item 27 actually collects.

## What is collected

Every interaction below is written to `analytics_events` (`packages/db/src/schema/analytics.ts`)
via `packages/api/src/routers/analytics.router.ts`'s `track` procedure, batched client-side
(`apps/web/lib/analytics.ts`) rather than sent one request per interaction:

- `page_view` — the path navigated to
- `search` — the query text (via `meta`)
- `result_click` — which result type and id was clicked
- `question_view` — which question was viewed
- `answer_reveal` — which question's answer was checked
- `practice_start` / `practice_complete` — a practice session starting and finishing, with its
  final score and duration
- `contribution` — a community contribution being submitted

Each row also has an `event_type` and optional `entity_type`/`entity_id` (what the event was
about — a question, an exam, a practice session) and a free-form `meta` JSON field limited to what
each event type above lists — never more than that.

## What is not collected

No IP address, device fingerprint, or third-party tracking identifier is stored. No analytics
event includes question or search content beyond the query text itself and entity ids already
public in the product's own URLs.

## Anonymous vs. authenticated data

Every event is attributed to **exactly one** of:

- a signed-in user's real `userId`, or
- an anonymous, randomly generated `sessionId` (a UUID created once per browser and persisted in
  `localStorage`, the same mechanism `apps/web/lib/anonymous-session.ts` already uses for practice
  attempts — see item 25), stored **only** when there is no signed-in user.

The two are never combined on the same row: `packages/api/src/lib/analytics.ts`'s `recordEvents`
always nulls out the anonymous `sessionId` the moment a real `userId` is available, so a browser's
pre-sign-in anonymous activity can never be retroactively linked to the account it later signs into
through this table.

## Related, separately-documented tables

Two other tables predate this item and already follow the same anonymous/authenticated split
end to end — see their own roadmap items for detail:

- `attempts` / `practice_sessions` (item 25) — practice question attempts and session results.
- `search_queries` (item 23) — search queries and which result was clicked, used for search
  quality, not user profiling.
