"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Smartphone } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { DeviceTokenResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useMyDeviceTokens } from "@/features/comms/hooks/use-device-tokens";
import { RegisterDeviceTokenDialog } from "@/features/comms/components/register-device-token-dialog";
import { UnregisterDeviceTokenButton } from "@/features/comms/components/unregister-device-token-button";
import { maskDeviceToken } from "@/features/comms/api/device-tokens.api";

const PLATFORM_VARIANT: Record<DeviceTokenResponseDto["platform"], NonNullable<BadgeProps["variant"]>> = {
  IOS: "soft-primary",
  ANDROID: "soft-success",
  WEB: "soft-secondary",
};

/**
 * Phase 6 Slice 15 Part 4 (the slice's final part) — `/my-devices`, reached
 * from the user-account dropdown (`UserMenu`), NOT the Comms nav dropdown
 * (that dropdown reached its final shape in Part 3 — see that part's own
 * closing comment; this screen is deliberately not one of its children).
 * Genuinely self-service: `GET /comms/device-tokens` always returns only
 * the caller's own rows (no `@RequirePermission` anywhere on
 * `DeviceTokensController` — JWT-authenticated only, per that controller's
 * own doc comment, mirroring `AuthController`'s self-service endpoints), so
 * this page needs no permission gate.
 *
 * Deliberately lives under `app/(erp)/`, WITH the normal sidebar/topbar
 * chrome — unlike `/change-password` (the other user-menu-reached screen),
 * which deliberately has none because it's a FORCED, pre-full-session
 * screen reachable before a normal app session exists. This is the opposite
 * case: a genuine in-app account-settings screen for an
 * already-fully-authenticated user browsing their own account.
 *
 * A real, honest constraint this page is built around, not a bug to hide:
 * there is no mobile/PWA client anywhere in this codebase that produces
 * real device tokens today (no push-notification-capable frontend exists),
 * so this list is expected to be genuinely empty for every real user right
 * now. `isEmpty={() => false}` deliberately opts this page OUT of
 * `<QueryBoundary>`'s own generic "Nothing here yet" empty state (the
 * shared `queryBoundary.emptyTitle`/`emptyDescription` copy every other
 * list in this app reuses as-is) so a device-specific, honestly-worded
 * empty message can be shown instead, right below — still inside the same
 * `<QueryBoundary>` for its loading/error/permission-denied/offline states,
 * which behave identically to every other list page.
 */
export default function MyDevicesPage() {
  const t = useTranslations("myDevices");
  const tPlatforms = useTranslations("myDevices.platforms");
  const query = useMyDeviceTokens();

  const columns = React.useMemo<ColumnDef<DeviceTokenResponseDto>[]>(
    () => [
      {
        id: "platform",
        header: t("columns.platform"),
        cell: ({ row }) => <Badge variant={PLATFORM_VARIANT[row.original.platform]}>{tPlatforms(row.original.platform)}</Badge>,
      },
      {
        id: "token",
        header: t("columns.token"),
        cell: ({ row }) => <span className="font-mono text-xs">{maskDeviceToken(row.original.token)}</span>,
      },
      { id: "lastSeenAt", header: t("columns.lastSeenAt"), cell: ({ row }) => new Date(row.original.lastSeenAt).toLocaleString() },
      { id: "createdAt", header: t("columns.createdAt"), cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
      { id: "actions", header: t("columns.actions"), cell: ({ row }) => <UnregisterDeviceTokenButton device={row.original} /> },
    ],
    [t, tPlatforms],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <RegisterDeviceTokenDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={() => false}>
            {(devices) =>
              devices.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
                    <Smartphone className="size-5 text-primary" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{t("emptyDescription")}</p>
                </div>
              ) : (
                <DataTable columns={columns} data={devices} />
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
