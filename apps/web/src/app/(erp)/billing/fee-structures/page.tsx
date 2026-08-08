"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FeeStructureResponseDto } from "@klickit/contracts";
import { CalendarRange, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { useFeeGroups } from "@/features/students/hooks/use-fee-groups";
import { useAcademicYears, findCurrent } from "@/features/billing/hooks/use-academic-calendar";
import { AcademicYearWizardDialog } from "@/features/billing/components/academic-year-wizard-dialog";
import { FeeStructureCreateDialog } from "@/features/billing/components/fee-structure-create-dialog";
import { DeleteFeeStructureButton } from "@/features/billing/components/delete-fee-structure-button";
import { FeeStructureStatusBadge } from "@/features/billing/components/status-badges";
import { useFeeStructures } from "@/features/billing/hooks/use-fee-structures";

/**
 * Phase 6 Slice 3b (Fee Structure Redesign) — fee structure list, filtered
 * by academic-year -> class (the term filter dropped: a structure now spans
 * a whole academic year, term lives on each LINE instead — see
 * `BillFeeStructureEntity`'s doc comment). `GET /billing/fee-structures`
 * REQUIRES both `academicYearId` and `classId` (see
 * `features/billing/api/fee-structures.api.ts`'s doc comment) — the table
 * only queries once both are chosen; before that, a plain hint is shown
 * instead of an empty/error `<QueryBoundary>` state (there's genuinely
 * nothing to query yet, not a failed query).
 */
export default function FeeStructuresPage() {
  const t = useTranslations("billing.feeStructures");
  const tCommon = useTranslations("common");
  const classesQuery = useClasses();
  const yearsQuery = useAcademicYears();

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [classId, setClassId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  React.useEffect(() => {
    if (!academicYearId && yearsQuery.data) {
      const current = findCurrent(yearsQuery.data);
      if (current) setAcademicYearId(current.id);
    }
  }, [academicYearId, yearsQuery.data]);

  const structuresQuery = useFeeStructures(academicYearId ?? undefined, classId ?? undefined);

  const columns = React.useMemo<ColumnDef<FeeStructureResponseDto>[]>(
    () => [
      {
        id: "scope",
        header: t("table.scope"),
        cell: ({ row }) => <ScopeCell structure={row.original} />,
      },
      { accessorKey: "version", header: t("table.version") },
      {
        id: "status",
        header: t("table.status"),
        cell: ({ row }) => <FeeStructureStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/billing/fee-structures/${row.original.id}`}>{t("table.viewDetails")}</Link>
            </Button>
            <RowScopeLabel structure={row.original}>
              {(scopeLabel) => <DeleteFeeStructureButton structure={row.original} scopeLabel={scopeLabel} />}
            </RowScopeLabel>
          </div>
        ),
      },
    ],
    [t, tCommon],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <CalendarRange className="size-4" />
            {t("manageAcademicYears")}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("newStructure")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label>{t("filters.academicYear")}</Label>
            <Select value={academicYearId ?? ""} onValueChange={setAcademicYearId} disabled={yearsQuery.isLoading}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t("filters.selectYear")} />
              </SelectTrigger>
              <SelectContent>
                {yearsQuery.data?.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("filters.class")}</Label>
            <Select value={classId ?? ""} onValueChange={setClassId} disabled={classesQuery.isLoading}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t("filters.selectClass")} />
              </SelectTrigger>
              <SelectContent>
                {classesQuery.data?.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("table.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {academicYearId && classId ? (
            <QueryBoundary query={structuresQuery} isEmpty={(d) => d.length === 0}>
              {(data) => <DataTable columns={columns} data={data} />}
            </QueryBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{t("filters.chooseYearClassHint")}</p>
          )}
        </CardContent>
      </Card>

      <FeeStructureCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AcademicYearWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

function ScopeCell({ structure }: { structure: FeeStructureResponseDto }) {
  const t = useTranslations("billing.feeStructures");
  const classesQuery = useClasses();
  const streamsQuery = useStreamsForClass(structure.streamId ? structure.classId : undefined);
  const feeGroupsQuery = useFeeGroups();

  const className = classesQuery.data?.find((k) => k.id === structure.classId)?.name ?? structure.classId;
  const streamName = structure.streamId ? (streamsQuery.data?.find((s) => s.id === structure.streamId)?.name ?? structure.streamId) : null;
  const feeGroupName = structure.feeGroupId ? (feeGroupsQuery.data?.find((f) => f.id === structure.feeGroupId)?.name ?? structure.feeGroupId) : null;

  return (
    <div className="text-sm">
      <div className="font-medium text-foreground">
        {className}
        {streamName ? ` / ${streamName}` : ""}
      </div>
      <div className="text-xs text-muted-foreground">
        {structure.boarding ?? t("anyBoardingShort")}
        {feeGroupName ? ` · ${feeGroupName}` : ""}
      </div>
    </div>
  );
}

/** Resolves the same human-readable "Class / Stream" label `<ScopeCell>` renders, as a render-prop — `<DeleteFeeStructureButton>`'s confirm dialog names the structure by this label, not a raw class id. */
function RowScopeLabel({ structure, children }: { structure: FeeStructureResponseDto; children: (label: string) => React.ReactNode }) {
  const classesQuery = useClasses();
  const streamsQuery = useStreamsForClass(structure.streamId ? structure.classId : undefined);
  const className = classesQuery.data?.find((k) => k.id === structure.classId)?.name ?? structure.classId;
  const streamName = structure.streamId ? (streamsQuery.data?.find((s) => s.id === structure.streamId)?.name ?? structure.streamId) : null;
  return <>{children(streamName ? `${className} / ${streamName}` : className)}</>;
}
