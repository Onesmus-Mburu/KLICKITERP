"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FaVerificationResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { CreateVerificationDialog } from "@/features/fixed-assets/components/create-verification-dialog";
import { VerificationStatusBadge } from "@/features/fixed-assets/components/verification-status-actions";
import { useVerifications } from "@/features/fixed-assets/hooks/use-verifications";

const ALL_STATUSES = ["OPEN", "COUNTING", "REVIEW", "PENDING_APPROVAL", "POSTED", "CANCELLED"] as const;
type FaVerificationStatus = (typeof ALL_STATUSES)[number];

type Translate = ReturnType<typeof useTranslations>;

/** `scope.assetIds` is an opaque `Record<string, unknown>` on the response DTO (see `verification.dto.ts`'s own comment) — a plain, defensive read, never assumed shaped. */
function describeScope(scope: Record<string, unknown>, t: Translate): string {
  const assetIds = scope["assetIds"];
  if (assetIds === "ALL") return t("scopeAll");
  if (Array.isArray(assetIds)) return t("scopeExplicit", { count: assetIds.length });
  return t("scopeUnknown");
}

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — THE FINAL new route of
 * this whole slice. The Verifications list: `GET /fixed-assets/verifications
 * ?status=` (genuinely optional, confirmed by reading `VerificationController.list()`
 * directly) — a status `<Select>` filter + `<CreateVerificationDialog>`
 * trigger, mirroring `disposals/page.tsx`'s (Part 4) own list-page shape.
 * `fixed-assets:verification:create`-gated server-side (shared with create/
 * findOne/listLines/submit — see `verifications.api.ts`'s own doc comment).
 *
 * `scope` is rendered via `describeScope()` above rather than any per-row
 * asset-count query — the response DTO's own `scope` field already carries
 * enough to describe it (`"ALL"` vs an explicit array's own length), no
 * extra fetch needed.
 */
export default function VerificationsPage() {
  const t = useTranslations("fixedAssets.verifications.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = React.useState<FaVerificationStatus | "">("");

  const verificationsQuery = useVerifications({ status: status || undefined });

  const columns = React.useMemo<ColumnDef<FaVerificationResponseDto>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => row.original.number },
      { id: "scope", header: t("columns.scope"), cell: ({ row }) => describeScope(row.original.scope, t) },
      { id: "snapshotAt", header: t("columns.snapshotAt"), cell: ({ row }) => new Date(row.original.snapshotAt).toLocaleString() },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <VerificationStatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/fixed-assets/verifications/${row.original.id}`);
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
        <CreateVerificationDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("filters.statusLabel")}</Label>
            <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : (v as FaVerificationStatus))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filters.allStatuses")}</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <VerificationStatusBadge status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QueryBoundary query={verificationsQuery} isEmpty={(d) => d.length === 0}>
            {(verifications) => (
              <DataTable columns={columns} data={verifications} onRowClick={(v) => router.push(`/fixed-assets/verifications/${v.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
