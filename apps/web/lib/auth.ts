import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";
import { db, users, sessions, accounts, verifications } from "@prepora/db";


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

export const getAuth = () => {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
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
    database: drizzleAdapter(db, {
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
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      },
    },
  });
};

export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    const instance = getAuth();
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});


