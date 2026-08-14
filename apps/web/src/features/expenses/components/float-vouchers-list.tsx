"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useCategories } from "../hooks/use-categories";
import { useFloatVouchers, type FloatResponseDto, type PettyCashVoucherResponseDto } from "../hooks/use-petty-cash";
import { SpendDialog } from "./spend-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — a float's own petty-cash
 * voucher history: Card + `<DataTable>` inside `<QueryBoundary>`, the same
 * shape Part 1's `vouchers/page.tsx` already establishes, plus a
 * `<SpendDialog>` trigger in the header.
 *
 * **Status is shown honestly, not hidden** — every real row is `APPROVED`
 * (`PettyCashService.spend()` hardcodes it, see `petty-cash.api.ts`'s own
 * doc comment), but the column stays generic (reading straight off
 * `EXP_PETTY_CASH_VOUCHER_STATUSES`' full 4-value enum via
 * `STATUS_BADGE_VARIANT`) rather than assuming APPROVED is the only value
 * that could ever appear — matching Part 1's own "never assume, read the
 * real enum" discipline. No status-action buttons exist anywhere on this
 * table — there is genuinely nothing to submit/approve/reject/pay for an
 * individual petty-cash voucher (see `spend-dialog.tsx`'s own doc comment).
 */
export function FloatVouchersList({ float }: { float: FloatResponseDto }) {
  const t = useTranslations("expenses.pettyCash.vouchersList");
  const tVoucherStatuses = useTranslations("expenses.pettyCash.voucherStatuses");

  const vouchersQuery = useFloatVouchers(float.id);
  const categoriesQuery = useCategories();

  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  const columns = React.useMemo<ColumnDef<PettyCashVoucherResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      {
        id: "category",
        header: t("columns.category"),
        cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? row.original.categoryId,
      },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "receipt",
        header: t("columns.receipt"),
        cell: ({ row }) => (row.original.receiptFileId ? t("hasReceipt") : t("noReceipt")),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tVoucherStatuses(row.original.status)}</Badge>
        ),
      },
    ],
    [t, tVoucherStatuses, categoryNameById],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <SpendDialog float={float} />
      </CardHeader>
      <CardContent>
        <QueryBoundary query={vouchersQuery} isEmpty={(d) => d.length === 0}>
          {(vouchers) => <DataTable columns={columns} data={vouchers} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
