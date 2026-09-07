import { requireUser } from "@/lib/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireUser("settings");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Company details, logins, the Shopify connection and the lists used in forms.</p>
        <SettingsNav />
      </div>
      {children}
    </>
  );
}
