import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the root .env (two levels up from packages/db/)
config({ path: resolve(__dirname, "../../.env") });

// Note: package.json's "postgres" dependency looks unused (the app itself queries through
// @neondatabase/serverless's neon() driver, never this package directly) but is required —
// `drizzle-kit migrate`/`generate` use drizzle-orm's postgres-js adapter internally, which
// declares "postgres" as an optional peer dependency. Removing it breaks migrations, not the app.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required to run drizzle-kit commands. Set it in the repo root .env.",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
