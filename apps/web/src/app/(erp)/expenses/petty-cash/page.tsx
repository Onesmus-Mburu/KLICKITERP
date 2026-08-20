"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { CreateFloatDialog } from "@/features/expenses/components/create-float-dialog";
import { useFloats, type FloatResponseDto } from "@/features/expenses/hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — the float list: Card +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to detail —
 * the same shape Part 1's own `vouchers/page.tsx` establishes.
 * `expenses:petty-cash:manage`-gated server-side (a role missing it hits
 * `<QueryBoundary>`'s own permission-denied state).
 *
 * The custodian column resolves `custodianUserId` to a human name
 * client-side against this page's own already-fetched `useUsersLookup()`
 * list — the same lookup-map pattern Part 1's `vouchers/page.tsx` establishes
 * for its own STAFF `payeeType` column.
 */
export default function PettyCashFloatsPage() {
  const t = useTranslations("expenses.pettyCash.floats.list");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const floatsQuery = useFloats();
  const usersQuery = useUsersLookup();

  const custodianNameById = React.useMemo(
    () => new Map((usersQuery.data?.items ?? []).map((u) => [u.id, `${u.fullName} (${u.username})`])),
    [usersQuery.data],
  );

  const columns = React.useMemo<ColumnDef<FloatResponseDto>[]>(
    () => [
      {
        id: "custodian",
        header: t("columns.custodian"),
        cell: ({ row }) => custodianNameById.get(row.original.custodianUserId) ?? row.original.custodianUserId,
      },
      { id: "ceiling", header: t("columns.ceiling"), cell: ({ row }) => formatMoney(row.original.ceiling) },
      { id: "balance", header: t("columns.balance"), cell: ({ row }) => formatMoney(row.original.balance) },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/expenses/petty-cash/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, custodianNameById, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateFloatDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={floatsQuery} isEmpty={(d) => d.length === 0}>
            {(floats) => <DataTable columns={columns} data={floats} onRowClick={(f) => router.push(`/expenses/petty-cash/${f.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
