#!/usr/bin/env node
/**
 * Development-only: drop the entire schema and rebuild it from the committed Drizzle migrations
 * alone. This replaces clean.mjs, migrate.js, migrate-accounts.mjs, and src/create_scraped_table.ts
 * — four hand-written scripts that altered schema outside the Drizzle migration journal, leaving no
 * way to tell whether a given environment's schema actually matched what's committed. There is now
 * exactly one way to reach a known schema state: `drizzle-kit migrate` against the two migrations in
 * drizzle/. This script exists only to blow away an existing (scratch) database so that path can be
 * exercised from a clean slate — it is not itself a migration mechanism.
 *
 * See docs/architecture/prepora-next-level-plan.md finding #24 and
 * docs/roadmap/engineering-roadmap.md item 8.
 *
 * Usage: pnpm db:reset [--force]
 */
import { neon } from "@neondatabase/serverless";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../.env") });

const force = process.argv.includes("--force");

if (process.env.NODE_ENV === "production" && !force) {
  console.error(
    "[db:reset] Refusing to run with NODE_ENV=production. This drops every table. " +
      "Pass --force if you are certain (e.g. a scratch database that happens to be tagged " +
      "production)."
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[db:reset] DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

function cleanConnectionString(urlStr) {
  return urlStr.replace(/[?&]channel_binding=[^&]+/g, "");
}

async function main() {
  const sql = neon(cleanConnectionString(dbUrl));

  console.log("[db:reset] Dropping public and drizzle schemas...");
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;

  console.log("[db:reset] Rebuilding from drizzle/ migrations...");
  const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
    cwd: import.meta.dirname,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error("[db:reset] drizzle-kit migrate failed — schema is currently empty. Fix the migration and re-run.");
    process.exit(result.status ?? 1);
  }

  console.log("[db:reset] Done. Database now matches packages/db/src/schema/ via the committed migrations alone.");
}

main();
