"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { JournalLineResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useJournal, useJournalReversal } from "@/features/accounting/hooks/use-journals";
import { ReverseJournalDialog } from "@/features/accounting/components/reverse-journal-dialog";

const JOURNAL_TYPE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  SYSTEM: "soft-secondary",
  MANUAL: "soft-primary",
  REVERSING: "soft-warning",
  CLOSING: "soft-destructive",
  OPENING: "soft-success",
};

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — a journal's detail view:
 * header fields (number, date, source, narration, type) + its lines table +
 * a Reverse button. `GET /accounting/journals/{id}` is the only endpoint
 * that populates `lines` (`useJournal()`'s own doc comment) — same
 * `useParams<{id:string}>()` + `<QueryBoundary>` shape
 * `fiscal-years/[id]/page.tsx` already established.
 *
 * **Reverse button visibility**: `useJournalReversal()` (see that hook's own
 * doc comment for the `sourceDocId`-narrowed detection strategy, since no
 * server-side "already reversed" guard exists) hides the button once a
 * reversal is found and shows a link to it instead. A journal that is
 * ITSELF a reversal (`journalType === "REVERSING"`) can still be reversed
 * again (nothing in `PostingService` forbids reversing a reversal, and the
 * plan doesn't ask this page to invent that restriction) — its own
 * `reversalOfId` is shown as a link back to the original for context.
 */
export default function JournalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("accounting.journals.detail");
  const tTypes = useTranslations("accounting.journalTypes");
  const journalQuery = useJournal(id);
  const reversalCheck = useJournalReversal(journalQuery.data);
  const accountsQuery = useAccounts();
  const costCentersQuery = useCostCenters();

  const accountLabelById = React.useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, `${a.code} — ${a.name}`])),
    [accountsQuery.data],
  );
  const costCenterLabelById = React.useMemo(
    () => new Map((costCentersQuery.data ?? []).map((c) => [c.id, `${c.code} — ${c.name}`])),
    [costCentersQuery.data],
  );

  const columns = React.useMemo<ColumnDef<JournalLineResponseDto>[]>(
    () => [
      { accessorKey: "lineNo", header: t("columns.lineNo") },
      {
        id: "account",
        header: t("columns.account"),
        cell: ({ row }) => accountLabelById.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "costCenter",
        header: t("columns.costCenter"),
        cell: ({ row }) => (row.original.costCenterId ? (costCenterLabelById.get(row.original.costCenterId) ?? row.original.costCenterId) : "—"),
      },
      { id: "debit", header: t("columns.debit"), cell: ({ row }) => formatMoney(row.original.debit) },
      { id: "credit", header: t("columns.credit"), cell: ({ row }) => formatMoney(row.original.credit) },
      { id: "memo", header: t("columns.memo"), cell: ({ row }) => row.original.memo ?? "—" },
    ],
    [t, accountLabelById, costCenterLabelById],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounting/journals">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={journalQuery}>
        {(journal) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{journal.number}</CardTitle>
                  <CardDescription>{journal.narration}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={JOURNAL_TYPE_BADGE_VARIANT[journal.journalType] ?? "outline"}>{tTypes(journal.journalType)}</Badge>
                  {reversalCheck.reversedBy ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/accounting/journals/${reversalCheck.reversedBy.id}`}>{t("viewReversal")}</Link>
                    </Button>
                  ) : (
                    <ReverseJournalDialog journal={journal} />
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">{t("journalDateLabel")}</p>
                  <p className="font-medium text-foreground">{journal.journalDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("sourceModuleLabel")}</p>
                  <p className="font-medium text-foreground">{journal.sourceModule}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("sourceDocTypeLabel")}</p>
                  <p className="font-medium text-foreground">{journal.sourceDocType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("postedByLabel")}</p>
                  <p className="font-medium text-foreground">{journal.postedBy}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("postedAtLabel")}</p>
                  <p className="font-medium text-foreground">{new Date(journal.postedAt).toLocaleString()}</p>
                </div>
                {journal.reversalOfId && (
                  <div>
                    <p className="text-muted-foreground">{t("reversalOfLabel")}</p>
                    <Link href={`/accounting/journals/${journal.reversalOfId}`} className="font-medium text-primary hover:underline">
                      {t("viewOriginal")}
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable columns={columns} data={journal.lines ?? []} />
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
