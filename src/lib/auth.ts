import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/password";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Role, type SafeUser } from "@/db/schema";
import { canEdit, canView, type ModuleKey } from "@/lib/permissions";

export const SESSION_COOKIE = "tp_session";
const SESSION_DAYS = 30;

export { hashPassword, verifyPassword };

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

/** Start a session and return its token. The browser stores it in a cookie; the phone app keeps it itself. */
export async function issueSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: tokenId(token), userId, expiresAt, userAgent: userAgent ?? null });
  // opportunistic cleanup of expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function revokeSessionToken(token: string) {
  await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
}

export async function createSession(userId: string, userAgent?: string | null) {
  const { token, expiresAt } = await issueSession(userId, userAgent);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Sign the user out everywhere except the device making this request. */
export async function revokeOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? tokenId(token) : null;
  await db.delete(sessions).where(keep ? and(eq(sessions.userId, userId), ne(sessions.id, keep)) : eq(sessions.userId, userId));
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
  store.delete(SESSION_COOKIE);
}

/** The session token for this request, from the cookie or a bearer header (memoised per request). */
export const sessionToken = cache(async (): Promise<string | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;
  // the phone app has no cookie jar: it sends the same session token as a bearer token
  const auth = (await headers()).get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() || null : null;
});

/** Current signed-in user (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const token = await sessionToken();
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenId(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  return rows[0] ?? null;
});

/** Use in pages/layouts: redirects to login, or home when the role may not view the module. */
export async function requireUser(module?: ModuleKey): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (module && !canView(user.role, module)) redirect("/?denied=" + module);
  return user;
}

export class AuthError extends Error {}

/** Use in server actions: throws instead of redirecting so the form can show the message. */
export async function requireEditor(module: ModuleKey): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (!canEdit(user.role, module)) throw new AuthError("You do not have permission to do that.");
  return user;
}

export function isRole(user: SafeUser | null, ...roles: Role[]) {
  return !!user && roles.includes(user.role);
}
