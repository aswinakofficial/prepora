import { getDb } from "@prepora/db";
import { z } from "zod";
import { publicProcedure } from "../context.js";
import {
  ANALYTICS_EVENT_TYPES,
  getEventCountsByType,
  getPracticeFunnelStats,
  getSearchFailureStats,
  getTopViewedEntities,
  recordEvents,
} from "../lib/analytics.js";
import { adminProcedure } from "./admin.router.js";

// docs/roadmap/engineering-roadmap.md item 27: analyticsEvents was dead schema — this is the first
// thing that ever writes to it. `track` accepts a batch (the client is expected to buffer
// interactions and flush periodically, not fire one request per event — see
// apps/web/lib/analytics.ts) and attributes every event in the batch to either the signed-in
// caller or one anonymous sessionId, never both.

export const analyticsRouter = {
  track: publicProcedure
    .route({
      method: "POST",
      path: "/analytics/track",
      summary: "Record a batch of product analytics events",
    })
    .input(
      z.object({
        events: z
          .array(
            z.object({
              event: z.enum(ANALYTICS_EVENT_TYPES),
              entityType: z.string().optional(),
              entityId: z.string().optional(),
              meta: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .max(50),
        sessionId: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const db = getDb();
      return recordEvents(db, input.events, {
        userId: context.user?.id,
        sessionId: input.sessionId,
      });
    }),

  // Admin-protected: the real numbers behind the admin analytics dashboard.
  getSummary: adminProcedure
    .route({
      method: "GET",
      path: "/analytics/summary",
      summary: "Get aggregated product analytics for the admin dashboard",
    })
    .input(z.object({ sinceDays: z.number().default(30) }).optional())
    .handler(async ({ input }) => {
      const db = getDb();
      const sinceDays = input?.sinceDays ?? 30;

      const [eventCounts, searchFailures, practiceFunnel, topQuestions] = await Promise.all([
        getEventCountsByType(db, sinceDays),
        getSearchFailureStats(db, sinceDays),
        getPracticeFunnelStats(db, sinceDays),
        getTopViewedEntities(db, "question_view", "question", 10),
      ]);

      return { eventCounts, searchFailures, practiceFunnel, topQuestions, sinceDays };
    }),
};
