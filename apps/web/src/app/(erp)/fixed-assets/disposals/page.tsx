"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FaDisposalResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useAssets } from "@/features/fixed-assets/hooks/use-assets";
import { CreateDisposalDialog } from "@/features/fixed-assets/components/create-disposal-dialog";
import { DisposalStatusBadge } from "@/features/fixed-assets/components/disposal-status-actions";
import { useDisposals } from "@/features/fixed-assets/hooks/use-disposals";

const ALL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"] as const;
type FaDisposalStatus = (typeof ALL_STATUSES)[number];

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — the Disposals list:
 * `GET /fixed-assets/disposals?status=` (genuinely optional, confirmed by
 * reading `DisposalController.list()` directly) — a status `<Select>` filter
 * + `<CreateDisposalDialog>` trigger, mirroring
 * `depreciation-runs/page.tsx`'s (Part 3) own list-page shape.
 * `fixed-assets:disposal:create`-gated server-side (shared with create/
 * findOne/submit — see `disposals.api.ts`'s own doc comment).
 *
 * Each row's `assetId` resolves to a real `code — name` label via Part 1's
 * own `useAssets()` (a single full-list fetch, mapped by id — cheaper than
 * one `useAsset()` call per row), falling back to the raw id while loading
 * or on a resolution failure, the same cross-feature-read-for-display
 * resilience `depreciation-run-lines-table.tsx` already establishes.
 */
export default function DisposalsPage() {
  const t = useTranslations("fixedAssets.disposals.list");
  const tMethods = useTranslations("fixedAssets.disposalMethods");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = React.useState<FaDisposalStatus | "">("");

  const disposalsQuery = useDisposals({ status: status || undefined });
  const assetsQuery = useAssets();
  const assetById = React.useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a])), [assetsQuery.data]);

  const columns = React.useMemo<ColumnDef<FaDisposalResponseDto>[]>(
    () => [
      {
        id: "asset",
        header: t("columns.asset"),
        cell: ({ row }) => {
          const asset = assetById.get(row.original.assetId);
          return asset ? `${asset.code} — ${asset.name}` : row.original.assetId;
        },
      },
      { id: "method", header: t("columns.method"), cell: ({ row }) => tMethods(row.original.method) },
      { id: "proceeds", header: t("columns.proceeds"), cell: ({ row }) => formatMoney(row.original.proceeds) },
      { id: "gainLoss", header: t("columns.gainLoss"), cell: ({ row }) => (row.original.gainLoss ? formatMoney(row.original.gainLoss) : "—") },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <DisposalStatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/fixed-assets/disposals/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tMethods, assetById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateDisposalDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("filters.statusLabel")}</Label>
            <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : (v as FaDisposalStatus))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filters.allStatuses")}</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <DisposalStatusBadge status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QueryBoundary query={disposalsQuery} isEmpty={(d) => d.length === 0}>
            {(disposals) => (
              <DataTable columns={columns} data={disposals} onRowClick={(d) => router.push(`/fixed-assets/disposals/${d.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
