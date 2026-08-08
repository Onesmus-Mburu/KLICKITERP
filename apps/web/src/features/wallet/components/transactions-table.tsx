"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { domains_wallet_wallet_transaction_schema } from "@klickit/contracts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { WALLET_TRANSACTION_TYPES } from "../constants";

type WalletTransactionResponseDto = domains_wallet_wallet_transaction_schema.WalletTransactionResponseDto;

const ALL_TYPES = "ALL";

/**
 * Phase 6 Slice 11 (Part 2) — the wallet detail page's transaction ledger.
 * `GET wallets/:id/transactions` is genuinely unpaginated (a plain array,
 * confirmed by reading `WalletTransactionsController.listTransactions()`
 * directly), so this table is a plain (no `serverPagination`) `<DataTable>`
 * — same "small, already-fully-loaded dataset" fallback shape that
 * component's own doc comment describes for the dashboard's Top-Defaulters
 * table. A simple client-side type filter is layered on top (the plan's own
 * "add a simple client-side type/date filter if easy, don't over-build"
 * ask) — no new query, no debounce needed.
 */
export function TransactionsTable({ transactions }: { transactions: WalletTransactionResponseDto[] }) {
  const t = useTranslations("wallet.detail.transactions");
  const tType = useTranslations("wallet.transactionTypes");
  const [typeFilter, setTypeFilter] = React.useState<string>(ALL_TYPES);

  const filtered = React.useMemo(
    () => (typeFilter === ALL_TYPES ? transactions : transactions.filter((txn) => txn.type === typeFilter)),
    [transactions, typeFilter],
  );

  const columns = React.useMemo<ColumnDef<WalletTransactionResponseDto>[]>(
    () => [
      {
        accessorKey: "at",
        header: t("columns.at"),
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
      {
        id: "type",
        header: t("columns.type"),
        cell: ({ row }) => tType(row.original.type),
      },
      {
        accessorKey: "direction",
        header: t("columns.direction"),
        cell: ({ getValue }) => (getValue<string>() === "D" ? t("directionDebit") : t("directionCredit")),
      },
      {
        accessorKey: "amount",
        header: t("columns.amount"),
        cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
      },
      {
        accessorKey: "balanceAfter",
        header: t("columns.balanceAfter"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        accessorKey: "reasonCode",
        header: t("columns.reasonCode"),
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
    ],
    [t, tType],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">{t("filterType")}</Label>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>{t("allTypes")}</SelectItem>
            {WALLET_TRANSACTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {tType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}
    </div>
  );
}
