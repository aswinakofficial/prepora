import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

// Two drivers, chosen by the connection string:
// - Neon (production, and anyone developing against a Neon branch): Neon's serverless HTTP driver,
//   which is what runs on Cloudflare Workers.
// - Any other Postgres (a contributor's local database, CI): the standard node-postgres driver.
//   Neon's HTTP driver can only talk to Neon, not to a plain Postgres server.
// Both return raw query results in the same `{ rows }` shape, so callers of db.execute() don't care
// which one they got. See CONTRIBUTING.md → "Local development".
export function isNeonUrl(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

// One pool per connection string for the process's lifetime (dev servers, scripts), rather than a
// pool per getDb() call — getDb() is called per request.
const localPools = new Map<string, pg.Pool>();

function cleanConnectionString(urlStr: string): string {
  // Neon's pooled connection strings include channel_binding, which some libpq/driver
  // combinations don't accept as a connection parameter — strip it defensively.
  return urlStr.replace(/[?&]channel_binding=[^&]+/g, "");
}

// Cloudflare Workers pass per-request environment bindings to the fetch handler rather than
// exposing them at module-load time (see apps/web/app/ssr.tsx's setAuth(), called once per request
// before any handler runs) — so DATABASE_URL is not guaranteed to be in process.env yet at the
// moment this module is first imported. Validating eagerly at import time would crash the Worker
// before it ever gets a chance to receive that first request's bindings. getDb() validates lazily
// instead, on first genuine use, which is the earliest point at which failing is actually safe in
// this runtime — and it still fails *before* any query runs, not partway through one.
//
// A prior version of this function fell back to `{} as any` when DATABASE_URL was missing, which
// surfaced as a cryptic `TypeError: db.select is not a function` deep inside a request instead of a
// clear error naming the actual problem — see docs/architecture/prepora-next-level-plan.md
// finding #22. There is no longer a fallback: a missing DATABASE_URL throws immediately, naming the
// variable and pointing at .env.example.
export const getDb = (baseUrl?: string) => {
  const rawString = baseUrl || process.env.DATABASE_URL;
  if (!rawString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in a real Postgres connection " +
        "string (see the Database section), or configure it in your deployment environment.",
    );
  }

  const connectionString = cleanConnectionString(rawString);
  try {
    const url = new URL(connectionString);
    console.log(`🔌 [DB INIT] Instantiating DB connection to: ${url.host}${url.pathname}`);
  } catch {
    console.log("🔌 [DB INIT] Instantiating DB connection (URL parsing failed)");
  }

  if (isNeonUrl(connectionString)) {
    return drizzleNeon(neon(connectionString), { schema });
  }

  let pool = localPools.get(connectionString);
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 10 });
    localPools.set(connectionString, pool);
  }
  // Same query-builder API; typed as the Neon variant so the rest of the codebase has one DB type.
  return drizzlePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
};

export type DB = ReturnType<typeof getDb>;
