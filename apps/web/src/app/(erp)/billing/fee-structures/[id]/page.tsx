"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import type { FeeStructureResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { useFeeGroups } from "@/features/students/hooks/use-fee-groups";
import { FeeStructureLineForm } from "@/features/billing/components/fee-structure-line-form";
import { FeeStructureLinesTable } from "@/features/billing/components/fee-structure-lines-table";
import { FeeStructureStatusBadge } from "@/features/billing/components/status-badges";
import { PublishFeeStructureButton } from "@/features/billing/components/publish-fee-structure-button";
import { DeleteFeeStructureButton } from "@/features/billing/components/delete-fee-structure-button";
import { EditPublishedFeeStructureButton } from "@/features/billing/components/edit-published-fee-structure-button";
import { useFeeStructure, useFeeStructureLines } from "@/features/billing/hooks/use-fee-structures";
import { PrintWatermark } from "@/features/document-verification/components/print-watermark";
import { VerificationQr } from "@/features/document-verification/components/verification-qr";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function FeeStructureDetail({ structure }: { structure: FeeStructureResponseDto }) {
  const t = useTranslations("billing.feeStructures.detail");
  const linesQuery = useFeeStructureLines(structure.id);
  const classesQuery = useClasses();
  const streamsQuery = useStreamsForClass(structure.streamId ? structure.classId : undefined);
  const feeGroupsQuery = useFeeGroups();

  const isDraft = structure.status === "DRAFT";
  const className = classesQuery.data?.find((k) => k.id === structure.classId)?.name ?? structure.classId;
  const streamName = structure.streamId ? (streamsQuery.data?.find((s) => s.id === structure.streamId)?.name ?? structure.streamId) : t("anyStream");
  const feeGroupName = structure.feeGroupId ? (feeGroupsQuery.data?.find((f) => f.id === structure.feeGroupId)?.name ?? structure.feeGroupId) : t("anyFeeGroup");
  const scopeLabel = structure.streamId ? `${className} / ${streamName}` : className;

  return (
    // Phase 6 Slice 3b — a clean printable view: `print:hidden` on every interactive control
    // below (back link, publish/delete/print buttons, the add-line form, the lines table's own
    // "Edit" action column), browser print only, no PDF library/export endpoint (explicitly out
    // of scope per the plan) — `window.print()` renders whatever the browser's print dialog
    // shows for this page, which after the `(erp)/layout.tsx`/`Sidebar`/`Topbar` print resets is
    // just this card content.
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{className}</h1>
          <p className="text-sm text-muted-foreground">{t("versionLabel", { version: structure.version })}</p>
        </div>
        <div className="flex items-center gap-2">
          <FeeStructureStatusBadge status={structure.status} />
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("printAction")}
          </Button>
          {isDraft && <PublishFeeStructureButton structureId={structure.id} />}
          {structure.status === "PUBLISHED" && linesQuery.data && (
            <EditPublishedFeeStructureButton structure={structure} lines={linesQuery.data} />
          )}
          <DeleteFeeStructureButton structure={structure} scopeLabel={scopeLabel} redirectOnSuccess />
        </div>
      </div>

      {/* Phase 6 Slice 16 Part 2: the printable card stack (Scope + Lines)
          wrapped in a single `relative` container so `<PrintWatermark>` (an
          `absolute inset-0` overlay, `pointer-events-none`) can cover the
          whole printed document — visible on-screen too, per its own doc
          comment's "what you see is what prints" principle. */}
      <div className="relative space-y-6">
        <PrintWatermark />

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-base text-foreground">{t("scopeTitle")}</CardTitle>
              <VerificationQr token={structure.verificationToken} />
            </div>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("classLabel")} value={className} />
            <ProfileRow label={t("streamLabel")} value={streamName} />
            <ProfileRow label={t("boardingLabel")} value={structure.boarding ?? t("anyBoarding")} />
            <ProfileRow label={t("feeGroupLabel")} value={feeGroupName} />
            <ProfileRow label={t("statusLabel")} value={<FeeStructureStatusBadge status={structure.status} />} />
            {structure.publishedAt && <ProfileRow label={t("publishedAtLabel")} value={String(structure.publishedAt).slice(0, 10)} />}
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isDraft && <p className="text-xs text-muted-foreground print:hidden">{t("linesLockedHint")}</p>}
            <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
              {(lines) => (
                <FeeStructureLinesTable structureId={structure.id} academicYearId={structure.academicYearId} lines={lines} editable={isDraft} />
              )}
            </QueryBoundary>
            {isDraft && (
              <div className="print:hidden">
                <FeeStructureLineForm structureId={structure.id} academicYearId={structure.academicYearId} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function FeeStructureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.feeStructures.detail");
  const structureQuery = useFeeStructure(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="print:hidden">
        <Link href="/billing/fee-structures">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={structureQuery}>{(structure) => <FeeStructureDetail structure={structure} />}</QueryBoundary>
    </div>
  );
}
