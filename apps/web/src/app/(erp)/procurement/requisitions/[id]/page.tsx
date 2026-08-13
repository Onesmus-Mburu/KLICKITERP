"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, FileSearch } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useDepartment } from "@/features/departments/hooks/use-departments";
import { useRequisition, useRequisitionLines } from "@/features/procurement/hooks/use-requisitions";
import { RequisitionLineEditor } from "@/features/procurement/components/requisition-line-editor";
import { RequisitionStatusActions } from "@/features/procurement/components/requisition-status-actions";
import { CreatePoDialog } from "@/features/procurement/components/create-po-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  SUBMITTED: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-success",
  REJECTED: "soft-destructive",
  CONVERTED: "soft-success",
  CANCELLED: "outline",
};

/**
 * Phase 6 Slice 18 Part 2 (Procurement, Module 12) — a requisition's detail
 * view: header Card (number, department, justification, total estimate,
 * status badge, `<RequisitionStatusActions>`), an optional read-only budget
 * snapshot panel (present only once `submit()` has run), and a lines Card
 * (`<RequisitionLineEditor>`). Same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `suppliers/[id]/page.tsx` (Part 1) /
 * `budgets/[id]/page.tsx` already established.
 *
 * The department's own NAME (not just its id) is resolved via
 * `useDepartment()` for the header — `RequisitionResponseDto` only carries
 * `departmentId`, no denormalized name field, the same shape
 * `budgets/[id]/page.tsx` already handles for `fiscalYearId`/`useFiscalYear()`.
 *
 * **`budgetSnapshot` is rendered defensively, per the plan's own explicit
 * instruction** — its exact shape isn't documented anywhere reliable beyond
 * `RequisitionsService.buildBudgetSnapshot()`'s own return type
 * (`BudgetSnapshot`, read directly: `checkedAt`, `lines[]`, `totalEstimate`
 * always present; each line's `accountId`/`annualAmount`/`actuals`/
 * `available`/`withinAvailable` are only present when that line was
 * `budgeted: true`). Every field is read via optional chaining/`??`
 * fallbacks, never assumed present beyond what reading the service directly
 * confirms.
 */
export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.requisitions.detail");
  const tStatuses = useTranslations("procurement.requisitions.statuses");
  const requisitionQuery = useRequisition(id);
  const linesQuery = useRequisitionLines(id);
  const departmentQuery = useDepartment(requisitionQuery.data?.departmentId);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/requisitions">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={requisitionQuery}>
        {(requisition) => {
          const snapshot = requisition.budgetSnapshot;
          const snapshotLines = Array.isArray(snapshot?.lines) ? (snapshot.lines as Record<string, unknown>[]) : [];

          return (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base text-foreground">{requisition.number}</CardTitle>
                      <Badge variant={STATUS_BADGE_VARIANT[requisition.status] ?? "outline"}>{tStatuses(requisition.status)}</Badge>
                    </div>
                    <CardDescription>{departmentQuery.data?.name ?? requisition.departmentId}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      Phase 6 Slice 18 Part 3 (Procurement, Module 12) — the
                      real cross-link between Part 2's requisitions and this
                      part's quotations/POs. "View quotations" is offered for
                      APPROVED (still sourcing) AND CONVERTED (already turned
                      into a PO — the quotes captured against it are still
                      real, worth revisiting) requisitions; "Create purchase
                      order" only for APPROVED, since converting flips the
                      requisition to CONVERTED server-side
                      (`RequisitionsService`'s own
                      `markConverted()`/`createFromRequisition()` — confirmed
                      by reading it directly) and there is no route to
                      convert the same requisition twice.
                    */}
                    {(requisition.status === "APPROVED" || requisition.status === "CONVERTED") && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/procurement/quotations?requisitionId=${requisition.id}`}>
                          <FileSearch className="size-4" />
                          {t("viewQuotationsAction")}
                        </Link>
                      </Button>
                    )}
                    {requisition.status === "APPROVED" && <CreatePoDialog requisitionId={requisition.id} />}
                    <RequisitionStatusActions requisition={requisition} hasLines={(linesQuery.data ?? []).length > 0} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("justificationLabel")}</p>
                    <p className="text-sm text-foreground">{requisition.justification}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("totalEstimateLabel")}</p>
                    <p className="text-sm text-foreground">{formatMoney(requisition.totalEstimate)}</p>
                  </div>

                  {snapshot && (
                    <div className="space-y-2 rounded-lg border border-border p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("budgetSnapshotTitle")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("budgetSnapshotCheckedAt", { checkedAt: String(snapshot.checkedAt ?? "—") })}
                      </p>
                      {snapshotLines.length > 0 && (
                        <ul className="space-y-1 text-xs text-foreground">
                          {snapshotLines.map((line, idx) => (
                            <li
                              key={idx}
                              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1 last:border-0"
                            >
                              <span>{line.budgeted ? t("budgetSnapshotBudgeted") : t("budgetSnapshotNotBudgeted")}</span>
                              <span>{t("budgetSnapshotLineEstimate", { amount: formatMoney(String(line.lineEstimate ?? "0")) })}</span>
                              {typeof line.withinAvailable === "boolean" && (
                                <Badge variant={line.withinAvailable ? "soft-success" : "soft-destructive"}>
                                  {line.withinAvailable ? t("budgetSnapshotWithinAvailable") : t("budgetSnapshotOverAvailable")}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RequisitionLineEditor requisition={requisition} />
                </CardContent>
              </Card>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
