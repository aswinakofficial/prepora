import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the root .env (two levels up from packages/db/): the LOCAL database. A variable that's
// already set wins, so scripts/env.sh production (used by scripts/team/migrate-prod.sh) can point
// this at production.
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

// A migration reaches a non-local database only on purpose: through scripts/env.sh production, which
// sets PREPORA_ENV (docs/specs/16-engineering-team.md, decision 5). Anything else is refused, so a
// stray DATABASE_URL can't migrate production by accident.
const host = (() => {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
})();
const isLocal = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
if (!isLocal && process.env.PREPORA_ENV !== "production") {
  throw new Error(
    `DATABASE_URL points at '${host}', not a local database. Production is migrated only by ` +
      "scripts/team/migrate-prod.sh (or, by the owner, scripts/env.sh production pnpm db:migrate).",
  );
}
// And the other way round: in production mode, a local URL means .env.production didn't load.
if (isLocal && process.env.PREPORA_ENV === "production") {
  throw new Error(
    "PREPORA_ENV=production, but DATABASE_URL is local: .env.production didn't load.",
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
