"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ServerPaginationState } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ReceiptsTable } from "@/features/payments/components/receipts-table";
import { useAllReceipts } from "@/features/payments/hooks/use-receipts";
import { RECEIPT_SPLIT_METHODS, type ReceiptSplitMethod } from "@/features/payments/constants";

const DEFAULT_PAGE_SIZE = 10;
const ALL_METHODS_VALUE = "__all__";
/** Phase 6 Slice 9 (Part B) — the plan's explicit "only fire once 2+ characters are typed" ask; 0-1 characters clears back to the unfiltered list. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list, reached
 * from the Billing nav dropdown's 6th and final child. Server-paginated (the
 * same `<DataTable serverPagination>` precedent Slice 3/4's Pending/Upcoming
 * screens established), gated server-side by `payments:receipt:view-all` —
 * a caller without it sees `<QueryBoundary>`'s existing "permission-denied"
 * state, not a page-level special case.
 *
 * Filters: date range (dateFrom/dateTo, plain `<Input type="date">`, the
 * simplest reuse — this codebase has no dedicated date-range-picker
 * component anywhere, confirmed before building this) and payment method
 * (`<Select>` + `RECEIPT_SPLIT_METHODS`, the exact reuse
 * `features/payments/components/split-row.tsx`'s own method picker already
 * established, same `payments.splitMethods` i18n namespace). `studentId`/
 * `cashierId` filters are supported by the backend
 * (`PayReceiptRepository.findAllPaginated()`) but have no UI here — this
 * screen has no existing student-search-by-id or cashier-picker widget to
 * cleanly reuse, and free-typing a raw UUID would not be a "straightforward
 * reuse of an existing pattern," per the plan's own explicit
 * don't-over-build guidance.
 *
 * Phase 6 Slice 9 (Part B) — gained a debounced (300ms, `useDebouncedValue()`)
 * name/admission-number search box, wired to the backend's new `q` param.
 * Only fires once 2+ characters are typed (`MIN_SEARCH_LENGTH`) — below
 * that, `q` stays `undefined` and the unfiltered (still date/method-filtered,
 * if set) list shows, per the plan's explicit ask.
 */
export default function ReceiptsPage() {
  const t = useTranslations("billing.receipts");
  const tMethod = useTranslations("payments.splitMethods");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [method, setMethod] = React.useState<ReceiptSplitMethod | null>(null);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const trimmedSearch = debouncedSearch.trim();
  const q = trimmedSearch.length >= MIN_SEARCH_LENGTH ? trimmedSearch : undefined;

  const query = useAllReceipts({
    page,
    pageSize,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    method: method ?? undefined,
    q,
  });

  // A filter change is a genuinely different result set — page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, method, q]);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("search")}</Label>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("searchPlaceholder")}
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("dateFrom")}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="sm:w-44" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("dateTo")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="sm:w-44" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("method")}</Label>
              <Select
                value={method ?? ALL_METHODS_VALUE}
                onValueChange={(v) => setMethod(v === ALL_METHODS_VALUE ? null : (v as ReceiptSplitMethod))}
              >
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder={t("allMethods")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_METHODS_VALUE}>{t("allMethods")}</SelectItem>
                  {RECEIPT_SPLIT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethod(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
            {(data) => <ReceiptsTable receipts={data.items} showStudentAndCashier serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
