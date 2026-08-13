"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { JournalResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useJournals } from "@/features/accounting/hooks/use-journals";
import { EMPTY_JOURNAL_FILTERS, JournalFilters, journalFiltersToParams, type JournalFiltersState } from "@/features/accounting/components/journal-filters";

const JOURNAL_TYPE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  SYSTEM: "soft-secondary",
  MANUAL: "soft-primary",
  REVERSING: "soft-warning",
  CLOSING: "soft-destructive",
  OPENING: "soft-success",
};

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — the journals list:
 * `GET /accounting/journals` (`accounting:journal:view`) filtered by
 * `<JournalFilters>`, as a plain `<DataTable>` (client-side pagination —
 * this endpoint has no server-side pagination params, confirmed by reading
 * `JournalsController.list()`/`GlJournalRepository.list()` directly, same
 * "small enough, no server pagination exists" reasoning `fiscal-years/page.tsx`
 * already established for its own list). Row click navigates to
 * `/accounting/journals/[id]`, the same `onRowClick` mechanism every other
 * list page in this codebase uses.
 *
 * **No line counts/amounts in this table** — `listJournals()`'s own doc
 * comment confirms `lines` is always `[]` on every row this endpoint
 * returns, so there is nothing line-shaped to show here even if the design
 * wanted it.
 */
export default function JournalsPage() {
  const t = useTranslations("accounting.journals.list");
  const tTypes = useTranslations("accounting.journalTypes");
  const router = useRouter();
  const [filters, setFilters] = React.useState<JournalFiltersState>(EMPTY_JOURNAL_FILTERS);
  const journalsQuery = useJournals(journalFiltersToParams(filters));

  const columns = React.useMemo<ColumnDef<JournalResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("columns.number") },
      { accessorKey: "journalDate", header: t("columns.journalDate") },
      { accessorKey: "sourceModule", header: t("columns.sourceModule") },
      { accessorKey: "narration", header: t("columns.narration") },
      {
        id: "journalType",
        header: t("columns.journalType"),
        cell: ({ row }) => (
          <Badge variant={JOURNAL_TYPE_BADGE_VARIANT[row.original.journalType] ?? "outline"}>{tTypes(row.original.journalType)}</Badge>
        ),
      },
    ],
    [t, tTypes],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button type="button" asChild>
          <Link href="/accounting/journals/new">
            <Plus className="size-4" />
            {t("newJournalTrigger")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <JournalFilters value={filters} onChange={setFilters} />
          <QueryBoundary query={journalsQuery} isEmpty={(d) => d.length === 0}>
            {(journals) => <DataTable columns={columns} data={journals} onRowClick={(row) => router.push(`/accounting/journals/${row.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
