"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { PyrlSalaryStructureResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useSalaryStructure } from "@/features/payroll/hooks/use-salary-structures";
import { EditSalaryStructureDialog } from "@/features/payroll/components/edit-salary-structure-dialog";
import { StructureLineEditor } from "@/features/payroll/components/structure-line-editor";

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — a salary structure's detail
 * page: header `Card` (name, grade badge, `effectiveFrom`,
 * `<EditSalaryStructureDialog>`) + `<StructureLineEditor>`'s own lines
 * sub-table — the same `useParams<{id:string}>()` + `<QueryBoundary>`
 * header-card shape `app/(erp)/payroll/components/[id]/page.tsx` (Part 1)
 * establishes.
 */
export default function SalaryStructureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.salaryStructures.detail");
  const structureQuery = useSalaryStructure(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/salary-structures">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={structureQuery}>{(structure) => <StructureDetailCard structure={structure} />}</QueryBoundary>
    </div>
  );
}

function StructureDetailCard({ structure }: { structure: PyrlSalaryStructureResponseDto }) {
  const t = useTranslations("payroll.salaryStructures.detail");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{structure.name}</CardTitle>
              {structure.grade && <Badge variant="outline">{structure.grade}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{t("effectiveFromLabel", { date: structure.effectiveFrom })}</p>
          </div>
          <EditSalaryStructureDialog structure={structure} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StructureLineEditor structure={structure} />
        </CardContent>
      </Card>
    </div>
  );
}
