"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { WebhookDeliveryResponseDto, WebhookSubscriptionResponseDto } from "@klickit/contracts";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { WebhookDeliveryStatusBadge } from "./webhook-delivery-status-badge";
import { RetryWebhookDeliveryButton } from "./retry-webhook-delivery-button";

/** `WebhookDeliveriesController.list()` genuinely returns `{items, meta}` (confirmed by reading the controller directly) — a real `<DataTable serverPagination>`, unlike the subscriptions list above. `subscriptions` is only used to resolve a readable label (the delivery row itself only carries `subscriptionId`, no joined URL). */
export function WebhookDeliveriesTable({
  deliveries,
  subscriptions,
  serverPagination,
}: {
  deliveries: WebhookDeliveryResponseDto[];
  subscriptions: WebhookSubscriptionResponseDto[];
  serverPagination: ServerPaginationState;
}) {
  const t = useTranslations("settings.webhooks.deliveries");

  const subscriptionUrlById = React.useMemo(() => new Map(subscriptions.map((s) => [s.id, s.url])), [subscriptions]);

  const columns = React.useMemo<ColumnDef<WebhookDeliveryResponseDto>[]>(
    () => [
      {
        id: "subscription",
        header: t("columns.subscription"),
        cell: ({ row }) => (
          <span className="break-all text-xs">{subscriptionUrlById.get(row.original.subscriptionId) ?? row.original.subscriptionId}</span>
        ),
      },
      { accessorKey: "eventType", header: t("columns.eventType") },
      { accessorKey: "attempt", header: t("columns.attempt") },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <WebhookDeliveryStatusBadge status={row.original.status} /> },
      { id: "responseCode", header: t("columns.responseCode"), cell: ({ row }) => row.original.responseCode ?? "—" },
      { id: "nextRetryAt", header: t("columns.nextRetryAt"), cell: ({ row }) => new Date(row.original.nextRetryAt).toLocaleString() },
      { id: "createdAt", header: t("columns.createdAt"), cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => <RetryWebhookDeliveryButton id={row.original.id} />,
      },
    ],
    [t, subscriptionUrlById],
  );

  return <DataTable columns={columns} data={deliveries} serverPagination={serverPagination} />;
}
