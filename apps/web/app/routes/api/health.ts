import { createFileRoute } from "@tanstack/react-router";
import { setAuth } from "../../lib/auth";

export const Route = (createFileRoute("/api/health" as any) as any)({
  server: {
    handlers: {
      GET: async (event: any) => {
        const request: Request = event?.request || event;
        const envSources = [
          event?.env,
          event?.context?.cloudflare?.env,
          event?.nativeEvent?.context?.cloudflare?.env,
          event?.event?.context?.cloudflare?.env,
          (request as any)?.env,
          (request as any)?.cf?.env,
          (globalThis as any)?.env,
          (globalThis as any)?.__env__,
          process.env,
        ];

        for (const src of envSources) {
          if (src && typeof src === "object") {
            setAuth(src);
          }
        }

        const envAudit = {
          NODE_ENV: process.env.NODE_ENV,
          hasClientId: !!(process.env.GOOGLE_CLIENT_ID || (globalThis as any)?.GOOGLE_CLIENT_ID),
          hasClientSecret: !!(process.env.GOOGLE_CLIENT_SECRET || (globalThis as any)?.GOOGLE_CLIENT_SECRET),
          hasAuthSecret: !!(process.env.BETTER_AUTH_SECRET || (globalThis as any)?.BETTER_AUTH_SECRET),
          hasDbUrl: !!(process.env.DATABASE_URL || (globalThis as any)?.DATABASE_URL),
        };

        return new Response(
          JSON.stringify(
            {
              status: "ok",
              timestamp: new Date().toISOString(),
              envAudit,
            },
            null,
            2
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
