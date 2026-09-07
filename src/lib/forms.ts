import { z } from "zod";
import { toPaise } from "@/lib/money";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  id?: string;
} | null;

/** Convert FormData into a plain object (repeated keys / `name[]` become arrays). */
export function formToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [rawKey, value] of formData.entries()) {
    if (rawKey.startsWith("$")) continue;
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    if (isArray) {
      (obj[key] ??= []) as unknown[];
      (obj[key] as unknown[]).push(value);
    } else if (key in obj) {
      const prev = obj[key];
      obj[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; error: string; fieldErrors: Record<string, string[] | undefined> } {
  const result = schema.safeParse(formToObject(formData));
  if (!result.success) {
    const flat = z.flattenError(result.error);
    const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
    const first = Object.values(fieldErrors).find((v) => v && v.length)?.[0] ?? flat.formErrors[0];
    return { ok: false, error: first ?? "Please check the form and try again.", fieldErrors };
  }
  return { ok: true, data: result.data };
}

/* Reusable field schemas ------------------------------------------- */
export const zText = (max = 200) => z.string().trim().max(max);
export const zRequired = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
export const zOptional = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const zInt = (label: string, min = 0) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`);
export const zPositiveInt = (label: string) => zInt(label, 1);
export const zNumber = (label: string, min = 0) => z.coerce.number({ error: `${label} must be a number` }).min(min, `${label} must be at least ${min}`);
export const zMoney = (label: string, opts?: { allowZero?: boolean }) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((v, ctx) => {
      try {
        const p = toPaise(v);
        if (p < 0 || (!opts?.allowZero && p === 0)) {
          ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` });
          return z.NEVER;
        }
        return p;
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount` });
        return z.NEVER;
      }
    });
export const zOptionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return 0;
    try {
      return toPaise(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
  });
export const zUuid = (label: string) => z.string().uuid(`Select a ${label}`);
export const zOptionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined));
export const zBool = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("off"), z.literal("false"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
export const zEnum = <const T extends readonly [string, ...string[]]>(values: T, label: string) => z.enum(values, { error: `Choose a valid ${label}` });

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
