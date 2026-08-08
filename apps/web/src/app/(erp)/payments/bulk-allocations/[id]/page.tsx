"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useBulkAllocationBatch, useBulkAllocationBatchLines, useMatchAndPostBulkAllocationBatch } from "@/features/payments/hooks/use-bulk-allocation";
import { BulkAllocationStatusBadge } from "@/features/payments/components/payment-status-badges";
import { BulkAllocationLineStudentCell } from "@/features/payments/components/bulk-allocation-line-student-cell";
import { BankAccountLabel } from "@/features/payments/components/bank-account-label";
import type { BulkAllocationBatchLineResponseDto, BulkAllocationBatchResponseDto } from "@klickit/contracts";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * Batch detail + "Run matching" + results, per the plan. `status:"FAILED"`
 * does NOT mean "everything failed" — it fires if ANY line fell through
 * (confirmed by reading `BulkAllocationService.matchAndPost()` directly), so
 * this page reads `createdReceipts` vs `lines.length` for the true "N of M
 * succeeded" picture, never the status string alone. A failed line's amount
 * is parked into `pay_suspense_item` (server-side, transactional,
 * partial-failure-tolerant) — batch lines carry no direct link to the
 * suspense item they produced (`BulkAllocationBatchLineResponseDto` has no
 * such field, confirmed in `bulk-allocation.dto.ts`), so a failed line's row
 * links to the suspense LIST instead, per the plan's own explicit note.
 */
function BatchDetail({ batch, id }: { batch: BulkAllocationBatchResponseDto; id: string }) {
  const t = useTranslations("payments.bulkAllocations.detail");
  const linesQuery = useBulkAllocationBatchLines(id);
  const [matchError, setMatchError] = React.useState<string | null>(null);
  const matchMutation = useMatchAndPostBulkAllocationBatch(id);

  async function handleRunMatching() {
    setMatchError(null);
    try {
      await matchMutation.mutateAsync();
    } catch (err) {
      setMatchError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canRunMatching = batch.status === "DRAFT" || batch.status === "MATCHING";

  const columns = React.useMemo<ColumnDef<BulkAllocationBatchLineResponseDto>[]>(
    () => [
      { id: "student", header: t("columnStudent"), cell: ({ row }) => <BulkAllocationLineStudentCell studentId={row.original.studentId} /> },
      { accessorKey: "amount", header: t("columnAmount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "outcome",
        header: t("columnOutcome"),
        cell: ({ row }) =>
          row.original.receiptId ? (
            <Link href={`/payments/receipts/${row.original.receiptId}`} className="text-primary hover:underline">
              {t("outcomeSucceeded")}
            </Link>
          ) : batch.status === "DRAFT" ? (
            <span className="text-muted-foreground">{t("outcomeNotRun")}</span>
          ) : (
            <Link href="/payments/suspense" className="text-destructive hover:underline">
              {t("outcomeFailed")}
            </Link>
          ),
      },
    ],
    [t, batch.status],
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <BulkAllocationStatusBadge status={batch.status} />
        </div>
        {canRunMatching && (
          <Button type="button" onClick={() => void handleRunMatching()} disabled={matchMutation.isPending}>
            <PlayCircle className="size-4" />
            {matchMutation.isPending ? t("running") : t("runMatching")}
          </Button>
        )}
      </div>

      {matchError && (
        <Alert variant="destructive">
          <AlertDescription>{matchError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileRow label={t("totalLabel")} value={formatMoney(batch.total)} />
          <ProfileRow label={t("bankAccountLabel")} value={<BankAccountLabel bankAccountId={batch.bankAccountId} />} />
          <ProfileRow
            label={t("outcomeSummaryLabel")}
            value={t("outcomeSummary", { created: batch.createdReceipts, total: linesQuery.data?.length ?? "…" })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
            {(lines) => <DataTable columns={columns} data={lines} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </>
  );
}

export default function BulkAllocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payments.bulkAllocations.detail");
  const batchQuery = useBulkAllocationBatch(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <QueryBoundary query={batchQuery}>{(batch) => <BatchDetail batch={batch} id={id} />}</QueryBoundary>
    </div>
  );
}
