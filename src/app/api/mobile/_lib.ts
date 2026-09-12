import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { canView, type ModuleKey } from "@/lib/permissions";
import type { SafeUser } from "@/db/schema";

/** JSON error shaped the way the phone app expects. */
export const fail = (message: string, status = 400) => Response.json({ ok: false, error: message }, { status });

/** Resolve the bearer session, or the reason it cannot be used. */
export async function mobileUser(module?: ModuleKey): Promise<{ user: SafeUser } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("Your session has ended. Sign in again.", 401) };
  if (module && !canView(user.role, module)) return { response: fail("You do not have permission for that.", 403) };
  return { user };
}

/** Server actions take form data; the phone app sends JSON. */
export function toFormData(body: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    form.set(key, String(value));
  }
  return form;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
