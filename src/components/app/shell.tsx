import type { SafeUser } from "@/db/schema";
import { BottomNav } from "./bottom-nav";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function AppShell({ user, children }: { user: SafeUser; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-4">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav role={user.role} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur md:hidden">
          <MobileNav role={user.role} />
          <div className="flex-1 pl-1 text-sm font-semibold">TruPath Ops</div>
          <UserMenu user={user} variant="header" />
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <BottomNav role={user.role} />
      </div>
    </div>
  );
}
