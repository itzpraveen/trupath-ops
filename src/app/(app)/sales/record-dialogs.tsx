"use client";

import { Plus } from "lucide-react";
import { createRecord, updateRecord } from "@/actions/records";
import type { BusinessRecord, RecordKind } from "@/db/schema";
import type { ActionState } from "@/lib/forms";
import { toRupees } from "@/lib/money";
import { ENTITY_LABEL, PAYMENT_METHODS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export type RecordOptions = {
  entities: { id: string; name: string }[];
  channels: string[];
  expenseCategories: string[];
  contacts: { id: string; name: string; type: string }[];
  bankAccounts: { id: string; name: string; entityId: string }[];
};

const TITLES: Record<RecordKind, { title: string; description: string; submit: string }> = {
  sale: { title: "Add sale", description: "Money earned from a sale outside the website, or a manual correction.", submit: "Add sale" },
  expense: { title: "Add expense", description: "Anything the business paid for.", submit: "Add expense" },
  return: { title: "Add return", description: "A refund or returned goods that reduce sales.", submit: "Add return" },
  purchase: { title: "Add purchase", description: "Raw material or stock bought for resale.", submit: "Add purchase" },
};

export function RecordFields({ kind, options, defaults, defaultEntity, defaultDate, state }: { kind: RecordKind; options: RecordOptions; defaults?: BusinessRecord; defaultEntity: string; defaultDate: string; state: ActionState }) {
  const fe = state?.fieldErrors ?? {};
  const isMoneyIn = kind === "sale";
  const contactList = options.contacts.filter((c) => (kind === "sale" || kind === "return" ? c.type === "customer" : c.type !== "customer"));
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <FormRow>
        {!defaults ? (
          <Field label="Books" name="entityId" error={fe.entityId}>
            <NativeSelect id="entityId" name="entityId" defaultValue={defaultEntity}>
              {options.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Field label="Date" name="workDate" error={fe.workDate} required>
          <Input id="workDate" name="workDate" type="date" defaultValue={defaults?.workDate ?? defaultDate} required />
        </Field>
        <Field label="Amount (₹)" name="amountP" error={fe.amountP} required>
          <Input id="amountP" name="amountP" inputMode="decimal" placeholder="0" defaultValue={defaults ? toRupees(defaults.amountP) : ""} required autoFocus={!defaults} />
        </Field>
      </FormRow>
      <FormRow>
        {kind === "sale" || kind === "return" ? (
          <Field label="Channel" name="channel" error={fe.channel}>
            <NativeSelect id="channel" name="channel" defaultValue={defaults?.channel ?? options.channels[1] ?? ""}>
              {options.channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field label="Category" name="category" error={fe.category}>
            <NativeSelect id="category" name="category" defaultValue={defaults?.category ?? (kind === "purchase" ? "Raw material purchase" : "")}>
              <option value="">Choose…</option>
              {options.expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label={kind === "sale" ? "Invoice / order no." : kind === "return" ? "Original invoice / order" : "Bill / reference no."} name="reference" error={fe.reference}>
          <Input id="reference" name="reference" defaultValue={defaults?.reference ?? ""} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label={isMoneyIn || kind === "return" ? "Customer" : "Vendor"} name="contactId" error={fe.contactId}>
          <NativeSelect id="contactId" name="contactId" defaultValue={defaults?.contactId ?? ""}>
            <option value="">Not specified</option>
            {contactList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={isMoneyIn ? "Received via" : "Paid via"} name="paymentMethod" error={fe.paymentMethod}>
          <NativeSelect id="paymentMethod" name="paymentMethod" defaultValue={defaults?.paymentMethod ?? (kind === "expense" ? "upi" : "cash")}>
            {PAYMENT_METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Cash / bank account" name="bankAccountId" error={fe.bankAccountId} hint="Optional. Helps track balances.">
          <NativeSelect id="bankAccountId" name="bankAccountId" defaultValue={defaults?.bankAccountId ?? ""}>
            <option value="">Not specified</option>
            {options.bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({ENTITY_LABEL[b.entityId] ?? b.entityId})
              </option>
            ))}
          </NativeSelect>
        </Field>
        {kind === "expense" || kind === "purchase" ? (
          <Field label="GST in this bill (₹)" name="gstP" error={fe.gstP} hint="Leave blank if no GST bill.">
            <Input id="gstP" name="gstP" inputMode="decimal" defaultValue={defaults?.gstP ? toRupees(defaults.gstP) : ""} />
          </Field>
        ) : null}
      </FormRow>
      <Field label="Note" name="note" error={fe.note}>
        <Textarea id="note" name="note" rows={2} defaultValue={defaults?.note ?? ""} placeholder={kind === "return" ? "Reason for the return" : "Anything worth remembering"} />
      </Field>
    </>
  );
}

export function AddRecordButtons({ options, defaultEntity, defaultDate, kinds }: { options: RecordOptions; defaultEntity: string; defaultDate: string; kinds?: RecordKind[] }) {
  const list = kinds ?? (["sale", "expense", "return", "purchase"] as RecordKind[]);
  return (
    <>
      {list.map((kind) => (
        <FormDialog
          key={kind}
          trigger={<Button variant={kind === "sale" ? "default" : "outline"} size="sm" />}
          triggerLabel={TITLES[kind].title}
          title={TITLES[kind].title}
          description={TITLES[kind].description}
          action={createRecord}
          submitLabel={TITLES[kind].submit}
          wide
        >
          {(state) => <RecordFields kind={kind} options={options} defaultEntity={defaultEntity} defaultDate={defaultDate} state={state} />}
        </FormDialog>
      ))}
    </>
  );
}

export function EditRecordDialog({ record, options }: { record: BusinessRecord; options: RecordOptions }) {
  return (
    <FormDialog trigger={<Button variant="ghost" size="xs" />} triggerLabel="Edit" title={`Edit ${TITLES[record.kind].title.replace("Add ", "")}`} action={updateRecord} submitLabel="Save changes" wide>
      {(state) => <RecordFields kind={record.kind} options={options} defaults={record} defaultEntity={record.entityId} defaultDate={record.workDate} state={state} />}
    </FormDialog>
  );
}

export { Plus };
