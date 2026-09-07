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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground">T</span>
          <div>
            <p className="text-base font-semibold leading-tight">TruPath Ops</p>
            <p className="text-sm text-sidebar-foreground/70">Trupaths Ventures</p>
          </div>
        </div>
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-semibold leading-tight">Everything the business did today, in one place.</h1>
          <p className="text-base leading-relaxed text-sidebar-foreground/75">
            Website orders arrive on their own. The factory records what it made and what it used. Stock, dispatch and expenses stay
            in step, so the owner sees the whole picture without chasing anyone.
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/60">Baby Gambling and Firstbon, made in Kerala.</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">T</span>
            <div>
              <p className="text-base font-semibold leading-tight">TruPath Ops</p>
              <p className="text-sm text-muted-foreground">Trupaths Ventures</p>
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the login the owner gave you.</p>
          </div>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </section>
    </div>
  );
}
