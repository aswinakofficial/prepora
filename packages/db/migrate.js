import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql`ALTER TABLE verifications ALTER COLUMN expires_at TYPE timestamp USING expires_at::timestamp;`;
    await sql`ALTER TABLE accounts ALTER COLUMN expires_at TYPE timestamp USING expires_at::timestamp;`;
    await sql`ALTER TABLE sessions ALTER COLUMN expires_at TYPE timestamp USING expires_at::timestamp;`;
    console.log("Migration successful!");
  } catch (e) {
    if (e.message.includes("does not exist") || e.message.includes("cannot be cast")) {
      console.log("Already migrated or error:", e.message);
    } else {
      console.error(e);
    }
  }
  process.exit(0);
}

main();
