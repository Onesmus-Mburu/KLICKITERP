"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, LogOut, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/lib/auth-store";
import { endSession } from "@/lib/session-api";

/**
 * Slice 1.5b (visual polish iteration): derives up-to-2-letter initials from
 * the REAL `user.fullName` (no fabricated data — same string the old
 * text-only trigger already rendered, just also projected onto the avatar).
 */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Shared avatar bubble — tint-primary background, primary text, matching the tint-token pattern KpiCard's icon badges already established. */
function UserAvatar({ fullName, className }: { fullName: string; className?: string }) {
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-tint-primary text-xs font-semibold text-primary ${className ?? ""}`}>
      {getInitials(fullName)}
    </span>
  );
}

export function UserMenu() {
  const t = useTranslations("shell.userMenu");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  async function handleSignOut() {
    await endSession();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <UserAvatar fullName={user.fullName} />
          <span className="hidden text-sm font-medium sm:inline">{user.fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center gap-3 py-1">
            <UserAvatar fullName={user.fullName} className="size-10 text-sm" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{user.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user.roles.join(", ")}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/change-password")}>
          <KeyRound className="size-4" /> {t("changePassword")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/my-devices")}>
          <Smartphone className="size-4" /> {t("myDevices")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-tint-destructive focus:text-destructive">
          <LogOut className="size-4" /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
