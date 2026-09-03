import { createAPIFileRoute } from "@tanstack/react-start/api";

const handleHealth = async (ctx: any) => {
  const request: Request = ctx.request || ctx;
  const cfEnv =
    ctx.env ||
    ctx.context?.cloudflare?.env ||
    (request as any).env ||
    (request as any).cf?.env ||
    (globalThis as any).__env__;

  if (cfEnv && typeof cfEnv === "object") {
    for (const key of Object.keys(cfEnv)) {
      if (cfEnv[key] && !process.env[key]) {
        process.env[key] = cfEnv[key];
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
};

export const APIRoute = createAPIFileRoute("/api/health")({
  GET: (ctx) => handleHealth(ctx),
});
