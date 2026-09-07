"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { parseForm, type ActionState } from "@/lib/forms";
import { ROLE_HOME } from "@/lib/permissions";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
  const { email, password, next } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Email or password is incorrect." };
  }

  await createSession(user.id, (await headers()).get("user-agent"));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : ROLE_HOME[user.role];
  redirect(safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
