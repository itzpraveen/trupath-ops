import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", time: new Date().toISOString() });
  } catch (err) {
    return Response.json({ ok: false, db: "error", error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
