import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined });
  const db = drizzle(sql, { casing: "snake_case" });
  console.log("Applying migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
