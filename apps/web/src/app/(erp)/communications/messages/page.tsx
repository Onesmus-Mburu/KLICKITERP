"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { MessageResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ServerPaginationState, DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useMessages } from "@/features/comms/hooks/use-messages";
import { ChannelBadge } from "@/features/comms/components/channel-badge";
import { MessageStatusBadge } from "@/features/comms/components/message-status-badge";
import type { MessageStatus } from "@/features/comms/api/messages.api";

const DEFAULT_PAGE_SIZE = 10; // matches PAGE_SIZE_OPTIONS[0] (data-table.tsx) — the server's own DEFAULT_PAGE_SIZE (20) isn't one of those fixed options, per receipts/page.tsx's own precedent.
const ALL_STATUSES_VALUE = "__all__";
const MESSAGE_STATUSES: MessageStatus[] = ["QUEUED", "SENT", "DELIVERED", "FAILED", "OPTED_OUT"];

function formatTimestamp(value: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

/**
 * Phase 6 Slice 15 Part 3 — `comms:message:view`. READ-ONLY delivery-log
 * view of `comm_message` — no row actions, no create/edit/delete anywhere
 * on this page (confirmed against `MessagesController` directly: it has
 * exactly one route, `GET`, per that controller's own doc comment). Direct
 * structural mirror of `app/(erp)/billing/receipts/page.tsx`'s real
 * server-pagination precedent: `ServerPaginationState`, filter inputs that
 * reset `page` back to 1 on change via a `React.useEffect`.
 *
 * Filters: `status` (`<Select>`, the one real enum here) plus
 * `entityType`/`entityId`/`broadcastId` (plain `<Input>`s) — no dedicated
 * pickers exist for any of those three, same honest-plain-input reasoning
 * `optouts/page.tsx`'s own `guardianId` search gives (no directory to pick
 * from), per this part's own plan.
 */
export default function MessagesPage() {
  const t = useTranslations("communications.messages.list");
  const tStatus = useTranslations("communications.messages.statusValues");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [status, setStatus] = React.useState<MessageStatus | null>(null);
  const [entityType, setEntityType] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [broadcastId, setBroadcastId] = React.useState("");

  const query = useMessages({
    page,
    pageSize,
    status: status ?? undefined,
    entityType: entityType.trim() || undefined,
    entityId: entityId.trim() || undefined,
    broadcastId: broadcastId.trim() || undefined,
  });

  // A filter change is a genuinely different result set — page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [status, entityType, entityId, broadcastId]);

  const total = query.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const serverPagination: ServerPaginationState = {
    page,
    pageSize,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
  };

  const columns = React.useMemo<ColumnDef<MessageResponseDto>[]>(
    () => [
      { id: "channel", header: t("columns.channel"), cell: ({ row }) => <ChannelBadge channel={row.original.channel} /> },
      { accessorKey: "recipient", header: t("columns.recipient") },
      {
        id: "templateEvent",
        header: t("columns.templateEvent"),
        cell: ({ row }) => row.original.templateEvent ?? <span className="text-muted-foreground">—</span>,
      },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <MessageStatusBadge status={row.original.status} /> },
      {
        id: "provider",
        header: t("columns.provider"),
        cell: ({ row }) => row.original.provider ?? <span className="text-muted-foreground">—</span>,
      },
      { id: "sentAt", header: t("columns.sentAt"), cell: ({ row }) => formatTimestamp(row.original.sentAt) },
      { id: "deliveredAt", header: t("columns.deliveredAt"), cell: ({ row }) => formatTimestamp(row.original.deliveredAt) },
      {
        id: "error",
        header: t("columns.error"),
        cell: ({ row }) =>
          row.original.error ? <span className="text-destructive">{row.original.error}</span> : <span className="text-muted-foreground">—</span>,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("statusLabel")}</Label>
              <Select value={status ?? ALL_STATUSES_VALUE} onValueChange={(v) => setStatus(v === ALL_STATUSES_VALUE ? null : (v as MessageStatus))}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>{t("allStatuses")}</SelectItem>
                  {MESSAGE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("entityTypeLabel")}</Label>
              <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder={t("entityTypePlaceholder")} className="sm:w-44" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("entityIdLabel")}</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder={t("entityIdPlaceholder")} className="sm:w-64" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("broadcastIdLabel")}</Label>
              <Input value={broadcastId} onChange={(e) => setBroadcastId(e.target.value)} placeholder={t("broadcastIdPlaceholder")} className="sm:w-64" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
            {(data) => <DataTable columns={columns} data={data.items} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
