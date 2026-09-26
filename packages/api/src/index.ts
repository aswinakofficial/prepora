import { protectedProcedure, publicProcedure } from "./context.js";
import { adminRouter } from "./routers/admin.router.js";
import { analyticsRouter } from "./routers/analytics.router.js";
import { contributionsRouter } from "./routers/contributions.router.js";
import { examsRouter } from "./routers/exams.router.js";
import { featureFlagsRouter } from "./routers/feature-flags.router.js";
import { questionSetsRouter } from "./routers/question-sets.router.js";
import { questionsRouter } from "./routers/questions.router.js";
import { searchRouter } from "./routers/search.router.js";
import { subjectsRouter } from "./routers/subjects.router.js";
import { topicsRouter } from "./routers/topics.router.js";

export {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  type FeatureFlagKey,
} from "./lib/feature-flags.js";
export {
  WIPE_DATABASE_CONFIRMATION_PHRASE,
  WIPE_DATABASE_KEEP_TABLES,
} from "./routers/admin.router.js";

export const appRouter = {
  health: publicProcedure
    .route({
      method: "GET",
      path: "/health",
      summary: "Health Check",
    })
    .handler(() => {
      return { status: "ok", timestamp: new Date().toISOString() };
    }),

  me: protectedProcedure
    .route({
      method: "GET",
      path: "/me",
      summary: "Get Current User",
    })
    .handler(({ context }) => {
      return context.user;
    }),

  exams: examsRouter,
  featureFlags: featureFlagsRouter,
  questions: questionsRouter,
  search: searchRouter,
  admin: adminRouter,
  topics: topicsRouter,
  subjects: subjectsRouter,
  questionSets: questionSetsRouter,
  contributions: contributionsRouter,
  analytics: analyticsRouter,
};

export type AppRouter = typeof appRouter;
