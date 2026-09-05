import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";
import { getDb, users, sessions, accounts, verifications } from "@prepora/db";

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

  console.log(`🔐 [AUTH INIT] createBetterAuthInstance executing!`);
  console.log(`🔐 [AUTH INIT] BETTER_AUTH_SECRET length: ${secret.length}`);
  console.log(`🔐 [AUTH INIT] GOOGLE_CLIENT_ID length: ${clientId.length}`);
  console.log(`🔐 [AUTH INIT] DATABASE_URL length: ${(process.env.DATABASE_URL || "").length}`);
  console.log(`🔐 [AUTH INIT] BETTER_AUTH_URL: ${getBaseUrl()}`);

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
    // Check if we actually have auth-related bindings that need applying
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
  
  if (hasNewBindings) {
    console.log(`⚙️ [AUTH CONFIG] Environment variables were successfully updated via Cloudflare Worker bindings. Re-initializing auth!`);
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

export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    const instance = getAuth();
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
