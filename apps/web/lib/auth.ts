import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  logger: {
    level: "debug",
    disabled: false,
  },
  baseURL: process.env.BETTER_AUTH_URL,
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
      clientId: (process.env.GOOGLE_CLIENT_ID as string) || "",
      clientSecret: (process.env.GOOGLE_CLIENT_SECRET as string) || "",
    },
  },
});

