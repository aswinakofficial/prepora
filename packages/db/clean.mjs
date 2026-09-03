import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  await sql`TRUNCATE TABLE users CASCADE`;
  console.log("Deleted all users to clean up dangling states from previous schema errors.");
  process.exit(0);
}

main();
