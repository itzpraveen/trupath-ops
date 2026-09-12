import { setAttendance } from "@/actions/factory";
import { type AttendanceStatus } from "@/db/schema";
import { fail, mobileUser, readJson } from "../_lib";

const STATUSES = ["present", "half_day", "absent", "leave", "holiday"] as const;

/** One tap marks one person for one day. */
export async function POST(request: Request) {
  const auth = await mobileUser("attendance");
  if ("response" in auth) return auth.response;
  const body = await readJson(request);
  const status = String(body.status ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return fail("Choose present, half day, absent or leave");
  const result = await setAttendance({ employeeId: String(body.employeeId ?? ""), workDate: String(body.workDate ?? ""), status: status as AttendanceStatus });
  if (!result?.ok) return fail(result?.error ?? "Could not save that mark");
  return Response.json({ ok: true, message: result.message });
}
