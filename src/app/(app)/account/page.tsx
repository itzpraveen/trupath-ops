import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Section } from "@/components/app/page-header";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-lg">
      <PageHeader title="Your account" description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`} />
      <Section title="Change password">
        <PasswordForm />
      </Section>
    </div>
  );
}
