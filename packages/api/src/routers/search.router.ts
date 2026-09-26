import { getDb } from "@prepora/db";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import { recordSearchClick, runSearchAndLog } from "../search/run-search.js";

// docs/roadmap/engineering-roadmap.md item 23: the provider (search/postgres-provider.ts) is the
// only access path — this router, via runSearchAndLog, is a thin wrapper that calls it and logs
// to search_queries, never a second place with its own query logic.
export const searchRouter = {
  query: publicProcedure
    .route({
      method: "GET",
      path: "/search",
      summary: "Search questions, exams, and topics",
    })
    .input(
      z.object({
        q: z.string(),
        limit: z.number().int().positive().max(50).optional(),
      }),
    )
    // getDb() is called inside the handler, not at module scope: apps/web runs in a Cloudflare
    // Worker, which supplies DATABASE_URL as a per-request environment binding rather than at
    // import time (see packages/db/src/client.ts) — every other router in this package does the
    // same for the same reason.
    .handler(async ({ input, context }) => {
      return runSearchAndLog(getDb(), {
        q: input.q,
        limit: input.limit,
        userId: context.user?.id,
      });
    }),

  // Reports which result a user actually clicked, after query() already logged the search itself
  // — a separate call because the click happens later, once the user has seen the results.
  logClick: publicProcedure
    .route({
      method: "POST",
      path: "/search/click",
      summary: "Record which search result was clicked",
    })
    .input(
      z.object({
        searchQueryId: z.string(),
        resultId: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      await recordSearchClick(getDb(), input);
      return { success: true };
    }),
};
