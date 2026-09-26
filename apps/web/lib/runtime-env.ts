import { setAuth } from "@prepora/auth";

// Cloudflare Workers hand environment bindings (DATABASE_URL, ADMIN_USERS, secrets, …) to each
// request rather than exposing them at module-load time, so process.env is empty until something
// copies them in. Every server entry point must call this before code that reads process.env runs:
//
// - app/ssr.tsx — pages, /api/orpc, /api/auth, /api/media, /api/health;
// - app/global-middleware.ts — server functions (createServerFn), which TanStack Start serves from
//   a separate handler at /_server that never runs ssr.tsx.
//
// Locally process.env is already populated from .env, so a check that forgets this works in `pnpm
// dev` and silently fails on Cloudflare — which is how the admin header check once broke.
export function syncRuntimeEnv(event: unknown, request?: Request): void {
  const e = event as {
    context?: { cloudflare?: { env?: unknown } };
    node?: { req?: { cf?: { env?: unknown } } };
  } | null;
  const sources = [
    e?.context?.cloudflare?.env,
    e?.node?.req?.cf?.env,
    (request as { cf?: { env?: unknown } } | undefined)?.cf?.env,
    (globalThis as { env?: unknown }).env,
    process.env,
  ];
  for (const src of sources) {
    if (src && typeof src === "object") {
      setAuth(src as Record<string, unknown>);
    }
  }
}
