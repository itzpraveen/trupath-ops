"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircle, Plug } from "lucide-react";
import { toast } from "sonner";
import { testShopify } from "@/actions/shopify";
import { Button } from "@/components/ui/button";

export function TestConnectionButton() {
  const [state, action, pending] = useActionState(async () => testShopify(), null);
  useEffect(() => {
    if (state?.ok) toast.success(state.message);
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Plug />}
        Test connection
      </Button>
    </form>
  );
}
