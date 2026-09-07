import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const globalForDb = globalThis as unknown as { __trupathSql?: ReturnType<typeof postgres> };

const client =
  globalForDb.__trupathSql ??
  postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 8),
    idle_timeout: 30,
    connect_timeout: 15,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__trupathSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
