import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";
import { getDb, users, sessions, accounts, verifications } from "@prepora/db";
import { eq } from "drizzle-orm";

const trustedOrigins = Array.from(
  new Set([
    "http://localhost:3000",
    "http://localhost:5173",
    "https://prepora-9g4.pages.dev",
    "https://prepora.xpar.in",
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) || []),
  ])
);

const getBaseUrl = () => {
  const url = process.env.BETTER_AUTH_URL;
  if (url && process.env.NODE_ENV === "production" && url.includes("localhost")) {
    return undefined;
  }
  return url;
};

let runtimeAuthInstance: ReturnType<typeof betterAuth> | null = null;

export const createBetterAuthInstance = () => {
  const secret = process.env.BETTER_AUTH_SECRET || (globalThis as any)?.BETTER_AUTH_SECRET || "";
  const clientId = process.env.GOOGLE_CLIENT_ID || (globalThis as any)?.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || (globalThis as any)?.GOOGLE_CLIENT_SECRET || "";

  if (!secret) console.error("❌ [BETTER AUTH INIT ERROR] BETTER_AUTH_SECRET is explicitly empty!");
  if (!clientId || !clientSecret) console.error("❌ [BETTER AUTH INIT ERROR] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is explicitly empty!");

  return betterAuth({
    secret,
    plugins: [reactStartCookies()],
    logger: {
      level: "debug",
      disabled: false,
    },
    baseURL: getBaseUrl(),
    trustedOrigins,
    rateLimit: {
      window: 60,
      max: 10000,
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId,
        clientSecret,
      },
    },
  });
};

export const setAuth = (envBindings?: Record<string, any>) => {
  let hasNewBindings = false;
  
  if (envBindings && typeof envBindings === "object") {
    if (envBindings.GOOGLE_CLIENT_ID || envBindings.DATABASE_URL || envBindings.BETTER_AUTH_SECRET) {
      for (const key of Object.keys(envBindings)) {
        const val = envBindings[key];
        if (val !== undefined && val !== null) {
          if (process.env[key] !== val) {
             process.env[key] = val;
             (globalThis as any)[key] = val;
             hasNewBindings = true;
          }
        }
      }
    }
  }
  
  if (!runtimeAuthInstance || hasNewBindings) {
    runtimeAuthInstance = createBetterAuthInstance();
  }
  
  return runtimeAuthInstance;
};

export const getAuth = () => {
  if (runtimeAuthInstance) {
    return runtimeAuthInstance;
  }
  return createBetterAuthInstance();
};

// This Proxy exists because Cloudflare Workers pass per-request
// environment bindings to the fetch handler rather than exposing them at
// module-load time — so betterAuth(...) can't be constructed eagerly at
// import time without risking empty secrets. setAuth() (called once per
// request from apps/web/app/ssr.tsx, before any route handler runs) syncs
// those bindings into process.env; every property access here goes
// through getAuth(), which builds the real instance lazily on first use
// (or rebuilds it if setAuth() just saw new binding values) rather than
// at import time. Keep this lazy — it isn't defensive scaffolding left
// over from the auth incident, it's the actual fix for a real Workers
// constraint.
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    const instance = getAuth();
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Resolves the currently authenticated user, if any, from a request's
 * session cookie.
 */
export async function resolveUserFromRequestHeaders(headers: Headers) {
  const authInstance = getAuth();

  try {
    const session = await authInstance.api.getSession({ headers });
    return session?.user ?? null;
  } catch (error) {
    console.warn("Session verification failed:", error);
    return null;
  }
}

/**
 * Checks if a given user object has admin privileges.
 */
export function isAdminUser(user: { email?: string; role?: string } | null | undefined): boolean {
  if (!user || !user.email) return false;
  if ((user as any).role === "admin") return true;

  const adminUsersEnv = process.env.ADMIN_USERS || (globalThis as any)?.ADMIN_USERS || "";
  if (!adminUsersEnv) return false;

  const allowedAdminEmails = adminUsersEnv
    .split(",")
    .map((e: string) => e.trim().replace(/['"]/g, "").toLowerCase())
    .filter(Boolean);

  return allowedAdminEmails.includes(user.email.toLowerCase());
}

export const requireAdmin = async (event: any) => {
  const request = event.request || event;
  const headers = request.headers ? request.headers : new Headers();
  
  try {
    const user = await resolveUserFromRequestHeaders(headers);
    if (!user) {
      return { authorized: false, reason: "Not logged in" };
    }
    
    if (!isAdminUser(user)) {
      return { authorized: false, reason: `Unauthorized email: ${user.email}` };
    }
    
    return { authorized: true, user: user };
  } catch (e) {
    return { authorized: false, reason: "Session verification failed" };
  }
};
