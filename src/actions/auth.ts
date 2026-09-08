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
import { loginLimiter } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };
  const { email, password, next } = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const wait = Math.max(loginLimiter.email.retryAfter(email), loginLimiter.ip.retryAfter(ip));
  if (wait > 0) {
    const minutes = Math.max(1, Math.ceil(wait / 60_000));
    return { error: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    loginLimiter.email.fail(email);
    loginLimiter.ip.fail(ip);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Email or password is incorrect." };
  }
  loginLimiter.email.reset(email);

  await createSession(user.id, h.get("user-agent"));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : ROLE_HOME[user.role];
  redirect(safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
