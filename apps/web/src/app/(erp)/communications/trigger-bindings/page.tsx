"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { TriggerBindingResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useTriggerBindings } from "@/features/comms/hooks/use-trigger-bindings";
import { CreateTriggerBindingDialog } from "@/features/comms/components/create-trigger-binding-dialog";
import { EditTriggerBindingDialog } from "@/features/comms/components/edit-trigger-binding-dialog";
import { ChannelBadge } from "@/features/comms/components/channel-badge";

/**
 * Phase 6 Slice 15 Part 3 — `comms:trigger-binding:view`/`:manage`. Direct
 * structural mirror of `app/(erp)/communications/templates/page.tsx` (Card +
 * a `<DataTable>` inside `<QueryBoundary isEmpty>`, a create-dialog trigger
 * in the header, per-row edit action) — no delete action anywhere (no
 * delete route exists, per `trigger-bindings.api.ts`'s own doc comment).
 *
 * No search field, unlike Templates' own client-side search — `GET
 * /comms/trigger-bindings` is unpaginated (confirmed by reading
 * `TriggerBindingsController.list()` directly) and this part's plan doesn't
 * call for one (small, admin-configured dataset — this part's own plan
 * explicitly notes "no search needed").
 */
export default function TriggerBindingsPage() {
  const t = useTranslations("communications.triggerBindings.list");
  const tCommon = useTranslations("common");
  const bindingsQuery = useTriggerBindings();

  const columns = React.useMemo<ColumnDef<TriggerBindingResponseDto>[]>(
    () => [
      { accessorKey: "eventCode", header: t("columns.eventCode") },
      { id: "channel", header: t("columns.channel"), cell: ({ row }) => <ChannelBadge channel={row.original.channel} /> },
      {
        id: "isEnabled",
        header: t("columns.isEnabled"),
        cell: ({ row }) => (
          <Badge variant={row.original.isEnabled ? "soft-success" : "soft-secondary"}>
            {row.original.isEnabled ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => <EditTriggerBindingDialog binding={row.original} />,
      },
    ],
    [t, tCommon],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateTriggerBindingDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={bindingsQuery} isEmpty={(d) => d.length === 0}>
            {(bindings) => <DataTable columns={columns} data={bindings} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
