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
import {
  BANK_DEPOSIT_WITHDRAWAL_STATUSES,
  isDraftPlaceholderNumber,
  useDepositsOrWithdrawals,
  type BankDepositWithdrawalStatus,
  type DepositWithdrawal,
  type DepositWithdrawalKind,
} from "../hooks/use-deposits-withdrawals";
import { CreateDepositWithdrawalDialog } from "./create-deposit-withdrawal-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern every prior part's own filters bar already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared list body for
 * BOTH `/banking/deposits` and `/banking/withdrawals`, parameterized by
 * `kind` (the same shared-implementation shape every other component in this
 * part establishes). Card + status/account `<Select>` filters (both real
 * server-side query params) + `<DataTable>` inside `<QueryBoundary>`, row
 * click navigates to `/banking/{kind}s/[id]` — the same shape
 * `procurement/payment-vouchers/page.tsx` already establishes.
 * `banking:{deposit,withdrawal}:create`-gated server-side per `kind` — the
 * SAME permission also gates this list (see `deposits-withdrawals.api.ts`'s
 * own doc comment), so a role missing it hits `<QueryBoundary>`'s own
 * permission-denied state.
 *
 * The `account` column resolves `accountId` to the bank account's own real
 * `name` via Part 1's own `features/banking/hooks/use-accounts.ts`, the same
 * client-side lookup-map pattern `payment-vouchers/[id]/page.tsx`'s own
 * `invoiceNumberById` already establishes for an analogous foreign id.
 */
export function DepositWithdrawalList({ kind }: { kind: DepositWithdrawalKind }) {
  const t = useTranslations(`banking.${kind}s.list`);
  const tStatuses = useTranslations("banking.statuses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = React.useState<BankDepositWithdrawalStatus | "">("");
  const [accountId, setAccountId] = React.useState("");

  const docsQuery = useDepositsOrWithdrawals(kind, { ...(status ? { status } : {}), ...(accountId ? { accountId } : {}) });
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<DepositWithdrawal>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetPosted") : row.original.number) },
      { id: "account", header: t("columns.account"), cell: ({ row }) => accountNameById.get(row.original.accountId) ?? row.original.accountId },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      { id: "slipRef", header: t("columns.slipRef"), cell: ({ row }) => row.original.slipRef ?? "—" },
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
              router.push(`/banking/${kind}s/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, accountNameById, tCommon, router, kind],
  );

  const hasActiveFilters = !!(status || accountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateDepositWithdrawalDialog kind={kind} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as BankDepositWithdrawalStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BANK_DEPOSIT_WITHDRAWAL_STATUSES.map((s) => (
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

          <QueryBoundary query={docsQuery} isEmpty={(d) => d.length === 0}>
            {(docs) => <DataTable columns={columns} data={docs} onRowClick={(d) => router.push(`/banking/${kind}s/${d.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
