"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { brands, categories, entities, sessions, users, ROLES, type CategoryKind } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser, hashPassword, requireEditor, verifyPassword, AuthError } from "@/lib/auth";
import { errorMessage, parseForm, zBool, zEnum, zOptional, zOptionalUuid, zRequired, type ActionState } from "@/lib/forms";

const entitySchema = z.object({
  id: zEnum(["brand", "factory"], "books"),
  name: zRequired("Name", 100),
  legalName: zOptional(150),
  gstin: zOptional(20),
  address: zOptional(500),
  stateCode: zOptional(4),
  phone: zOptional(30),
  email: zOptional(150),
});

export async function saveEntity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("settings");
    const parsed = parseForm(entitySchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    await db.update(entities).set({ name: d.name, legalName: d.legalName ?? null, gstin: d.gstin?.toUpperCase() ?? null, address: d.address ?? null, stateCode: d.stateCode ?? null, phone: d.phone ?? null, email: d.email ?? null }).where(eq(entities.id, d.id));
    await audit(db, { userId: user.id, action: "update", entityType: "entity", entityId: d.id, summary: `Updated company details for ${d.name}` });
    revalidatePath("/settings");
    return { ok: true, message: "Company details saved" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const userSchema = z.object({
  name: zRequired("Name", 100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password needs at least 8 characters").max(200),
  role: zEnum(ROLES, "role"),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireEditor("settings");
    const parsed = parseForm(userSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email)).limit(1);
    if (dup) return { error: "A login with this email already exists", fieldErrors: { email: ["Already used"] } };
    const [row] = await db.insert(users).values({ name: d.name, email: d.email, passwordHash: hashPassword(d.password), role: d.role }).returning({ id: users.id });
    await audit(db, { userId: actor.id, action: "create", entityType: "user", entityId: row.id, summary: `Added login for ${d.name} (${d.role})` });
    revalidatePath("/settings/users");
    return { ok: true, message: `${d.name} can now sign in` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const updateUserSchema = z.object({
  id: zOptionalUuid,
  name: zRequired("Name", 100),
  role: zEnum(ROLES, "role"),
  active: zBool,
  password: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || v.length >= 8, "Password needs at least 8 characters"),
});

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireEditor("settings");
    const parsed = parseForm(updateUserSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (!d.id) return { error: "User not found" };
    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) return { error: "User not found" };
    if (target.id === actor.id && (!d.active || d.role !== "owner")) return { error: "You cannot deactivate or demote your own login" };
    if (target.role === "owner" && (d.role !== "owner" || !d.active)) {
      const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, "owner"), eq(users.active, true), ne(users.id, target.id)));
      if (Number(n) === 0) return { error: "There must be at least one active owner" };
    }
    await db
      .update(users)
      .set({ name: d.name, role: d.role, active: d.active, ...(d.password ? { passwordHash: hashPassword(d.password) } : {}) })
      .where(eq(users.id, d.id));
    if (!d.active || d.password) await db.delete(sessions).where(eq(sessions.userId, d.id));
    await audit(db, { userId: actor.id, action: "update", entityType: "user", entityId: d.id, summary: `Updated login ${target.email}${d.password ? " (password reset)" : ""}${!d.active ? " (deactivated)" : ""}` });
    revalidatePath("/settings/users");
    return { ok: true, message: "Login updated" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password needs at least 8 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const me = await getCurrentUser();
    if (!me) throw new AuthError("Please sign in again");
    const parsed = parseForm(passwordSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1);
    if (!row || !verifyPassword(parsed.data.currentPassword, row.passwordHash)) return { error: "Current password is incorrect", fieldErrors: { currentPassword: ["Incorrect"] } };
    await db.update(users).set({ passwordHash: hashPassword(parsed.data.newPassword) }).where(eq(users.id, me.id));
    await audit(db, { userId: me.id, action: "password", entityType: "user", entityId: me.id, summary: "Changed own password" });
    return { ok: true, message: "Password changed" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const categorySchema = z.object({ id: zOptionalUuid, kind: zEnum(["expense", "channel", "process", "designation"], "list"), name: zRequired("Name", 80), active: zBool });

export async function saveCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("settings");
    const parsed = parseForm(categorySchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.id) await db.update(categories).set({ name: d.name, active: d.active }).where(eq(categories.id, d.id));
    else await db.insert(categories).values({ kind: d.kind as CategoryKind, name: d.name }).onConflictDoUpdate({ target: [categories.kind, categories.name], set: { active: true } });
    for (const p of ["/settings/lists", "/sales", "/factory", "/jobwork"]) revalidatePath(p);
    return { ok: true, message: d.id ? "Saved" : `${d.name} added` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function toggleCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireEditor("settings");
    const id = String(formData.get("id") ?? "");
    const [c] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!c) return { error: "Not found" };
    await db.update(categories).set({ active: !c.active }).where(eq(categories.id, id));
    for (const p of ["/settings/lists", "/sales", "/factory", "/jobwork"]) revalidatePath(p);
    return { ok: true, message: c.active ? `${c.name} hidden` : `${c.name} shown again` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const brandSchema = z.object({ id: zOptional(40), name: zRequired("Brand name", 60), active: zBool });

export async function saveBrand(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("settings");
    const parsed = parseForm(brandSchema, formData);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
    const d = parsed.data;
    if (d.id) {
      await db.update(brands).set({ name: d.name, active: d.active }).where(eq(brands.id, d.id));
    } else {
      const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `brand-${Date.now()}`;
      const [dup] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, id)).limit(1);
      if (dup) return { error: "A brand with this name already exists" };
      await db.insert(brands).values({ id, name: d.name, sortOrder: 10 });
    }
    await audit(db, { userId: user.id, action: d.id ? "update" : "create", entityType: "brand", entityId: d.id ?? null, summary: `${d.id ? "Updated" : "Added"} brand ${d.name}` });
    for (const p of ["/settings/lists", "/products", "/stock", "/dispatch", "/factory"]) revalidatePath(p);
    return { ok: true, message: "Brand saved" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
