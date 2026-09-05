import { createFileRoute } from "@tanstack/react-router";
import { setAuth, getAuth } from "../../../lib/auth";

const handleAuth = async (event: any) => {
  const request: Request = event?.request || event;
  const url = new URL(request.url);

  // Synchronize Cloudflare environment variables across all context sources
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
    clientIdLength: (process.env.GOOGLE_CLIENT_ID || (globalThis as any)?.GOOGLE_CLIENT_ID || "").length,
    clientSecretLength: (process.env.GOOGLE_CLIENT_SECRET || (globalThis as any)?.GOOGLE_CLIENT_SECRET || "").length,
    authSecretLength: (process.env.BETTER_AUTH_SECRET || (globalThis as any)?.BETTER_AUTH_SECRET || "").length,
    dbUrlLength: (process.env.DATABASE_URL || (globalThis as any)?.DATABASE_URL || "").length,
  };

  console.log(`🔍 [AUTH API REQUEST] ${request.method} ${url.pathname}${url.search}`);
  console.log(`🔍 [AUTH API ENV AUDIT]`, envAudit);

  // Return diagnostic audit for any URL containing "health" or "debug"
  if (url.pathname.includes("health") || url.pathname.includes("debug")) {
    return new Response(
      JSON.stringify(
        {
          status: "ok",
          timestamp: new Date().toISOString(),
          pathname: url.pathname,
          envAudit,
          eventKeys: event ? Object.keys(event) : [],
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const auth = getAuth();
    const response = await auth.handler(request);
    console.log(`🔍 [AUTH API RESPONSE STATUS] ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const cloned = response.clone();
      const errText = await cloned.text();
      console.error(`❌ [AUTH API FAILURE ${response.status}] Path: ${url.pathname} | Details:`, errText);

      return new Response(
        JSON.stringify({
          error: {
            message: `Auth Server Error (${response.status}): ${errText || "Unknown Better Auth error"}`,
            code: `AUTH_${response.status}`,
            path: url.pathname,
            details: errText,
            envAudit,
          },
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return response;
  } catch (err: any) {
    console.error(`❌ [AUTH HANDLER EXCEPTION] Path: ${url.pathname}`, err);
    return new Response(
      JSON.stringify({
        error: {
          message: err?.message || String(err),
          stack: err?.stack,
          code: "AUTH_SERVER_EXCEPTION",
          envAudit,
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const Route = (createFileRoute("/api/auth/$" as any) as any)({
  server: {
    handlers: {
      GET: async (event: any) => handleAuth(event),
      POST: async (event: any) => handleAuth(event),
    },
  },
});
