import { ORPCError, os } from "@orpc/server";
import { resolveUserFromRequestHeaders } from "@prepora/auth";

export interface ORPCContext {
  reqHeaders: Headers;
  resHeaders?: Headers;
}

const base = os.$context<ORPCContext>();

export const publicProcedure = base.use(async ({ context, next }) => {
  const user = await resolveUserFromRequestHeaders(context.reqHeaders);

  return next({
    context: {
      ...context,
      user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
  if (!context.user) throw new ORPCError("UNAUTHORIZED");

  return next({
    context: {
      ...context,
      user: context.user,
    },
  });
});
