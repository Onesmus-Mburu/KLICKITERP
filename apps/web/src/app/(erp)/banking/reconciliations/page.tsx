"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { usePeriod } from "@/features/accounting/hooks/use-periods";
import {
  BANK_RECONCILIATION_STATUSES,
  useReconciliations,
  type BankReconciliation,
  type BankReconciliationStatus,
} from "@/features/banking/hooks/use-reconciliation";
import { StartReconciliationDialog } from "@/features/banking/components/start-reconciliation-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` for an "all" option — same pattern every prior part's own filters bar already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  IN_PROGRESS: "soft-warning",
  LOCKED: "soft-success",
  REOPENED: "soft-destructive",
};

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — the Reconciliations list:
 * Card + account/status `<Select>` filters (both real server-side query
 * params, `GET /banking/reconciliations?accountId=&status=`) +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to
 * `/banking/reconciliations/[id]` — the same shape every prior Banking list
 * page in this slice already establishes. `banking:reconciliation:manage`-
 * gated server-side — the SAME permission also gates this list (see
 * `reconciliation.api.ts`'s own doc comment).
 *
 * The period column resolves each row's own `periodId` via a small
 * `<PeriodLabel>` cell component (its own `usePeriod()` call — a real
 * component, not an inline hook call inside the `cell` callback, so React's
 * rules of hooks hold) — there is no bulk "list every period across every
 * fiscal year" endpoint to build a single client-side lookup map from the
 * way `accountNameById` below is built from one `useBankAccounts()` call.
 */
export default function ReconciliationsPage() {
  const t = useTranslations("banking.reconciliations.list");
  const tCommon = useTranslations("common");
  const tStatuses = useTranslations("banking.reconciliations.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<BankReconciliationStatus | "">("");
  const [accountId, setAccountId] = React.useState("");

  const reconciliationsQuery = useReconciliations({ ...(status ? { status } : {}), ...(accountId ? { accountId } : {}) });
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<BankReconciliation>[]>(
    () => [
      { id: "account", header: t("columns.account"), cell: ({ row }) => accountNameById.get(row.original.accountId) ?? row.original.accountId },
      { id: "period", header: t("columns.period"), cell: ({ row }) => <PeriodLabel periodId={row.original.periodId} /> },
      { id: "bookBalance", header: t("columns.bookBalance"), cell: ({ row }) => formatMoney(row.original.bookBalance) },
      { id: "bankBalance", header: t("columns.bankBalance"), cell: ({ row }) => formatMoney(row.original.bankBalance) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
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
              router.push(`/banking/reconciliations/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, accountNameById, tCommon, router],
  );

  const hasActiveFilters = !!(status || accountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <StartReconciliationDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as BankReconciliationStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BANK_RECONCILIATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.accountLabel")}</Label>
              <Select value={accountId || ALL_SENTINEL} onValueChange={(v) => setAccountId(v === ALL_SENTINEL ? "" : v)} disabled={accountsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allAccounts")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allAccounts")}</SelectItem>
                  {(accountsQuery.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
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
                  setStatus("");
                  setAccountId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={reconciliationsQuery} isEmpty={(d) => d.length === 0}>
            {(reconciliations) => (
              <DataTable columns={columns} data={reconciliations} onRowClick={(r) => router.push(`/banking/reconciliations/${r.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodLabel({ periodId }: { periodId: string }) {
  const periodQuery = usePeriod(periodId);
  if (!periodQuery.data) return <span className="text-muted-foreground">{periodId.slice(0, 8)}</span>;
  return (
    <span>
      {periodQuery.data.startsOn} — {periodQuery.data.endsOn}
    </span>
  );
}
