import { createProduction } from "@/actions/factory";
import { fail, mobileUser, readJson, toFormData } from "../_lib";

/** Record what was made. The same server action the web form uses, so the rules stay in one place. */
export async function POST(request: Request) {
  const auth = await mobileUser("factory");
  if ("response" in auth) return auth.response;
  const body = await readJson(request);
  const result = await createProduction(
    null,
    toFormData({
      productId: body.productId,
      planId: body.planId,
      qty: body.qty,
      workDate: body.workDate,
      employeeId: body.employeeId,
      note: body.note,
      consumeMaterials: body.consumeMaterials === false ? "" : "on",
    }),
  );
  if (!result?.ok) return fail(result?.error ?? "Could not save that entry");
  return Response.json({ ok: true, message: result.message, id: result.id });
}
