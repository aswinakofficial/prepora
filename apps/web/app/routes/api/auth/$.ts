import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../../lib/auth";

const handleAuth = async (request: Request, ctx?: any) => {
  const url = new URL(request.url);

  // Extract Cloudflare runtime bindings from all possible context properties
  const cfEnv =
    (ctx as any)?.env ||
    (ctx as any)?.context?.cloudflare?.env ||
    (ctx as any)?.nativeEvent?.context?.cloudflare?.env ||
    (ctx as any)?.event?.context?.cloudflare?.env ||
    (ctx as any)?.request?.env ||
    (request as any)?.env ||
    (request as any)?.cf?.env ||
    (globalThis as any)?.env ||
    (globalThis as any)?.__env__ ||
    (globalThis as any)?.process?.env;

  if (cfEnv && typeof cfEnv === "object") {
    for (const key of Object.keys(cfEnv)) {
      if (cfEnv[key] !== undefined && cfEnv[key] !== null) {
        process.env[key] = cfEnv[key];
        (globalThis as any)[key] = cfEnv[key];
      }
    }
  }

  const envAudit = {
    NODE_ENV: process.env.NODE_ENV,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasAuthSecret: !!process.env.BETTER_AUTH_SECRET,
    hasDbUrl: !!process.env.DATABASE_URL,
    clientIdLength: process.env.GOOGLE_CLIENT_ID?.length || 0,
    clientSecretLength: process.env.GOOGLE_CLIENT_SECRET?.length || 0,
    authSecretLength: process.env.BETTER_AUTH_SECRET?.length || 0,
    dbUrlLength: process.env.DATABASE_URL?.length || 0,
  };

  console.log(`🔍 [AUTH API REQUEST] ${request.method} ${url.pathname}${url.search}`);
  console.log(`🔍 [AUTH API ENV AUDIT]`, envAudit);

  if (url.pathname.endsWith("/health") || url.pathname.endsWith("/debug")) {
    return new Response(
      JSON.stringify(
        {
          status: "ok",
          timestamp: new Date().toISOString(),
          envAudit,
          cfEnvKeys: cfEnv ? Object.keys(cfEnv) : [],
          processEnvKeys: Object.keys(process.env || {}).filter(
            (k) => !k.startsWith("npm_") && !k.startsWith("PNPM_")
          ),
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
      GET: async ({ request }: { request: Request }) => handleAuth(request),
      POST: async ({ request }: { request: Request }) => handleAuth(request),
    },
  },
});
