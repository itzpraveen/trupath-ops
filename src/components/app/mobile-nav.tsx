"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { Role } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { Brand } from "./brand";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
        <SheetHeader className="border-b border-sidebar-border px-5 py-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
        </SheetHeader>
        <div className="overflow-y-auto">
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
