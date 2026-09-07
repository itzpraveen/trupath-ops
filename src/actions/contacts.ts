"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireEditor } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zEnum, zOptional, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";

const schema = z.object({
  id: zOptionalUuid,
  type: zEnum(["customer", "vendor", "job_worker"], "type"),
  name: zRequired("Name", 150),
  phone: zOptional(30),
  email: zOptional(150),
  gstin: zOptional(20),
  stateCode: zOptional(4),
  address: zOptional(1000),
  notes: zOptional(1000),
  active: zBool,
});

export async function saveContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("contacts");
    const parsed = parseForm(schema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const values = { type: d.type, name: d.name, phone: d.phone ?? null, email: d.email ?? null, gstin: d.gstin?.toUpperCase() ?? null, stateCode: d.stateCode ?? null, address: d.address ?? null, notes: d.notes ?? null };
    let id = d.id;
    if (id) await db.update(contacts).set({ ...values, active: d.active }).where(eq(contacts.id, id));
    else {
      const [row] = await db.insert(contacts).values(values).returning({ id: contacts.id });
      id = row.id;
    }
    await audit(db, { userId: user.id, action: d.id ? "update" : "create", entityType: "contact", entityId: id, summary: `${d.id ? "Updated" : "Added"} ${d.type.replace("_", " ")} ${d.name}` });
    for (const p of ["/contacts", "/sales", "/jobwork", "/dispatch", "/payments"]) revalidatePath(p);
    return { ok: true, message: d.id ? "Contact saved" : `${d.name} added`, id };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
