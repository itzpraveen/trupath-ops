import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const { next } = await props.searchParams;

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">T</span>
          <div className="leading-tight">
            <p className="text-base font-semibold">TruPath Ops</p>
            <p className="text-sm text-muted-foreground">Trupaths Ventures</p>
          </div>
        </div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Use the email and password the owner gave you.</p>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </div>
  );
}
