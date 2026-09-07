import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const KINDS = new Set(["dispatch_photo", "jobwork_file", "expense_bill"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const refId = String(form.get("refId") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file" }, { status: 400 });
  if (!KINDS.has(kind) || !/^[0-9a-f-]{36}$/i.test(refId)) return Response.json({ error: "Invalid upload target" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return Response.json({ error: "Only photos (JPG, PNG, WEBP) or PDF files are accepted" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File is larger than 6 MB" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const [row] = await db
    .insert(uploads)
    .values({ kind: kind as "dispatch_photo", refId, fileName: file.name, mime: file.type, size: file.size, data, userId: user.id })
    .returning({ id: uploads.id });
  return Response.json({ ok: true, id: row.id, url: `/api/uploads/${row.id}` });
}
