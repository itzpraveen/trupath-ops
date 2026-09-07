"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { resyncOrder, runShopifySync } from "@/actions/shopify";
import { Button } from "@/components/ui/button";

export function SyncButton({ label = "Sync now", full, orderId, storeId, variant = "outline" }: { label?: string; full?: boolean; orderId?: string; storeId?: string; variant?: "outline" | "default" | "ghost" }) {
  const [state, action, pending] = useActionState(orderId ? resyncOrder : runShopifySync, null);
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Synced");
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      {full ? <input type="hidden" name="full" value="1" /> : null}
      {orderId ? <input type="hidden" name="id" value={orderId} /> : null}
      {storeId ? <input type="hidden" name="storeId" value={storeId} /> : null}
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {pending ? "Syncing…" : label}
      </Button>
    </form>
  );
}
