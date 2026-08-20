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
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCategories } from "@/features/expenses/hooks/use-categories";
import { CreateVoucherDialog } from "@/features/expenses/components/create-voucher-dialog";
import { isDraftPlaceholderNumber, useVouchers, VOUCHER_STATUSES, type VoucherResponseDto, type VoucherStatus } from "@/features/expenses/hooks/use-vouchers";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — the same sentinel pattern every prior part's own filters bar already establishes.

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — the Expense
 * Vouchers list: Card + a status `<Select>` filter + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to detail — the same shape
 * `payment-vouchers/page.tsx` (Procurement, Slice 18 Part 5) already
 * establishes. `expenses:voucher:create`-gated server-side (reused for every
 * GET too, no separate view permission — see `vouchers.api.ts`'s own doc
 * comment); a role missing it hits `<QueryBoundary>`'s own permission-denied
 * state.
 *
 * **The `number` column is honest about the `DRAFT-<uuid-prefix>` placeholder**
 * (`isDraftPlaceholderNumber()`) — shows a plain "Not yet paid" label instead
 * of the ugly raw placeholder, matching Procurement's own POs/Payment
 * Vouchers (Slice 18) treatment of the identical pattern.
 *
 * **The payee column resolves each polymorphic `payeeRef` to a human name**
 * client-side: `SUPPLIER`/`STAFF` rows are matched against this page's own
 * already-fetched `useSuppliers()`/`useUsersLookup()` lists (no per-row
 * detail fetch), `OTHER` rows read `payeeRef.name` directly (never trusted
 * blindly — guarded with a runtime `typeof` check since `payeeRef` is a
 * genuinely untyped `Record<string, unknown>` on the wire).
 */
export default function ExpenseVouchersPage() {
  const t = useTranslations("expenses.vouchers.list");
  const tCommon = useTranslations("common");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tStatuses = useTranslations("expenses.vouchers.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<VoucherStatus | "">("");

  const vouchersQuery = useVouchers(status || undefined);
  const categoriesQuery = useCategories();
  const suppliersQuery = useSuppliers();
  const usersQuery = useUsersLookup();

  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);
  const supplierNameById = React.useMemo(() => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])), [suppliersQuery.data]);
  const staffNameById = React.useMemo(
    () => new Map((usersQuery.data?.items ?? []).map((u) => [u.id, u.fullName])),
    [usersQuery.data],
  );

  const resolvePayee = React.useCallback(
    (voucher: VoucherResponseDto): string => {
      if (voucher.payeeType === "SUPPLIER") {
        const supplierId = voucher.payeeRef.supplierId;
        return typeof supplierId === "string" ? (supplierNameById.get(supplierId) ?? supplierId) : "—";
      }
      if (voucher.payeeType === "STAFF") {
        const staffUserId = voucher.payeeRef.staffUserId;
        return typeof staffUserId === "string" ? (staffNameById.get(staffUserId) ?? staffUserId) : "—";
      }
      const name = voucher.payeeRef.name;
      return typeof name === "string" && name.length > 0 ? name : "—";
    },
    [supplierNameById, staffNameById],
  );

  const columns = React.useMemo<ColumnDef<VoucherResponseDto>[]>(
    () => [
      {
        id: "number",
        header: t("columns.number"),
        cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetPaid") : row.original.number),
      },
      { id: "payeeType", header: t("columns.payeeType"), cell: ({ row }) => tPayeeTypes(row.original.payeeType) },
      { id: "payee", header: t("columns.payee"), cell: ({ row }) => resolvePayee(row.original) },
      {
        id: "category",
        header: t("columns.category"),
        cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? row.original.categoryId,
      },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      { id: "method", header: t("columns.method"), cell: ({ row }) => tMethods(row.original.method) },
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
              router.push(`/expenses/vouchers/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tPayeeTypes, tMethods, tStatuses, resolvePayee, categoryNameById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateVoucherDialog />
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
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as VoucherStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {VOUCHER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {status && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStatus("")}>
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={vouchersQuery} isEmpty={(d) => d.length === 0}>
            {(vouchers) => <DataTable columns={columns} data={vouchers} onRowClick={(v) => router.push(`/expenses/vouchers/${v.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
