"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Info, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PyrlComponentResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useComponents } from "@/features/payroll/hooks/use-components";
import { CreateComponentDialog } from "@/features/payroll/components/create-component-dialog";

const ALL_SENTINEL = "__all__";
const COMPONENT_KINDS = ["EARNING", "DEDUCTION"] as const;

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — the Payroll
 * Components list (the earning/deduction line-type catalogue): Card +
 * `kind`/`isStatutory` `<Select>` filters (real server-side query params,
 * `GET /payroll/components?kind=&isStatutory=`) + `<DataTable>` inside
 * `<QueryBoundary>`, row click navigates to `/payroll/components/[id]` — the
 * same shape `app/(erp)/banking/accounts/page.tsx` (Slice 21 Part 1)
 * establishes. `payroll:component:manage`-gated server-side — the SAME
 * shared permission gates this list too (no separate view code exists on
 * `ComponentsController` at all, confirmed by reading it directly).
 *
 * **8 real seeded rows this page will show on first load, per this part's
 * own task brief** — `BASIC`/`HOUSE_ALLOWANCE`/`PAYE`/`NSSF`/`SHIF`/`AHL`/
 * `LOAN_RECOVERY`/`OTHER_DEDUCTION` — never described anywhere in this app's
 * own copy as "sample data"; the permanent-`code` notice below applies to
 * them just as much as to any component created here.
 */
export default function PayrollComponentsPage() {
  const t = useTranslations("payroll.components.list");
  const tKinds = useTranslations("payroll.components.kinds");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [kind, setKind] = React.useState<(typeof COMPONENT_KINDS)[number] | "">("");
  const [isStatutory, setIsStatutory] = React.useState<"true" | "false" | "">("");

  const componentsQuery = useComponents({
    kind: kind || undefined,
    isStatutory: isStatutory === "" ? undefined : isStatutory === "true",
  });

  const columns = React.useMemo<ColumnDef<PyrlComponentResponseDto>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code") },
      { accessorKey: "name", header: t("columns.name") },
      { id: "kind", header: t("columns.kind"), cell: ({ row }) => <Badge variant="soft-secondary">{tKinds(row.original.kind)}</Badge> },
      {
        id: "isTaxable",
        header: t("columns.isTaxable"),
        cell: ({ row }) => <Badge variant={row.original.isTaxable ? "soft-success" : "soft-secondary"}>{row.original.isTaxable ? t("yes") : t("no")}</Badge>,
      },
      {
        id: "isStatutory",
        header: t("columns.isStatutory"),
        cell: ({ row }) => (
          <Badge variant={row.original.isStatutory ? "soft-warning" : "soft-secondary"}>{row.original.isStatutory ? t("yes") : t("no")}</Badge>
        ),
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
              router.push(`/payroll/components/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tKinds, tCommon, router],
  );

  const hasFilters = kind !== "" || isStatutory !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateComponentDialog />
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t("codePermanentNotice")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.kindLabel")}</Label>
              <Select value={kind || ALL_SENTINEL} onValueChange={(v) => setKind(v === ALL_SENTINEL ? "" : (v as (typeof COMPONENT_KINDS)[number]))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allKinds")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allKinds")}</SelectItem>
                  {COMPONENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.isStatutoryLabel")}</Label>
              <Select value={isStatutory || ALL_SENTINEL} onValueChange={(v) => setIsStatutory(v === ALL_SENTINEL ? "" : (v as "true" | "false"))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allComponents")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allComponents")}</SelectItem>
                  <SelectItem value="true">{t("filters.statutoryOnly")}</SelectItem>
                  <SelectItem value="false">{t("filters.nonStatutoryOnly")}</SelectItem>
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
                  setIsStatutory("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={componentsQuery} isEmpty={(d) => d.length === 0}>
            {(components) => (
              <DataTable columns={columns} data={components} onRowClick={(component) => router.push(`/payroll/components/${component.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
