import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.ts";

const connectionString = process.env.DATABASE_URL || "";
if (!connectionString) {
  console.warn("⚠️ DATABASE_URL environment variable is missing!");
}

const client = neon(connectionString);


export const db = drizzle(client, { schema });


export type DB = typeof db;

