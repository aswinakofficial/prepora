import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  
  try {
    await sql`ALTER TABLE "accounts" ADD COLUMN "id_token" text`;
    console.log("Added id_token");
  } catch (e) { console.log(e.message); }

  try {
    await sql`ALTER TABLE "accounts" ADD COLUMN "password" text`;
    console.log("Added password");
  } catch (e) { console.log(e.message); }

  console.log("Done adding Better Auth OAuth tracking columns.");
  process.exit(0);
}

main();
