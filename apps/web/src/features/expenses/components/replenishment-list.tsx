"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useFloatVouchers, useReplenishments, type ReplenishmentResponseDto } from "../hooks/use-petty-cash";
import { RequestReplenishmentDialog } from "./request-replenishment-dialog";
import { ReplenishmentStatusActions } from "./replenishment-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
};

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — a float's own
 * replenishment history: Card + `<DataTable>` inside `<QueryBoundary>`, plus
 * a `<RequestReplenishmentDialog>` trigger in the header.
 *
 * **The "unclaimed vouchers" coverage is made visible, not just the raw
 * `voucherIds` array** — per the task brief's own explicit instruction, each
 * row's `voucherIds: string[]` is cross-referenced against this SAME float's
 * own already-fetched `useFloatVouchers()` list (`vouchers/page.tsx`'s own
 * `resolvePayee()`-style client-side lookup-map pattern from Part 1) and
 * rendered as a comma-separated list of real voucher NUMBERS (falling back to
 * the raw id if a voucher somehow isn't in the currently-loaded list) — a
 * user can see exactly which real spends a given replenishment covers without
 * a separate detail screen.
 *
 * **No REJECTED status/badge exists anywhere in this table** — a rejected
 * replenishment is hard-deleted server-side (`petty-cash.api.ts`'s own doc
 * comment on `rejectReplenishment()`), so this list, by construction, can
 * only ever show `PENDING_APPROVAL`/`APPROVED`/`PAID` rows; there is
 * genuinely nothing to filter or badge for a rejected one — it simply stops
 * appearing here after the reject mutation invalidates this query, the same
 * "the list re-fetches and the row is just gone" behavior every caller of
 * this component should expect.
 */
export function ReplenishmentList({ floatId }: { floatId: string }) {
  const t = useTranslations("expenses.pettyCash.replenishmentList");
  const tStatuses = useTranslations("expenses.pettyCash.replenishmentStatuses");

  const replenishmentsQuery = useReplenishments(floatId);
  const vouchersQuery = useFloatVouchers(floatId);

  const voucherNumberById = React.useMemo(() => new Map((vouchersQuery.data ?? []).map((v) => [v.id, v.number])), [vouchersQuery.data]);

  const resolveVoucherNumbers = React.useCallback(
    (voucherIds: string[]): string => voucherIds.map((id) => voucherNumberById.get(id) ?? id).join(", "),
    [voucherNumberById],
  );

  const columns = React.useMemo<ColumnDef<ReplenishmentResponseDto>[]>(
    () => [
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "vouchers",
        header: t("columns.vouchers"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {t("voucherCount", { count: row.original.voucherIds.length })} — {resolveVoucherNumbers(row.original.voucherIds)}
          </span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      {
        id: "journal",
        header: t("columns.journal"),
        cell: ({ row }) =>
          row.original.journalId ? (
            <Link href={`/accounting/journals/${row.original.journalId}`} className="text-sm text-primary hover:underline">
              {t("viewJournal")}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">{t("notPosted")}</span>
          ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => <ReplenishmentStatusActions replenishment={row.original} />,
      },
    ],
    [t, tStatuses, resolveVoucherNumbers],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <RequestReplenishmentDialog floatId={floatId} />
      </CardHeader>
      <CardContent>
        <QueryBoundary query={replenishmentsQuery} isEmpty={(d) => d.length === 0}>
          {(replenishments) => <DataTable columns={columns} data={replenishments} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
