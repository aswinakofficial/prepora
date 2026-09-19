import { protectedProcedure, publicProcedure } from "./context.js";
import { adminRouter } from "./routers/admin.router.js";
import { examsRouter } from "./routers/exams.router.js";
import { questionsRouter } from "./routers/questions.router.js";

export { WIPE_DATABASE_CONFIRMATION_PHRASE } from "./routers/admin.router.js";

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
  questions: questionsRouter,
  admin: adminRouter,
};

export type AppRouter = typeof appRouter;
