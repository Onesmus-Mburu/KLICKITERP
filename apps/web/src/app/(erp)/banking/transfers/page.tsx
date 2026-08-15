"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
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
  BANK_TRANSFER_STATUSES,
  isDraftPlaceholderNumber,
  useTransfers,
  type BankTransferResponseDto,
  type BankTransferStatus,
} from "@/features/banking/hooks/use-transfers";
import { CreateTransferDialog } from "@/features/banking/components/create-transfer-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern every prior part's own filters bar already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — the Transfers list: Card +
 * status/account `<Select>` filters (both real server-side query params,
 * `GET /banking/transfers?status=&accountId=` — `accountId` matches EITHER
 * leg, see `transfers.api.ts`'s own doc comment) + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to `/banking/transfers/[id]` — the
 * same shape `procurement/payment-vouchers/page.tsx` already establishes.
 * `banking:transfer:create`-gated server-side — the SAME permission also
 * gates this list (see `transfers.api.ts`'s own doc comment).
 */
export default function TransfersPage() {
  const t = useTranslations("banking.transfers.list");
  const tStatuses = useTranslations("banking.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<BankTransferStatus | "">("");
  const [accountId, setAccountId] = React.useState("");

  const transfersQuery = useTransfers({ ...(status ? { status } : {}), ...(accountId ? { accountId } : {}) });
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<BankTransferResponseDto>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetPosted") : row.original.number) },
      { id: "fromAccount", header: t("columns.fromAccount"), cell: ({ row }) => accountNameById.get(row.original.fromAccountId) ?? row.original.fromAccountId },
      { id: "toAccount", header: t("columns.toAccount"), cell: ({ row }) => accountNameById.get(row.original.toAccountId) ?? row.original.toAccountId },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
    ],
    [t, tStatuses, accountNameById],
  );

  const hasActiveFilters = !!(status || accountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateTransferDialog />
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
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as BankTransferStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BANK_TRANSFER_STATUSES.map((s) => (
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

          <QueryBoundary query={transfersQuery} isEmpty={(d) => d.length === 0}>
            {(transfers) => <DataTable columns={columns} data={transfers} onRowClick={(tr) => router.push(`/banking/transfers/${tr.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
