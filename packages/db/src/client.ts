import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";


const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Use a singleton connection pool
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type DB = typeof db;
