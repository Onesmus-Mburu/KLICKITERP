"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleDot, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMySession } from "../hooks/use-sessions";
import { SessionOpenDialog } from "./session-open-dialog";
import { SessionCloseDialog } from "./session-close-dialog";

/**
 * Session state matters from anywhere in the app, not just the payments
 * pages (per the plan) — a persistent topbar client island, alongside
 * `NotificationBell`/`ThemeToggle`/`UserMenu` (see `components/layout/topbar.tsx`'s
 * own composition, which this is added to unchanged in shape).
 *
 * A 403 (a role with no `payments:session:view`) or the loading state both
 * render nothing — this widget is a convenience surface, not the
 * enforcement boundary (the real one is the payments screens' own
 * `<QueryBoundary>`), so it degrades silently rather than cluttering every
 * screen in the app with an error banner for a role that simply isn't a
 * cashier.
 */
export function SessionStatusWidget() {
  const t = useTranslations("payments.sessionWidget");
  const sessionQuery = useMySession();

  if (sessionQuery.isLoading || sessionQuery.isError) return null;

  const session = sessionQuery.data;

  return (
    <div className="flex items-center gap-2">
      {session ? (
        <>
          <Badge variant="soft-success" className="gap-1">
            <CircleDot className="size-3" />
            {t("openLabel", { till: session.till })}
          </Badge>
          <SessionCloseDialog session={session} />
        </>
      ) : (
        <>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Circle className="size-3" />
            {t("closedLabel")}
          </Badge>
          <SessionOpenDialog />
        </>
      )}
      <Link href="/payments" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
        {t("viewLink")}
      </Link>
    </div>
  );
}
