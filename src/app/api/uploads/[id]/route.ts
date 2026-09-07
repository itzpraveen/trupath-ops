import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.size),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${row.fileName.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  await db.delete(uploads).where(eq(uploads.id, id));
  return Response.json({ ok: true });
}
