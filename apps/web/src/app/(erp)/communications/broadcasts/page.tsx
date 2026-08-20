"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { BroadcastResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useBroadcasts } from "@/features/comms/hooks/use-broadcasts";
import { CreateBroadcastDialog } from "@/features/comms/components/create-broadcast-dialog";
import { BroadcastStatusBadge } from "@/features/comms/components/broadcast-status-badge";
import { ChannelBadge } from "@/features/comms/components/channel-badge";

/**
 * Phase 6 Slice 15 Part 2 — `comms:broadcast:view`/`:create`. Direct
 * structural mirror of `app/(erp)/roles/page.tsx` (Card + a `<DataTable>`
 * inside `<QueryBoundary isEmpty>`, a create-dialog trigger in the header,
 * row click navigates to `/communications/broadcasts/[id]` via
 * `<DataTable>`'s `onRowClick` prop) — unlike Templates (Part 1, no detail
 * page), a broadcast's real submit/approve/cancel/send actions live on its
 * own detail page, the same "row click -> detail" shape Roles already
 * established for its own module-scoped permission table.
 *
 * No search field (unlike Templates'/Roles' own client-side search) —
 * `GET /comms/broadcasts` is unpaginated (confirmed by reading
 * `BroadcastsController.list()` directly) but this part's plan doesn't call
 * for one, and broadcast volume is expected to stay low (an explicit
 * "campaign" action, not a per-record entity like templates/roles) — can be
 * added later if real usage shows it's needed.
 */
export default function BroadcastsPage() {
  const t = useTranslations("communications.broadcasts.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const broadcastsQuery = useBroadcasts();

  const columns = React.useMemo<ColumnDef<BroadcastResponseDto>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title") },
      { id: "channel", header: t("columns.channel"), cell: ({ row }) => <ChannelBadge channel={row.original.channel} /> },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <BroadcastStatusBadge status={row.original.status} /> },
      { accessorKey: "recipientCount", header: t("columns.recipientCount") },
      {
        id: "createdAt",
        header: t("columns.createdAt"),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/communications/broadcasts/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateBroadcastDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={broadcastsQuery} isEmpty={(d) => d.length === 0}>
            {(broadcasts) => (
              <DataTable columns={columns} data={broadcasts} onRowClick={(b) => router.push(`/communications/broadcasts/${b.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
