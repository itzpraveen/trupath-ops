"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { errorMessage, type ActionState } from "@/lib/forms";
import { issueCreditNote } from "@/lib/credit-note-issue";
import { queueStockPush } from "@/lib/stock-push";
const schema = z.object({ expectedCount:z.number().int().nonnegative(), invoiceId:z.uuid(), requestId:z.uuid(), reason:z.string().trim().min(1).max(500), taxAdjustmentConfirmed:z.literal(true), selections:z.array(z.object({originalLine:z.number().int().nonnegative(),qty:z.number().int().positive(),restockQty:z.number().int().nonnegative()})).min(1) });
export async function createCreditNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireEditor("sales");
    const quantities = form.getAll("qty[]"), stock = form.getAll("restockQty[]");
    if (quantities.length !== stock.length) throw new Error("Review all returned item quantities");
    const data = schema.parse({expectedCount:Number(form.get("expectedCount")),invoiceId:form.get("invoiceId"),requestId:form.get("requestId"),reason:form.get("reason"),taxAdjustmentConfirmed:form.get("taxAdjustmentConfirmed")==="on", selections:quantities.map((q,i)=>({originalLine:i,qty:Number(q),restockQty:Number(stock[i])})).filter(s=>s.qty!==0 || s.restockQty!==0)});
    const result = await issueCreditNote({...data,userId:user.id});
    queueStockPush(result.productIds);
    for (const path of ["/sales","/sales/invoices","/payments","/contacts","/reports","/dispatch","/stock",`/print/invoice/${data.invoiceId}`,"/"]) revalidatePath(path);
    return {ok:true,id:result.id,message:`Credit note ${result.number} issued. Record any actual refund separately in Payments.`};
  } catch(error) { return {error:errorMessage(error)}; }
}
