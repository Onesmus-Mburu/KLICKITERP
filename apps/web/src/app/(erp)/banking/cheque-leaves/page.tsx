"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BankChequeLeafResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useChequeBooks } from "@/features/banking/hooks/use-cheque-books";
import { BANK_CHEQUE_LEAF_STATUSES, useChequeLeaves, type BankChequeLeafStatus } from "@/features/banking/hooks/use-cheque-leaves";
import { ChequeLeafStatusActions } from "@/features/banking/components/cheque-leaf-status-actions";
import { IssueChequeLeafDialog } from "@/features/banking/components/issue-cheque-leaf-dialog";
import { FlagStaleButton } from "@/features/banking/components/flag-stale-button";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern every prior part's own filters bar already established.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  UNUSED: "soft-secondary",
  ISSUED: "soft-primary",
  PRESENTED: "soft-warning",
  CLEARED: "success",
  STOPPED: "destructive",
  CANCELLED: "soft-destructive",
  STALE: "soft-accent",
};

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — the GLOBAL Cheque Leaves list (across every book), filterable by
 * book/status (both real server-side query params, `GET
 * /banking/cheque-leaves?bookId=&status=`), hosting `<IssueChequeLeafDialog>`
 * (the issue entry point — BR-BANK-04, book-level not leaf-level, see that
 * dialog's own doc comment) and `<FlagStaleButton>` (the prominent manual
 * bulk trigger, see that component's own doc comment on why it can't be
 * buried). Each row carries its own `<ChequeLeafStatusActions>` inline, the
 * same "list page hosts a sub-resource's own status actions inline, no
 * separate detail page needed" shape `deposit-withdrawal-list.tsx` (Part 2)
 * already establishes for its own dual-acknowledge buttons — a per-leaf
 * detail route was deliberately NOT built, since every field/action a leaf
 * has is already visible/reachable from this one row (the same "no leaf-only
 * detail page" scope call the book's own leaves sub-table on
 * `cheque-books/[id]/page.tsx` independently makes too).
 */
export default function ChequeLeavesPage() {
  const t = useTranslations("banking.chequeLeaves.list");
  const tStatuses = useTranslations("banking.chequeLeaves.statuses");
  const [status, setStatus] = React.useState<BankChequeLeafStatus | "">("");
  const [bookId, setBookId] = React.useState("");

  const leavesQuery = useChequeLeaves({ ...(status ? { status } : {}), ...(bookId ? { bookId } : {}) });
  const booksQuery = useChequeBooks();

  const bookLabelById = React.useMemo(
    () => new Map((booksQuery.data ?? []).map((b) => [b.id, `${b.prefix} (${b.startLeaf}–${b.endLeaf})`])),
    [booksQuery.data],
  );

  const columns = React.useMemo<ColumnDef<BankChequeLeafResponseDto>[]>(
    () => [
      { id: "book", header: t("columns.book"), cell: ({ row }) => bookLabelById.get(row.original.bookId) ?? row.original.bookId },
      { id: "leafNo", header: t("columns.leafNo"), cell: ({ row }) => row.original.leafNo },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      { id: "payee", header: t("columns.payee"), cell: ({ row }) => row.original.payee ?? "—" },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => (row.original.amount ? formatMoney(row.original.amount) : "—") },
      { id: "issuedOn", header: t("columns.issuedOn"), cell: ({ row }) => row.original.issuedOn ?? "—" },
      { id: "actions", header: t("columns.actions"), cell: ({ row }) => <ChequeLeafStatusActions leaf={row.original} /> },
    ],
    [t, tStatuses, bookLabelById],
  );

  const hasActiveFilters = !!(status || bookId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FlagStaleButton />
          <IssueChequeLeafDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.bookLabel")}</Label>
              <Select value={bookId || ALL_SENTINEL} onValueChange={(v) => setBookId(v === ALL_SENTINEL ? "" : v)} disabled={booksQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allBooks")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allBooks")}</SelectItem>
                  {(booksQuery.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {bookLabelById.get(b.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-52 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as BankChequeLeafStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BANK_CHEQUE_LEAF_STATUSES.map((s) => (
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
                  setStatus("");
                  setBookId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={leavesQuery} isEmpty={(d) => d.length === 0}>
            {(leaves) => <DataTable columns={columns} data={leaves} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
