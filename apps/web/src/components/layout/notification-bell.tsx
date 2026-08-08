"use client";

import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Notification-center CHROME only, per docs/phase-6/PROGRESS.md scope item
 * 7 ("sidebar/topbar/notification-center layout"). `platform/comms` has
 * real message endpoints, but wiring this bell to them is explicitly out of
 * this slice's scope (no comms/notifications module screen is built here)
 * — honestly an empty state, not a fake unread count. Slice 1.5b (visual
 * polish iteration): no unread-count badge was added here — there is still
 * no real signal to drive one (grep-confirmed: nothing in this component or
 * its call sites reads an unread count from `platform/comms`), so per this
 * round's own "don't fabricate data" instruction, this stays a clean,
 * honestly-empty state, just given real visual treatment (an icon + two
 * lines of copy consistent with `<QueryBoundary>`'s new empty-state
 * pattern) instead of a bare "—".
 */
export function NotificationBell() {
  const t = useTranslations("shell.topbar");
  const tqb = useTranslations("queryBoundary");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("notifications")}>
          <Bell className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
            <BellOff className="size-5 text-primary" />
          </span>
          <p className="text-sm font-medium text-foreground">{tqb("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{tqb("emptyDescription")}</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
