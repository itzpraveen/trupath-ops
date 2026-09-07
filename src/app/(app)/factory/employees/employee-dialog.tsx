"use client";

import { saveEmployee } from "@/actions/factory";
import type { Employee } from "@/db/schema";
import { toRupees } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export function EmployeeDialog({ employee, designations, nextCode }: { employee?: Employee; designations: string[]; nextCode?: string }) {
  return (
    <FormDialog trigger={employee ? <Button variant="ghost" size="xs" /> : <Button size="sm" />} triggerLabel={employee ? "Edit" : "Add staff"} title={employee ? `Edit ${employee.name}` : "Add staff"} action={saveEmployee} submitLabel={employee ? "Save changes" : "Add staff"}>
      {(state) => {
        const fe = state?.fieldErrors ?? {};
        return (
          <>
            {employee ? <input type="hidden" name="id" value={employee.id} /> : null}
            <FormRow>
              <Field label="Staff code" name="code" error={fe.code} required>
                <Input id="code" name="code" defaultValue={employee?.code ?? nextCode ?? ""} required />
              </Field>
              <Field label="Name" name="name" error={fe.name} required>
                <Input id="name" name="name" defaultValue={employee?.name ?? ""} required autoFocus={!employee} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Role" name="designation" error={fe.designation}>
                <NativeSelect id="designation" name="designation" defaultValue={employee?.designation ?? designations[0] ?? ""}>
                  {designations.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Phone" name="phone" error={fe.phone}>
                <Input id="phone" name="phone" inputMode="tel" defaultValue={employee?.phone ?? ""} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Joined on" name="joinedAt" error={fe.joinedAt}>
                <Input id="joinedAt" name="joinedAt" type="date" defaultValue={employee?.joinedAt ?? ""} />
              </Field>
              <Field label="Daily wage (₹)" name="dailyWageP" error={fe.dailyWageP} hint="Used for the wages column in attendance.">
                <Input id="dailyWageP" name="dailyWageP" inputMode="decimal" defaultValue={employee?.dailyWageP ? toRupees(employee.dailyWageP) : ""} />
              </Field>
            </FormRow>
            {employee ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={employee.active} className="size-4 accent-primary" />
                Currently working here
              </label>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
