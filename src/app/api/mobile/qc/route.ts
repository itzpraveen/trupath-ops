import { inspectProduction } from "@/actions/factory";
import { fail, mobileUser, readJson, toFormData } from "../_lib";

/** Record an inspection. Accepted pieces enter finished stock; rejected ones do not. */
export async function POST(request: Request) {
  const auth = await mobileUser("factory");
  if ("response" in auth) return auth.response;
  const body = await readJson(request);
  const result = await inspectProduction(
    null,
    toFormData({ id: body.id, revision: body.revision, acceptedQty: body.acceptedQty, rejectedQty: body.rejectedQty, note: body.note }),
  );
  if (!result?.ok) return fail(result?.error ?? "Could not save that inspection");
  return Response.json({ ok: true, message: result.message });
}
