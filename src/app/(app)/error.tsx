"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
      <h2 className="font-semibold">Something went wrong on this page</h2>
      <p className="mt-1 text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
      {error.digest ? <p className="mt-1 text-xs text-muted-foreground">Reference {error.digest}</p> : null}
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
