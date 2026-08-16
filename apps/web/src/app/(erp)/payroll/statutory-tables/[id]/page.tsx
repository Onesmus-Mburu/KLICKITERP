"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";
import type { PyrlStatutoryTableResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { EditStatutoryTableDialog } from "@/features/payroll/components/edit-statutory-table-dialog";
import { StatutoryTableParamsView } from "@/features/payroll/components/statutory-table-params-view";
import { useStatutoryTable } from "@/features/payroll/hooks/use-statutory-tables";
import type { PyrlStatutoryKind } from "@/features/payroll/lib/statutory-params";

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — a statutory rate table's
 * detail page: header `Card` (kind badge + `effectiveFrom`, BOTH shown as
 * plain read-only text, never inside an editable input — genuinely
 * immutable after create, confirmed by reading `UpdatePyrlStatutoryTableDto`
 * directly) + a PROMINENT, persistent `sourceNote` block (an `<Alert>`, not
 * a collapsed drawer or tooltip — per this part's own task brief: the
 * backend's own migration doc comment states this disclaimer must "remain
 * prominent," and this is real, admin-editable data via
 * `<EditStatutoryTableDialog>`, never a hardcoded frontend string) + the
 * kind-aware `<StatutoryTableParamsView>`.
 */
export default function StatutoryTableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.statutoryTables.detail");
  const tableQuery = useStatutoryTable(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/statutory-tables">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={tableQuery}>{(table) => <StatutoryTableDetailCard table={table} />}</QueryBoundary>
    </div>
  );
}

function StatutoryTableDetailCard({ table }: { table: PyrlStatutoryTableResponseDto }) {
  const t = useTranslations("payroll.statutoryTables.detail");
  const tKinds = useTranslations("payroll.statutoryTables.kinds");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{tKinds(table.kind)}</CardTitle>
              <Badge variant="outline">{t("effectiveFromBadge", { date: table.effectiveFrom })}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t("immutableFieldsHint")}</p>
          </div>
          <EditStatutoryTableDialog table={table} />
        </CardHeader>
      </Card>

      <Alert>
        <Info className="size-4" />
        <AlertDescription className="space-y-1">
          <p className="font-medium text-foreground">{t("sourceNoteTitle")}</p>
          <p>{table.sourceNote}</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("paramsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StatutoryTableParamsView kind={table.kind as PyrlStatutoryKind} params={table.params} />
        </CardContent>
      </Card>
    </div>
  );
}
