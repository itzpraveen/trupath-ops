import type { Db, Tx } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  dbOrTx: Db | Tx,
  input: { userId?: string | null; action: string; entityType: string; entityId?: string | null; summary: string; meta?: Record<string, unknown> },
) {
  await dbOrTx.insert(auditLog).values({
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    meta: input.meta ?? null,
  });
}
