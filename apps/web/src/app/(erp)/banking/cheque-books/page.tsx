"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useChequeBooks, type BankChequeBookResponseDto } from "@/features/banking/hooks/use-cheque-books";
import { CreateChequeBookDialog } from "@/features/banking/components/create-cheque-book-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern every prior part's own filters bar already established.

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — the Cheque Books list: Card + account `<Select>` filter (a real
 * server-side query param, `GET /banking/cheque-books?accountId=`) +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to
 * `/banking/cheque-books/[id]`, `<CreateChequeBookDialog>` as the entry
 * point — the same shape `transfers/page.tsx` (Part 2) already establishes.
 * `banking:cheque-book:manage`-gated — the SAME permission also gates this
 * list (see `cheque-books.api.ts`'s own doc comment). No status filter/badge
 * exists — `bank_cheque_book` carries no lifecycle at all (see
 * `bank-cheque-book.entity.ts`'s own doc comment: `MutableBaseEntity` for
 * genuine post-creation config edits only, no `update`/`delete` route
 * exists, so this list is deliberately create+browse only).
 */
export default function ChequeBooksPage() {
  const t = useTranslations("banking.chequeBooks.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [accountId, setAccountId] = React.useState("");

  const booksQuery = useChequeBooks(accountId ? { accountId } : {});
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<BankChequeBookResponseDto>[]>(
    () => [
      { id: "prefix", header: t("columns.prefix"), cell: ({ row }) => row.original.prefix },
      { id: "account", header: t("columns.account"), cell: ({ row }) => accountNameById.get(row.original.accountId) ?? row.original.accountId },
      { id: "range", header: t("columns.range"), cell: ({ row }) => `${row.original.startLeaf}–${row.original.endLeaf}` },
      {
        id: "leafCount",
        header: t("columns.leafCount"),
        cell: ({ row }) => row.original.endLeaf - row.original.startLeaf + 1,
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
              router.push(`/banking/cheque-books/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, accountNameById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateChequeBookDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
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
            {accountId && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccountId("")}>
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={booksQuery} isEmpty={(d) => d.length === 0}>
            {(books) => <DataTable columns={columns} data={books} onRowClick={(b) => router.push(`/banking/cheque-books/${b.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
