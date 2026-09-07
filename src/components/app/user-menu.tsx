"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { ChevronsUpDown, LogOut, Moon, Sun, KeyRound } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { logout } from "@/actions/auth";
import type { SafeUser } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user, variant = "sidebar" }: { user: SafeUser; variant?: "sidebar" | "header" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [pending, start] = useTransition();
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto justify-start gap-2.5 px-2 py-2",
              variant === "sidebar" && "w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          />
        }
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
            variant === "sidebar" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          {initials}
        </span>
        {variant === "sidebar" ? (
          <>
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs opacity-65">{ROLE_LABELS[user.role]}</span>
            </span>
            <ChevronsUpDown className="size-4 opacity-60" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}>
          <KeyRound />
          Change password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={pending} onClick={() => start(() => logout())}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
