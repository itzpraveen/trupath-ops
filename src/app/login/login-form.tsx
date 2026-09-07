"use client";

import { useActionState, useState } from "react";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, null);
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="space-y-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} />
        {state?.fieldErrors?.email ? <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
        {state?.fieldErrors?.password ? <p className="text-xs text-destructive">{state.fieldErrors.password[0]}</p> : null}
      </div>
      {state?.error && !state.fieldErrors ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
