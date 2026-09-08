import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { canEdit, canView } from "@/lib/permissions";
import { UPLOAD_KINDS } from "@/lib/uploads";

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  if (!canView(user.role, UPLOAD_KINDS[row.kind].module)) return new Response("Not allowed", { status: 403 });
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
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [row] = await db.select({ id: uploads.id, kind: uploads.kind, refId: uploads.refId, fileName: uploads.fileName }).from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(user.role, UPLOAD_KINDS[row.kind].module)) return Response.json({ error: "You do not have permission to remove this file" }, { status: 403 });
  await db.delete(uploads).where(eq(uploads.id, id));
  await audit(db, { userId: user.id, action: "delete", entityType: "upload", entityId: row.refId, summary: `Removed ${UPLOAD_KINDS[row.kind].label} ${row.fileName}` });
  return Response.json({ ok: true });
}
