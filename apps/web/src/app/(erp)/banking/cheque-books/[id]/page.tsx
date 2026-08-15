"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BankChequeBookResponseDto, BankChequeLeafResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useAccount as useBankAccount } from "@/features/banking/hooks/use-accounts";
import { useChequeBook } from "@/features/banking/hooks/use-cheque-books";
import { useChequeLeaves } from "@/features/banking/hooks/use-cheque-leaves";
import { ChequeLeafStatusActions } from "@/features/banking/components/cheque-leaf-status-actions";

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
 * — a cheque book's detail page: header Card (prefix, leaf range, the linked
 * account resolved to its own real name via Part 1's own `useAccount()`) +
 * its own leaves list (`GET /banking/cheque-leaves?bookId=`, ordered by leaf
 * number ascending server-side, confirmed by reading
 * `BankChequeLeafRepository.list()` directly), each row carrying its own
 * `<ChequeLeafStatusActions>` inline — the same "resolve a foreign id, don't
 * nest the component" + "detail page hosts a related sub-resource's own
 * status actions inline" shape `transfers/[id]/page.tsx` (Part 2) and
 * `reconciliations/[id]/page.tsx` (Part 4) both already establish.
 */
export default function ChequeBookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.chequeBooks.detail");
  const bookQuery = useChequeBook(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/cheque-books">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={bookQuery}>{(book) => <ChequeBookDetailCard book={book} />}</QueryBoundary>
    </div>
  );
}

function ChequeBookDetailCard({ book }: { book: BankChequeBookResponseDto }) {
  const t = useTranslations("banking.chequeBooks.detail");
  const tStatuses = useTranslations("banking.chequeLeaves.statuses");
  const accountQuery = useBankAccount(book.accountId);
  const leavesQuery = useChequeLeaves({ bookId: book.id });
  const accountLabel = accountQuery.data ? accountQuery.data.name : book.accountId;

  const columns = React.useMemo<ColumnDef<BankChequeLeafResponseDto>[]>(
    () => [
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
    [t, tStatuses],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base text-foreground">{book.prefix}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("rangeLabel", { start: book.startLeaf, end: book.endLeaf })}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("accountLabel")}</p>
              <Link href={`/banking/accounts/${book.accountId}`} className="text-sm text-primary hover:underline">
                {accountLabel}
              </Link>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("leafCountLabel")}</p>
              <p className="text-sm text-foreground">{book.endLeaf - book.startLeaf + 1}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("leavesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={leavesQuery} isEmpty={(d) => d.length === 0}>
            {(leaves) => <DataTable columns={columns} data={leaves} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
