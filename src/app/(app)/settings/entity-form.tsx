"use client";

import type { entities } from "@/db/schema";
import { NativeSelect } from "@/components/ui/native-select";
import { saveEntity } from "@/actions/settings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/app/action-form";
import { Field, FormRow } from "@/components/app/field";

export function EntityForm({ entity, nextInvoiceNo, nextB2BInvoiceNo, nextCreditNoteNo }: { entity: typeof entities.$inferSelect; nextInvoiceNo: number | null; nextB2BInvoiceNo: number | null; nextCreditNoteNo: number | null }) {
  return (
    <ActionForm action={saveEntity} submitLabel="Save" className="space-y-4 rounded-xl border bg-card p-4">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="id" value={entity.id} />
            <FormRow>
              <Field label="Short name" name={`name-${entity.id}`} error={fe.name} required>
                <Input id={`name-${entity.id}`} name="name" defaultValue={entity.name} required />
              </Field>
              <Field label="Legal name (on invoices and challans)" name={`legalName-${entity.id}`} error={fe.legalName}>
                <Input id={`legalName-${entity.id}`} name="legalName" defaultValue={entity.legalName ?? ""} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="GSTIN" name={`gstin-${entity.id}`} error={fe.gstin}>
                <Input id={`gstin-${entity.id}`} name="gstin" defaultValue={entity.gstin ?? ""} className="uppercase" />
              </Field>
              <Field label="State code" name={`stateCode-${entity.id}`} error={fe.stateCode}>
                <Input id={`stateCode-${entity.id}`} name="stateCode" defaultValue={entity.stateCode ?? "32"} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Phone" name={`phone-${entity.id}`} error={fe.phone}>
                <Input id={`phone-${entity.id}`} name="phone" defaultValue={entity.phone ?? ""} />
              </Field>
              <Field label="Email" name={`email-${entity.id}`} error={fe.email}>
                <Input id={`email-${entity.id}`} name="email" defaultValue={entity.email ?? ""} />
              </Field>
            </FormRow>
            <Field label="Address" name={`address-${entity.id}`} error={fe.address}>
              <Textarea id={`address-${entity.id}`} name="address" rows={3} defaultValue={entity.address ?? ""} />
            </Field>
            <FormRow>
              <Field label="Invoice prefix" name={`invoicePrefix-${entity.id}`} error={fe.invoicePrefix} hint="Tax invoices are numbered prefix/number/year, e.g. B2C/number/26-27. Buyers with a GSTIN use B2B.">
                <Input id={`invoicePrefix-${entity.id}`} name="invoicePrefix" defaultValue={entity.invoicePrefix} className="uppercase" />
              </Field>
              <Field label="Next invoice number (this financial year)" name={`nextInvoiceNo-${entity.id}`} error={fe.nextInvoiceNo} hint="To continue from Tally, enter the number after the last invoice issued there.">
                <Input id={`nextInvoiceNo-${entity.id}`} name="nextInvoiceNo" type="number" min={1} step={1} defaultValue={nextInvoiceNo ?? ""} placeholder="Not configured" />
              </Field>
            </FormRow>
            <Field label="Shipping tax treatment" name={`shippingTaxTreatment-${entity.id}`} hint="Delivery sold with goods normally follows the goods. Select a separate service only on accountant advice."><NativeSelect id={`shippingTaxTreatment-${entity.id}`} name="shippingTaxTreatment" defaultValue={entity.shippingTaxTreatment}><option value="goods">Part of the goods supply</option><option value="separate">Separate service confirmed by accounts</option></NativeSelect></Field>
            <Field label="HSN / SAC for shipping charges" name={`shippingHsn-${entity.id}`} hint="Only used for a separate service. Delivery supplied with goods uses the goods classification."><Input id={`shippingHsn-${entity.id}`} name="shippingHsn" defaultValue={entity.shippingHsn ?? ""} maxLength={8} /></Field>
            <Field label="Next B2B invoice number (this financial year)" name={`nextB2BInvoiceNo-${entity.id}`} hint="Check the last issued invoice in Tally. Books with the same GSTIN share both series. Numbers cannot move backwards.">
              <Input id={`nextB2BInvoiceNo-${entity.id}`} name="nextB2BInvoiceNo" type="number" min={1} step={1} defaultValue={nextB2BInvoiceNo ?? ""} placeholder="Not configured" />
            </Field>
            <Field label="E-invoice applicability" name={`eInvoiceStatus-${entity.id}`}><NativeSelect id={`eInvoiceStatus-${entity.id}`} name="eInvoiceStatus" defaultValue={entity.eInvoiceStatus}><option value="unconfirmed">Awaiting accountant confirmation</option><option value="required">Required — use connected IRP / current system</option><option value="not_required">Not required — accountant confirmed</option></NativeSelect></Field>
            <Field label="Accountant review / exemption reason" name={`eInvoiceReview-${entity.id}`} error={fe.eInvoiceReview}><Textarea id={`eInvoiceReview-${entity.id}`} name="eInvoiceReview" defaultValue={entity.eInvoiceReview ?? ""} /></Field>
            <Field label="Next credit note number (CN series)" name={`nextCreditNoteNo-${entity.id}`} hint="Confirm the next unused CN number for this financial year, including credit notes issued in other software."><Input id={`nextCreditNoteNo-${entity.id}`} name="nextCreditNoteNo" type="number" min={1} step={1} defaultValue={nextCreditNoteNo ?? ""} placeholder="Not configured" /></Field>
          </>
        );
      }}
    </ActionForm>
  );
}
