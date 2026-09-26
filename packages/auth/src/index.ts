import { accounts, getDb, sessions, users, verifications } from "@prepora/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";

// docs/roadmap/engineering-roadmap.md item 26: prepora.xpar.in is the canonical production
// domain (see apps/web/lib/site-config.ts) — auth requests can still legitimately arrive at the
// underlying Cloudflare Pages domain (e.g. before a custom-domain request reaches the app, or
// during a deploy preview), so prepora-9g4.pages.dev stays trusted here for that functional
// reason even though it's never used as a canonical URL anywhere else.
const trustedOrigins = Array.from(
  new Set([
    "http://localhost:3000",
    "http://localhost:5173",
    "https://prepora-9g4.pages.dev",
    "https://prepora.xpar.in",
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) || []),
  ]),
);

const getBaseUrl = () => {
  const url = process.env.BETTER_AUTH_URL;
  if (url && process.env.NODE_ENV === "production" && url.includes("localhost")) {
    return undefined;
  }
  return url;
};

let runtimeAuthInstance: ReturnType<typeof betterAuth> | null = null;

// Email/password accounts exist so contributors can sign in to a local instance without setting
// up Google OAuth (CONTRIBUTING.md → "Local development"). They are off everywhere else — fails
// closed: only NODE_ENV "development" or "test" turns them on, and an unset NODE_ENV (a deployed
// Worker may not have one) keeps them off. In production there is no email verification, and admin
// rights are granted by email address (ADMIN_USERS), so open email sign-up there would let anyone
// register an admin's (or any not-yet-registered user's) address with a password of their choosing.
export function isEmailPasswordEnabled(): boolean {
  return ["development", "test"].includes(process.env.NODE_ENV ?? "");
}

export const createBetterAuthInstance = () => {
  const secret = process.env.BETTER_AUTH_SECRET || (globalThis as any)?.BETTER_AUTH_SECRET || "";
  const clientId = process.env.GOOGLE_CLIENT_ID || (globalThis as any)?.GOOGLE_CLIENT_ID || "";
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET || (globalThis as any)?.GOOGLE_CLIENT_SECRET || "";

  // BETTER_AUTH_SECRET is required — it signs and encrypts sessions. A prior version logged this
  // as an error and constructed the instance anyway with secret: "", which would silently sign
  // every session with an empty string. See docs/architecture/prepora-next-level-plan.md finding
  // #22 (the same "log and continue" permissiveness as the old db client fallback). getDb() below
  // fails the same way if DATABASE_URL is missing, so that case is covered without repeating it here.
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Copy .env.example to .env and set a random secret " +
        "(min 32 chars: `openssl rand -hex 32`), or configure it in your deployment environment.",
    );
  }

  // Google sign-in is optional locally — email/password (see isEmailPasswordEnabled) works without
  // it there. But *one*
  // credential set without the other is a real misconfiguration, not an intentional choice, so
  // that specific case still fails loudly rather than producing a Google provider that's half wired.
  const hasClientId = Boolean(clientId);
  const hasClientSecret = Boolean(clientSecret);
  if (hasClientId !== hasClientSecret) {
    throw new Error(
      "Only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set — both are required together, " +
        "or neither (to disable Google sign-in). Check .env.example.",
    );
  }
  const googleConfigured = hasClientId && hasClientSecret;
  if (!googleConfigured) {
    console.warn(
      isEmailPasswordEnabled()
        ? "[AUTH] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled; local email/password sign-in still works."
        : "[AUTH] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled, and email/password is development-only, so nobody can sign in.",
    );
  }

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
      enabled: isEmailPasswordEnabled(),
    },
    socialProviders: googleConfigured ? { google: { clientId, clientSecret } } : {},
  });
};

export const setAuth = (envBindings?: Record<string, any>) => {
  let hasNewBindings = false;

  if (envBindings && typeof envBindings === "object") {
    if (
      envBindings.GOOGLE_CLIENT_ID ||
      envBindings.DATABASE_URL ||
      envBindings.BETTER_AUTH_SECRET
    ) {
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
  if (!user?.email) return false;
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
  } catch (_e) {
    return { authorized: false, reason: "Session verification failed" };
  }
};
