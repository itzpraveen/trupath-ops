import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, issueSession, revokeSessionToken, sessionToken, verifyPassword } from "@/lib/auth";
import { loginLimiter } from "@/lib/rate-limit";
import { fail, readJson } from "../_lib";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

/** Sign in from the phone app. Returns the same session token the browser would keep in a cookie. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Enter your email address and password");
  const { email, password } = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const wait = Math.max(loginLimiter.email.retryAfter(email), loginLimiter.ip.retryAfter(ip));
  if (wait > 0) {
    const minutes = Math.max(1, Math.ceil(wait / 60_000));
    return fail(`Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, 429);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    loginLimiter.email.fail(email);
    loginLimiter.ip.fail(ip);
    await new Promise((r) => setTimeout(r, 400));
    return fail("Email or password is incorrect.", 401);
  }
  loginLimiter.email.reset(email);
  const { token, expiresAt } = await issueSession(user.id, h.get("user-agent"));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return Response.json({ ok: true, token, expiresAt: expiresAt.toISOString(), user: { id: user.id, name: user.name, role: user.role } });
}

/** Who the current token belongs to. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Your session has ended. Sign in again.", 401);
  return Response.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}

/** Sign out this device only. */
export async function DELETE() {
  const token = await sessionToken();
  if (token) await revokeSessionToken(token);
  return Response.json({ ok: true });
}
