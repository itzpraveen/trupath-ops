"use client";

import { useState } from "react";
import { createPayment, saveBankAccount } from "@/actions/payments";
import type { BankAccount } from "@/db/schema";
import { toRupees } from "@/lib/money";
import { ENTITY_LABEL, PAYMENT_METHODS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function PaymentDialog({ direction, contacts, accounts, entities, date, defaultEntity, defaultContactId, trigger, triggerLabel }: { direction: "in" | "out"; contacts: { id: string; name: string; type: string }[]; accounts: { id: string; name: string; entityId: string }[]; entities: { id: string; name: string }[]; date: string; defaultEntity: string; defaultContactId?: string; trigger?: React.ReactElement; triggerLabel?: React.ReactNode }) {
  const [entityId, setEntityId] = useState(defaultEntity);
  const isIn = direction === "in";
  const list = contacts.filter((c) => !isIn || c.type === "customer");
  return (
    <FormDialog trigger={trigger ?? <Button variant={isIn ? "default" : "outline"} size="sm" />} triggerLabel={triggerLabel ?? (isIn ? "Money received" : "Money paid")} title={isIn ? "Money received" : "Money paid out"} description={isIn ? "A customer paid against credit sales, or an advance." : "Paid a supplier or job worker, or refunded a customer."} action={createPayment} submitLabel={isIn ? "Record receipt" : "Record payment"}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="direction" value={direction} />
            <FormRow>
              <Field label="Books" name="entityId" error={fe.entityId}>
                <NativeSelect id="entityId" name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date" name="workDate" error={fe.workDate} required>
                <Input id="workDate" name="workDate" type="date" defaultValue={date} required />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Amount (₹)" name="amountP" error={fe.amountP} required>
                <Input id="amountP" name="amountP" inputMode="decimal" required autoFocus className="h-10 text-lg" />
              </Field>
              <Field label={isIn ? "From customer" : "To"} name="contactId" error={fe.contactId}>
                <NativeSelect id="contactId" name="contactId" defaultValue={defaultContactId ?? ""}>
                  <option value="">Not specified</option>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Method" name="method" error={fe.method}>
                <NativeSelect id="method" name="method" defaultValue="upi">
                  {PAYMENT_METHODS.filter(([v]) => v !== "credit").map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Into / from account" name="bankAccountId" error={fe.bankAccountId}>
                <NativeSelect key={entityId} id="bankAccountId" name="bankAccountId" defaultValue="">
                  <option value="">Not specified</option>
                  {accounts.filter((a) => a.entityId === entityId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({ENTITY_LABEL[a.entityId] ?? a.entityId})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormRow>
            <Field label="Reference" name="reference" error={fe.reference}>
              <Input id="reference" name="reference" placeholder="UTR, cheque no., invoice" />
            </Field>
            <Field label="Note" name="note" error={fe.note}>
              <Textarea id="note" name="note" rows={2} />
            </Field>
          </>
        );
      }}
    </FormDialog>
  );
}

export function BankAccountDialog({ account, entities }: { account?: BankAccount; entities: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger={account ? <Button variant="ghost" size="xs" /> : <Button variant="outline" size="sm" />} triggerLabel={account ? "Edit" : "Add account"} title={account ? `Edit ${account.name}` : "Add cash or bank account"} action={saveBankAccount} submitLabel="Save">
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {account ? <input type="hidden" name="id" value={account.id} /> : null}
            <FormRow>
              <Field label="Books" name="entityId" error={fe.entityId}>
                <NativeSelect id="entityId" name="entityId" defaultValue={account?.entityId ?? "brand"}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Type" name="type" error={fe.type}>
                <NativeSelect id="type" name="type" defaultValue={account?.type ?? "bank"}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="upi">UPI wallet</option>
                  <option value="wallet">Other wallet</option>
                </NativeSelect>
              </Field>
            </FormRow>
            <Field label="Name" name="name" error={fe.name} required>
              <Input id="name" name="name" defaultValue={account?.name ?? ""} required placeholder="e.g. HDFC current account" />
            </Field>
            <Field label="Opening balance (₹)" name="openingP" error={fe.openingP}>
              <Input id="openingP" name="openingP" inputMode="decimal" defaultValue={account?.openingP ? toRupees(account.openingP) : ""} />
            </Field>
            {account ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={account.active} className="size-4 accent-primary" />
                Active
              </label>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
