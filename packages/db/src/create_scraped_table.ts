import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(dbUrl);

async function main() {
  console.log("Creating scraped_questions table if not exists...");
  try {
    await sql`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scrape_status') THEN
          CREATE TYPE scrape_status AS ENUM ('pending', 'approved', 'rejected');
        END IF;
      END $$;
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "scraped_questions" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "source_url" text NOT NULL,
        "raw_data" text,
        "parsed_data" jsonb,
        "status" scrape_status NOT NULL DEFAULT 'pending',
        "reviewed_by" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS "scraped_questions_status_idx" ON "scraped_questions" ("status");
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS "scraped_questions_url_idx" ON "scraped_questions" ("source_url");
    `;

    console.log("SUCCESS: Successfully created scraped_questions table and indexes in Neon DB!");
  } catch (err) {
    console.error("Error executing DDL:", err);
  }
}

main();
