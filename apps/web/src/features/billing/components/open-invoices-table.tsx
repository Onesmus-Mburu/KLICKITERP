"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PendingUpcomingInvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useOpenInvoices } from "../hooks/use-invoices";
import { InvoiceStatusBadge } from "./status-badges";

const DEFAULT_PAGE_SIZE = 10;
/** Phase 6 Slice 9 (Part B) — the plan's explicit "only fire once 2+ characters are typed" ask; 0-1 characters clears back to the unfiltered list. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Phase 6 Slice 8 (Part 2) — one parametrized table for both the Pending and
 * Upcoming invoice list screens (`bucket` prop): the columns, empty-state
 * copy, and `<DataTable serverPagination>` wiring are identical between the
 * two, only the underlying query differs — matching the plan's own "your
 * call, one parametrized component or two, based on how much they'd
 * actually share" guidance. Owns its own page/pageSize state (same shape
 * `app/(erp)/students/page.tsx` already established), resolves `classId`
 * -> class name via the EXISTING `useClasses()` hook (same technique
 * `student-columns.tsx` already uses — one shared, TanStack-Query-deduped
 * fetch, not a per-row lookup).
 *
 * The Actions column's "Collect" button links into `/billing/collect` (the
 * Collect Fees flow, built in a LATER dispatch — this link 404s until then,
 * expected and documented, not a placeholder flow built here) with the
 * invoice's `studentId`/`id` pre-filled as query params.
 *
 * Phase 6 Slice 9 (Part B) — gained a debounced (300ms, `useDebouncedValue()`)
 * search box wired to the backend's new `q` param (ILIKE against the joined
 * student's name/admission number). Only fires once 2+ characters are typed
 * (`MIN_SEARCH_LENGTH`) — below that, `q` stays `undefined` and the
 * unfiltered list shows, per the plan's explicit ask. A search-term change
 * resets to page 1, the same "a filter change is a genuinely different
 * result set" convention `app/(erp)/students/page.tsx`/`billing/receipts/page.tsx`
 * already establish.
 */
export function OpenInvoicesTable({ bucket }: { bucket: "PENDING" | "UPCOMING" }) {
  const t = useTranslations("billing.openInvoices");
  const classesQuery = useClasses();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const trimmedSearch = debouncedSearch.trim();
  const q = trimmedSearch.length >= MIN_SEARCH_LENGTH ? trimmedSearch : undefined;

  React.useEffect(() => {
    setPage(1);
  }, [q]);

  const query = useOpenInvoices(bucket, { page, pageSize, q });

  const classNameById = React.useMemo(() => new Map((classesQuery.data ?? []).map((klass) => [klass.id, klass.name])), [classesQuery.data]);

  const columns = React.useMemo<ColumnDef<PendingUpcomingInvoiceResponseDto>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        cell: ({ row }) => (
          <span>
            {row.original.studentName}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.admissionNo})</span>
          </span>
        ),
      },
      {
        id: "class",
        header: t("columns.class"),
        cell: ({ row }) => classNameById.get(row.original.classId) ?? "—",
      },
      { accessorKey: "number", header: t("columns.number") },
      { accessorKey: "dueDate", header: t("columns.dueDate") },
      {
        accessorKey: "total",
        header: t("columns.total"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        accessorKey: "balance",
        header: t("columns.balance"),
        cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/billing/collect?studentId=${row.original.studentId}&invoiceId=${row.original.id}`}>{t("collect")}</Link>
          </Button>
        ),
      },
    ],
    [t, classNameById],
  );

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const serverPagination: ServerPaginationState = {
    page,
    pageSize,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
  };

  return (
    <div className="space-y-4">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t("searchPlaceholder")}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
      </div>
      <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => <DataTable columns={columns} data={data.items} serverPagination={serverPagination} />}
      </QueryBoundary>
    </div>
  );
}
