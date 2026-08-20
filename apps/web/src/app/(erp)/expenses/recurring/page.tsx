"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCategories } from "@/features/expenses/hooks/use-categories";
import { CreateRecurringDialog } from "@/features/expenses/components/create-recurring-dialog";
import { RunDueButton } from "@/features/expenses/components/run-due-button";
import { parseRecurringTemplate, useRecurringTemplates, type RecurringResponseDto } from "@/features/expenses/hooks/use-recurring";

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14 — the LAST part of
 * this slice) — the recurring templates list: Card + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to detail — the same shape
 * `vouchers/page.tsx` (Part 1)/`claims/page.tsx` (Part 3) already establish.
 * `expenses:recurring:manage`-gated server-side (reused for every GET too, no
 * separate view permission — see `recurring.api.ts`'s own doc comment).
 *
 * **`<RunDueButton>` is rendered right next to `<CreateRecurringDialog>` at
 * the top of the page, equally prominent** — per the task brief's own
 * explicit instruction that this action must never be buried: it is the ONLY
 * thing in this whole frontend that can ever materialize a due template into
 * a real voucher (no scheduler exists anywhere in this codebase, see
 * `recurring.api.ts`'s own doc comment).
 *
 * The payee column resolves each polymorphic template the same way
 * `vouchers/page.tsx`'s own `resolvePayee()` does, via `parseRecurringTemplate()`
 * (this part's own `recurring.api.ts` export) against this page's own
 * already-fetched supplier/staff lists — no per-row detail fetch.
 * `lastVoucherId` links straight to Part 1's own voucher detail route when
 * set, or an honest "Never fired" label when still `null`.
 */
export default function RecurringTemplatesPage() {
  const t = useTranslations("expenses.recurring.list");
  const tCommon = useTranslations("common");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const router = useRouter();

  const templatesQuery = useRecurringTemplates();
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
    (recurring: RecurringResponseDto): string => {
      const parsed = parseRecurringTemplate(recurring.template);
      if (parsed.payeeType === "SUPPLIER") return supplierNameById.get(parsed.supplierId) ?? parsed.supplierId ?? "—";
      if (parsed.payeeType === "STAFF") return staffNameById.get(parsed.staffUserId) ?? parsed.staffUserId ?? "—";
      return parsed.otherName || "—";
    },
    [supplierNameById, staffNameById],
  );

  const columns = React.useMemo<ColumnDef<RecurringResponseDto>[]>(
    () => [
      {
        id: "payeeType",
        header: t("columns.payeeType"),
        cell: ({ row }) => tPayeeTypes(parseRecurringTemplate(row.original.template).payeeType),
      },
      { id: "payee", header: t("columns.payee"), cell: ({ row }) => resolvePayee(row.original) },
      {
        id: "category",
        header: t("columns.category"),
        cell: ({ row }) => {
          const categoryId = parseRecurringTemplate(row.original.template).categoryId;
          return categoryNameById.get(categoryId) ?? categoryId;
        },
      },
      {
        id: "amount",
        header: t("columns.amount"),
        cell: ({ row }) => formatMoney(parseRecurringTemplate(row.original.template).amount),
      },
      { id: "scheduleCron", header: t("columns.schedule"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.scheduleCron}</span> },
      { id: "nextRunOn", header: t("columns.nextRunOn"), cell: ({ row }) => row.original.nextRunOn },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "soft-secondary"}>
            {row.original.isActive ? t("active") : t("inactive")}
          </Badge>
        ),
      },
      {
        id: "lastVoucher",
        header: t("columns.lastVoucher"),
        cell: ({ row }) => {
          const voucherId = row.original.lastVoucherId;
          if (!voucherId) return <span className="text-muted-foreground">{t("neverFired")}</span>;
          return (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/expenses/vouchers/${voucherId}`);
              }}
            >
              {t("viewVoucher")}
            </button>
          );
        },
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
              router.push(`/expenses/recurring/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tPayeeTypes, resolvePayee, categoryNameById, router, tCommon],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateRecurringDialog />
          <RunDueButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QueryBoundary query={templatesQuery} isEmpty={(d) => d.length === 0}>
            {(templates) => <DataTable columns={columns} data={templates} onRowClick={(r) => router.push(`/expenses/recurring/${r.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
