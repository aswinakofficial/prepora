import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.ts";

export const getDb = (baseUrl?: string) => {
  const connectionString = baseUrl || process.env.DATABASE_URL || "";
  if (!connectionString) {
    console.error("⚠️ [DB ERROR] DATABASE_URL environment variable is missing when attempting to initialize DB!");
  } else {
    try {
      const url = new URL(connectionString);
      console.log(`🔌 [DB INIT] Instantiating DB connection to: ${url.host}${url.pathname}`);
    } catch {
      console.log("🔌 [DB INIT] Instantiating DB connection (URL parsing failed)");
    }
  }
  
  const client = neon(connectionString || "postgresql://dummy:dummy@localhost/dummy");
  return drizzle(client, { schema });
};

// Also keep `db` for local usages where process.env is set
export const db = typeof process !== 'undefined' && process.env.DATABASE_URL 
  ? drizzle(neon(process.env.DATABASE_URL), { schema })
  : {} as any; // mock or keep empty if not available



export type DB = typeof db;

