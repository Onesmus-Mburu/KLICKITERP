"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Eye, X } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { BACKUP_RUN_KINDS, BACKUP_RUN_STATUSES, type BackupRunKind, type BackupRunResponseDto, type BackupRunStatus } from "@/features/backups-ops/api/backups.api";
import { useBackupRuns } from "@/features/backups-ops/hooks/use-backups";
import { formatBytes } from "@/features/backups-ops/lib/format-bytes";
import { RunBackupDialog } from "@/features/backups-ops/components/run-backup-dialog";
import { PruneButton } from "@/features/backups-ops/components/prune-button";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern `supplier-invoices/page.tsx` (Procurement, Part 4) already established.
const DEFAULT_PAGE_SIZE = 20; // Matches `BackupsController.list()`'s own server-side default.

const STATUS_BADGE_VARIANT: Record<BackupRunStatus, BadgeProps["variant"]> = {
  RUNNING: "soft-warning",
  OK: "soft-success",
  FAILED: "soft-destructive",
};

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `GET /backups?kind=&status=&page=&pageSize=`,
 * `backups:run:view` (a genuinely separate, narrower permission than
 * `backups:run:create`, which only gates the "Run Backup Now" button's own
 * mutation — never client-side hidden, same "coarse nav gate, granular
 * in-screen gates" precedent every other multi-permission screen in this
 * codebase already establishes). Real server pagination (page/pageSize/kind/
 * status all wired to the real query), row click navigates to
 * `/ops/backups/[id]`.
 */
export default function BackupsListPage() {
  const t = useTranslations("backupsOps.list");
  const tCommon = useTranslations("common");
  const tKinds = useTranslations("backupsOps.kinds");
  const tStatuses = useTranslations("backupsOps.statuses");
  const router = useRouter();

  const [kind, setKind] = React.useState<BackupRunKind | "">("");
  const [status, setStatus] = React.useState<BackupRunStatus | "">("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  const runsQuery = useBackupRuns({ ...(kind ? { kind } : {}), ...(status ? { status } : {}), page, pageSize });

  const total = runsQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, runsQuery.data?.meta.pageCount ?? 1);
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

  const columns = React.useMemo<ColumnDef<BackupRunResponseDto>[]>(
    () => [
      { id: "kind", header: t("columns.kind"), cell: ({ row }) => <Badge variant="soft-secondary">{tKinds(row.original.kind)}</Badge> },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status]}>{tStatuses(row.original.status)}</Badge>,
      },
      { id: "startedAt", header: t("columns.startedAt"), cell: ({ row }) => new Date(row.original.startedAt).toLocaleString() },
      { id: "size", header: t("columns.size"), cell: ({ row }) => formatBytes(row.original.sizeBytes) },
      { id: "sha256", header: t("columns.sha256"), cell: ({ row }) => (row.original.sha256 ? `${row.original.sha256.slice(0, 12)}…` : "—") },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/ops/backups/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tKinds, tStatuses, tCommon, router],
  );

  const hasActiveFilters = !!(kind || status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/ops">
              {t("viewHealthLink")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <PruneButton />
          <RunBackupDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.kindLabel")}</Label>
              <Select
                value={kind || ALL_SENTINEL}
                onValueChange={(v) => {
                  setKind(v === ALL_SENTINEL ? "" : (v as BackupRunKind));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allKinds")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allKinds")}</SelectItem>
                  {BACKUP_RUN_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select
                value={status || ALL_SENTINEL}
                onValueChange={(v) => {
                  setStatus(v === ALL_SENTINEL ? "" : (v as BackupRunStatus));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BACKUP_RUN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKind("");
                  setStatus("");
                  setPage(1);
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={runsQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => (
              <DataTable
                columns={columns}
                data={data.items}
                serverPagination={{ ...serverPagination, totalPages: Math.max(1, data.meta.pageCount) }}
                onRowClick={(run) => router.push(`/ops/backups/${run.id}`)}
              />
            )}
          </QueryBoundary>
          {total > 0 && <p className="text-xs text-muted-foreground">{t("totalCount", { count: total })}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
