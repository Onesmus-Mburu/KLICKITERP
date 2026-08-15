"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BankAccountResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useAccounts } from "@/features/banking/hooks/use-accounts";
import { CreateAccountDialog } from "@/features/banking/components/create-account-dialog";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — the same sentinel pattern every prior part's own filters bar establishes (e.g. `expenses/vouchers/page.tsx`).
const BANK_ACCOUNT_KINDS = ["BANK", "CASH", "MPESA_SETTLEMENT", "PETTY"] as const;

const ACTIVE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  true: "soft-success",
  false: "soft-secondary",
};

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) — the Bank
 * Accounts list: Card + `kind`/`isActive` `<Select>` filters (both real
 * server-side query params, `GET /banking/accounts?kind=&isActive=`) +
 * `<DataTable>` inside `<QueryBoundary>`, row click navigates to
 * `/banking/accounts/[id]` — the same shape `procurement/suppliers/page.tsx`
 * (Slice 18 Part 1) already establishes. `banking:account:manage`-gated
 * server-side — the SAME shared permission gates this list too (no separate
 * view permission exists on `AccountsController` at all, confirmed by reading
 * it directly), so a role missing it hits `<QueryBoundary>`'s own
 * permission-denied state here just as it would on create/update — this is
 * the exactly-expected common path for most non-admin roles per this part's
 * own task brief, not a bug.
 */
export default function BankAccountsPage() {
  const t = useTranslations("banking.accounts.list");
  const tKinds = useTranslations("banking.kinds");
  const router = useRouter();
  const [kind, setKind] = React.useState<(typeof BANK_ACCOUNT_KINDS)[number] | "">("");
  const [isActive, setIsActive] = React.useState<"true" | "false" | "">("");

  const accountsQuery = useAccounts({
    kind: kind || undefined,
    isActive: isActive === "" ? undefined : isActive === "true",
  });

  const columns = React.useMemo<ColumnDef<BankAccountResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "kind", header: t("columns.kind"), cell: ({ row }) => tKinds(row.original.kind) },
      { id: "bankName", header: t("columns.bankName"), cell: ({ row }) => row.original.bankName ?? "—" },
      { id: "accountNo", header: t("columns.accountNo"), cell: ({ row }) => row.original.accountNo ?? "—" },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={ACTIVE_BADGE_VARIANT[String(row.original.isActive)] ?? "outline"}>
            {row.original.isActive ? t("active") : t("inactive")}
          </Badge>
        ),
      },
    ],
    [t, tKinds],
  );

  const hasFilters = kind !== "" || isActive !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateAccountDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.kindLabel")}</Label>
              <Select value={kind || ALL_SENTINEL} onValueChange={(v) => setKind(v === ALL_SENTINEL ? "" : (v as (typeof BANK_ACCOUNT_KINDS)[number]))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allKinds")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allKinds")}</SelectItem>
                  {BANK_ACCOUNT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={isActive || ALL_SENTINEL} onValueChange={(v) => setIsActive(v === ALL_SENTINEL ? "" : (v as "true" | "false"))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  <SelectItem value="true">{t("active")}</SelectItem>
                  <SelectItem value="false">{t("inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKind("");
                  setIsActive("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={accountsQuery} isEmpty={(d) => d.length === 0}>
            {(accounts) => (
              <DataTable columns={columns} data={accounts} onRowClick={(account) => router.push(`/banking/accounts/${account.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
