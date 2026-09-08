"use client";
import { ActionForm } from "@/components/app/action-form";
import type { ActionState } from "@/lib/forms";
export function IssueInvoiceForm({ action, source, id, fingerprint }: { action: (prev: ActionState, form: FormData) => Promise<ActionState>; source: string; id: string; fingerprint: string }) {
  return <ActionForm action={action} submitLabel="Issue invoice" redirectTo={(s) => `/print/invoice/${s.id}`}><input type="hidden" name="source" value={source} /><input type="hidden" name="id" value={id} /><input type="hidden" name="fingerprint" value={fingerprint} /></ActionForm>;
}
