"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useStatementImports, type BankStatementImport } from "@/features/banking/hooks/use-statement-import";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — the same pattern `banking/transfers/page.tsx` already establishes.

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — the import-history
 * list: Card + account `<Select>` filter (a real server-side query param,
 * `GET /banking/statement-imports?accountId=`) + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to `/banking/statement-imports/[id]`
 * — the same shape every prior list page in this module establishes.
 * `banking:statement:import`-gated server-side — the SAME permission also
 * gates this list (see `statement-import.api.ts`'s own doc comment).
 *
 * **No status filter** — unlike Transfers/Deposits/Withdrawals,
 * `bank_statement_import` carries no status/lifecycle at all (confirmed by
 * reading `bank-statement-import.entity.ts` directly: an append-only
 * `BaseEntity` row, `create`+`list`+`findOne` only) — an import either
 * happened (this row exists) or it didn't, there's nothing to filter by
 * besides which account it's for.
 *
 * **"New Import" navigates to a dedicated page**, not a dialog trigger —
 * see `import-statement-form.tsx`'s own doc comment for why.
 */
export default function StatementImportsPage() {
  const t = useTranslations("banking.statementImports.list");
  const router = useRouter();
  const [accountId, setAccountId] = React.useState("");

  const importsQuery = useStatementImports(accountId || undefined);
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<BankStatementImport>[]>(
    () => [
      { id: "importedAt", header: t("columns.importedAt"), cell: ({ row }) => new Date(row.original.importedAt).toLocaleString() },
      { id: "account", header: t("columns.account"), cell: ({ row }) => accountNameById.get(row.original.accountId) ?? row.original.accountId },
      { id: "lineCount", header: t("columns.lineCount"), cell: ({ row }) => row.original.lineCount },
      {
        id: "duplicateCount",
        header: t("columns.duplicateCount"),
        cell: ({ row }) =>
          row.original.duplicateCount > 0 ? (
            <Badge variant="soft-secondary">{row.original.duplicateCount}</Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
    ],
    [t, accountNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button asChild type="button">
          <Link href="/banking/statement-imports/new">
            <Plus className="size-4" />
            {t("newImportTrigger")}
          </Link>
        </Button>
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

          <QueryBoundary query={importsQuery} isEmpty={(d) => d.length === 0}>
            {(imports) => <DataTable columns={columns} data={imports} onRowClick={(imp) => router.push(`/banking/statement-imports/${imp.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
