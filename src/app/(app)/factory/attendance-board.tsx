"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { saveAttendanceDetails, setAttendance } from "@/actions/factory";
import type { AttendanceStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormRow } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";

export type AttendanceRow = {
  employeeId: string;
  code: string;
  name: string;
  designation: string;
  status: AttendanceStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  overtimeMin: number;
  note: string | null;
};

const OPTIONS: { value: AttendanceStatus; short: string; label: string; cls: string }[] = [
  { value: "present", short: "P", label: "Present", cls: "data-[on=true]:bg-success data-[on=true]:text-success-foreground" },
  { value: "half_day", short: "½", label: "Half day", cls: "data-[on=true]:bg-warning data-[on=true]:text-warning-foreground" },
  { value: "absent", short: "A", label: "Absent", cls: "data-[on=true]:bg-destructive data-[on=true]:text-white" },
  { value: "leave", short: "L", label: "Leave", cls: "data-[on=true]:bg-primary data-[on=true]:text-primary-foreground" },
];

export function AttendanceBoard({ rows, date, editable }: { rows: AttendanceRow[]; date: string; editable: boolean }) {
  const [state, setState] = useState<Record<string, AttendanceStatus | null>>(() => Object.fromEntries(rows.map((r) => [r.employeeId, r.status])));
  const [, start] = useTransition();

  const mark = (employeeId: string, status: AttendanceStatus) => {
    const prev = state[employeeId];
    setState((s) => ({ ...s, [employeeId]: status }));
    start(async () => {
      const res = await setAttendance({ employeeId, workDate: date, status });
      if (!res?.ok) {
        setState((s) => ({ ...s, [employeeId]: prev ?? null }));
        toast.error(res?.error ?? "Could not save attendance");
      }
    });
  };

  if (!rows.length) return <p className="text-sm text-muted-foreground">No active staff yet. Add staff from the Staff page.</p>;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((r) => {
        const current = state[r.employeeId];
        return (
          <li key={r.employeeId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {r.name} <span className="text-xs font-normal text-muted-foreground">#{r.code}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.designation || "Staff"}
                {r.checkIn ? ` · in ${r.checkIn}` : ""}
                {r.checkOut ? ` · out ${r.checkOut}` : ""}
                {r.overtimeMin ? ` · OT ${r.overtimeMin} min` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label={`Attendance for ${r.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={!editable}
                  data-on={current === o.value}
                  onClick={() => mark(r.employeeId, o.value)}
                  title={o.label}
                  aria-label={`${o.label} for ${r.name}`}
                  aria-pressed={current === o.value}
                  className={cn("grid size-9 place-items-center rounded-lg border bg-background text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60", o.cls)}
                >
                  {o.short}
                </button>
              ))}
              {editable ? (
                <FormDialog trigger={<Button variant="ghost" size="sm" className="text-muted-foreground" />} triggerLabel="Details" title={`${r.name} · ${date}`} action={saveAttendanceDetails} submitLabel="Save">
                  {(st) => {
                    const fe = st?.fieldErrors ?? {};
                    return (
                      <>
                        <input type="hidden" name="employeeId" value={r.employeeId} />
                        <input type="hidden" name="workDate" value={date} />
                        <Field label="Status" name="status" error={fe.status}>
                          <NativeSelect id="status" name="status" defaultValue={current ?? "present"}>
                            {OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                            <option value="holiday">Holiday</option>
                          </NativeSelect>
                        </Field>
                        <FormRow>
                          <Field label="Check in" name="checkIn" error={fe.checkIn}>
                            <Input id="checkIn" name="checkIn" type="time" defaultValue={r.checkIn ?? ""} />
                          </Field>
                          <Field label="Check out" name="checkOut" error={fe.checkOut}>
                            <Input id="checkOut" name="checkOut" type="time" defaultValue={r.checkOut ?? ""} />
                          </Field>
                        </FormRow>
                        <Field label="Overtime (minutes)" name="overtimeMin" error={fe.overtimeMin}>
                          <Input id="overtimeMin" name="overtimeMin" type="number" min={0} step={15} defaultValue={r.overtimeMin || ""} />
                        </Field>
                        <Field label="Note" name="note" error={fe.note}>
                          <Textarea id="note" name="note" rows={2} defaultValue={r.note ?? ""} />
                        </Field>
                      </>
                    );
                  }}
                </FormDialog>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
