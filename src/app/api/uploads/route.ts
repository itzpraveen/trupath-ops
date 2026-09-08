import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessRecords, dispatches, jobWorkOrders, uploads, type UploadKind } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { isUploadKind, UPLOAD_KINDS, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/uploads";

async function targetExists(kind: UploadKind, refId: string) {
  if (kind === "dispatch_photo") return (await db.select({ id: dispatches.id }).from(dispatches).where(eq(dispatches.id, refId)).limit(1)).length > 0;
  if (kind === "jobwork_file") return (await db.select({ id: jobWorkOrders.id }).from(jobWorkOrders).where(eq(jobWorkOrders.id, refId)).limit(1)).length > 0;
  return (await db.select({ id: businessRecords.id }).from(businessRecords).where(eq(businessRecords.id, refId)).limit(1)).length > 0;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const refId = String(form.get("refId") ?? "");
  if (!isUploadKind(kind) || !/^[0-9a-f-]{36}$/i.test(refId)) return Response.json({ error: "Invalid upload target" }, { status: 400 });
  if (!canEdit(user.role, UPLOAD_KINDS[kind].module)) return Response.json({ error: "You do not have permission to add files here" }, { status: 403 });
  if (!(await targetExists(kind, refId))) return Response.json({ error: "The record this file belongs to no longer exists" }, { status: 404 });
  if (!(file instanceof File)) return Response.json({ error: "Choose a file" }, { status: 400 });
  if (!UPLOAD_TYPES.has(file.type)) return Response.json({ error: "Only JPG, PNG or WEBP photos and PDF files are accepted (iPhone HEIC photos are not supported)" }, { status: 400 });
  if (file.size > UPLOAD_MAX_BYTES) return Response.json({ error: "File is larger than 6 MB" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const [row] = await db.insert(uploads).values({ kind, refId, fileName: file.name, mime: file.type, size: file.size, data, userId: user.id }).returning({ id: uploads.id });
  return Response.json({ ok: true, id: row.id, url: `/api/uploads/${row.id}` });
}
