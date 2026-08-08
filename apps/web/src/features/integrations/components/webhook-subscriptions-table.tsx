"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { WebhookSubscriptionResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { WebhookSubscriptionStatusBadge } from "./webhook-subscription-status-badge";
import { EditWebhookSubscriptionDialog } from "./edit-webhook-subscription-dialog";
import { RotateWebhookSecretDialog } from "./rotate-webhook-secret-dialog";
import { DisableWebhookSubscriptionDialog } from "./disable-webhook-subscription-dialog";
import { EnableWebhookSubscriptionButton } from "./enable-webhook-subscription-button";

/** `WebhookSubscriptionsController.list()` returns a bare array (no `{items,total}` envelope, confirmed by reading the controller directly) — a plain, unpaginated `<DataTable>`, the same choice `<IntegrationsSettingsPage>`/`<AcademicCalendarPage>`'s own years table already make for an analogously small, un-paginated list. */
export function WebhookSubscriptionsTable({ subscriptions }: { subscriptions: WebhookSubscriptionResponseDto[] }) {
  const t = useTranslations("settings.webhooks");

  const columns = React.useMemo<ColumnDef<WebhookSubscriptionResponseDto>[]>(
    () => [
      { accessorKey: "url", header: t("columns.url"), cell: ({ row }) => <span className="break-all">{row.original.url}</span> },
      {
        id: "events",
        header: t("columns.events"),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.events.join(", ")}</span>,
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <WebhookSubscriptionStatusBadge isActive={row.original.isActive} />,
      },
      {
        id: "disabledReason",
        header: t("columns.disabledReason"),
        cell: ({ row }) => row.original.disabledReason ?? "—",
      },
      {
        id: "createdAt",
        header: t("columns.createdAt"),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <EditWebhookSubscriptionDialog subscription={row.original} />
            <RotateWebhookSecretDialog subscription={row.original} />
            {row.original.isActive ? (
              <DisableWebhookSubscriptionDialog subscription={row.original} />
            ) : (
              <EnableWebhookSubscriptionButton id={row.original.id} />
            )}
          </div>
        ),
      },
    ],
    [t],
  );

  return <DataTable columns={columns} data={subscriptions} />;
}
