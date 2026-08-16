"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-error";
import { useEffectiveStatutoryTable } from "../hooks/use-statutory-tables";
import { PYRL_STATUTORY_KINDS, type PyrlStatutoryKind } from "../lib/statutory-params";
import { StatutoryTableParamsView } from "./statutory-table-params-view";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — BR-PYRL-01's real lookup
 * (`GET /payroll/statutory-tables/effective?kind=&periodEndDate=`), exposed
 * as a small "what table applies on this date" sanity-check utility, per
 * this part's own task brief: this is genuinely how an admin would verify
 * their own data BEFORE trusting a future payroll run (Part 6) to resolve
 * correctly, not a contrived screen.
 *
 * `kind` + `periodEndDate` (defaulted to today) drive
 * `useEffectiveStatutoryTable()` directly — no separate "Check" button, the
 * query re-fires on every change (both inputs are cheap, low-cardinality
 * pickers). A real `404` (`StatutoryTablesService.findEffectiveFor()`'s own
 * BR-PYRL-01 "missing table blocks the run" error) is NOT treated as a
 * generic `<QueryBoundary>` error state here — it's a legitimate, expected
 * outcome this panel renders as a clear, dedicated "no table configured on
 * or before this date" message instead, since a 404 here is informative, not
 * a failure of this screen.
 */
export function EffectiveTableLookup() {
  const t = useTranslations("payroll.statutoryTables.effectiveLookup");
  const tKinds = useTranslations("payroll.statutoryTables.kinds");
  const [kind, setKind] = React.useState<PyrlStatutoryKind>("PAYE");
  const [periodEndDate, setPeriodEndDate] = React.useState(todayIsoDate());

  const effectiveQuery = useEffectiveStatutoryTable(kind, periodEndDate);
  const notFound = effectiveQuery.error instanceof ApiError && effectiveQuery.error.status === 404;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <Search className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PyrlStatutoryKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PYRL_STATUTORY_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {tKinds(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("periodEndDateLabel")}</Label>
            <Input type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
          </div>
        </div>

        {effectiveQuery.isPending && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {notFound && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>{t("noTableFound", { kind: tKinds(kind), date: periodEndDate })}</AlertDescription>
          </Alert>
        )}

        {effectiveQuery.isError && !notFound && (
          <Alert variant="destructive">
            <AlertDescription>{effectiveQuery.error instanceof Error ? effectiveQuery.error.message : t("genericError")}</AlertDescription>
          </Alert>
        )}

        {effectiveQuery.data && (
          <div className="space-y-3 rounded-lg border border-success/40 bg-success/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="soft-success">{tKinds(effectiveQuery.data.kind)}</Badge>
                <span className="text-sm text-foreground">{t("resolvedEffectiveFrom", { date: effectiveQuery.data.effectiveFrom })}</span>
              </div>
              <Link
                href={`/payroll/statutory-tables/${effectiveQuery.data.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t("viewDetailLink")}
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <StatutoryTableParamsView kind={effectiveQuery.data.kind as PyrlStatutoryKind} params={effectiveQuery.data.params} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
