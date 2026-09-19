import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve } from "node:path";

// Load the root .env (two levels up from packages/db/)
config({ path: resolve(__dirname, "../../.env") });

// Note: package.json's "postgres" dependency looks unused (the app itself queries through
// @neondatabase/serverless's neon() driver, never this package directly) but is required —
// `drizzle-kit migrate`/`generate` use drizzle-orm's postgres-js adapter internally, which
// declares "postgres" as an optional peer dependency. Removing it breaks migrations, not the app.

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
