"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { isDraftPlaceholderNumber } from "@/features/expenses/api/vouchers.api";
import { CreateClaimDialog } from "@/features/expenses/components/create-claim-dialog";
import { CLAIM_STATUSES, useClaims, type ClaimResponseDto, type ClaimStatus } from "@/features/expenses/hooks/use-claims";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — the same sentinel pattern Part 1's own `vouchers/page.tsx` filters bar already establishes.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  REIMBURSED: "success",
  REJECTED: "soft-destructive",
  CANCELLED: "outline",
};

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — the Staff Claims list:
 * Card + a staff `<Combobox>` filter + a status `<Select>` filter +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to detail — the
 * same shape `vouchers/page.tsx` (Part 1) already establishes for its own
 * sibling sub-domain. `expenses:claim:create`-gated server-side (reused for
 * every GET too, no separate view permission — see `claims.api.ts`'s own doc
 * comment); a role missing it hits `<QueryBoundary>`'s own permission-denied
 * state.
 *
 * **The `number` column is honest about the `DRAFT-<uuid-prefix>` placeholder**
 * (`isDraftPlaceholderNumber()`, imported directly from `vouchers.api.ts` —
 * a plain, stateless string check with no request/response coupling to
 * Vouchers at all, the same in-module reuse `claims.api.ts` itself already
 * establishes for `VOUCHER_METHODS`) — shows a plain "Not yet allocated"
 * label instead of the ugly raw placeholder, matching Part 1's own treatment.
 *
 * **The staff filter is a single `<Combobox>`, not a sentinel-item-bearing
 * one** — clearing it (along with the status filter) is handled by the one
 * shared "Clear filters" button below, the same combined-clear affordance
 * `vouchers/page.tsx`'s own status-only filter bar establishes, extended here
 * to 2 filters at once.
 */
export default function ExpenseClaimsPage() {
  const t = useTranslations("expenses.claims.list");
  const tStatuses = useTranslations("expenses.claims.statuses");
  const tReimburseVia = useTranslations("expenses.claims.reimburseVia");
  const router = useRouter();
  const [staffUserId, setStaffUserId] = React.useState("");
  const [status, setStatus] = React.useState<ClaimStatus | "">("");

  const claimsQuery = useClaims({ staffUserId: staffUserId || undefined, status: status || undefined });
  const usersQuery = useUsersLookup();

  const staffNameById = React.useMemo(
    () => new Map((usersQuery.data?.items ?? []).map((u) => [u.id, `${u.fullName} (${u.username})`])),
    [usersQuery.data],
  );

  const staffItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const columns = React.useMemo<ColumnDef<ClaimResponseDto>[]>(
    () => [
      {
        id: "number",
        header: t("columns.number"),
        cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetAllocated") : row.original.number),
      },
      {
        id: "staff",
        header: t("columns.staff"),
        cell: ({ row }) => staffNameById.get(row.original.staffUserId) ?? row.original.staffUserId,
      },
      { id: "reimburseVia", header: t("columns.reimburseVia"), cell: ({ row }) => tReimburseVia(row.original.reimburseVia) },
      { id: "total", header: t("columns.total"), cell: ({ row }) => formatMoney(row.original.total) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tReimburseVia, tStatuses, staffNameById],
  );

  const hasFilters = !!staffUserId || !!status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateClaimDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64 space-y-1.5">
              <Label>{t("filters.staffLabel")}</Label>
              <Combobox
                items={staffItems}
                value={staffUserId}
                onChange={setStaffUserId}
                placeholder={usersQuery.isLoading ? t("filters.loadingStaff") : t("filters.allStaff")}
                searchPlaceholder={t("filters.searchStaff")}
                emptyText={t("filters.noStaffFound")}
                disabled={usersQuery.isLoading}
              />
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as ClaimStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {CLAIM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStaffUserId("");
                  setStatus("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={claimsQuery} isEmpty={(d) => d.length === 0}>
            {(claims) => <DataTable columns={columns} data={claims} onRowClick={(c) => router.push(`/expenses/claims/${c.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
