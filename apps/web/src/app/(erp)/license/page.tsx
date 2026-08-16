"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { type ServerPaginationState } from "@/components/patterns/data-table";
import { useApiCallLog, useLicenseStatus, useUpdateNotices } from "@/features/licensing/hooks/use-license";
import { LicenseStatusCard } from "@/features/licensing/components/license-status-card";
import { ApiCallLogTable } from "@/features/licensing/components/api-call-log-table";
import { UpdateNoticesList } from "@/features/licensing/components/update-notices-list";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Phase 6 Slice 24 (Licensing, Module 21) — `license:status:view`, a single
 * read-only screen, 3 sections: current status, the school-visible
 * `/license/v1/*` API call log (paginated), and update notices from Infoney.
 * No mutations exist anywhere on this module's staff-facing controller
 * (`LicenseStatusController` — 3 `GET`s, nothing else) — every hook here is
 * a plain `useQuery`.
 *
 * Deliberately NOT `@ExemptFromLicenseGuard()` server-side (confirmed by
 * reading `LicenseStatusController`'s own doc comment) — if this instance's
 * license ever reaches `DEACTIVATED`, all 3 queries this page depends on hit
 * a real `403 LICENSE_DEACTIVATED` from the global `LicenseStateGuard`
 * before the controller ever runs, including the one query that would
 * otherwise explain why. `<QueryBoundary>`'s generic error/permission-denied
 * states render that reasonably; no special-case messaging is added here for
 * a state this environment's own license was never put into (see this
 * slice's own PROGRESS.md write-up for why reproducing that live would have
 * been inappropriate).
 */
export default function LicensePage() {
  const t = useTranslations("license");
  const statusQuery = useLicenseStatus();
  const updateNoticesQuery = useUpdateNotices();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const apiLogQuery = useApiCallLog(page, pageSize);

  const total = apiLogQuery.data?.total ?? 0;
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

      <QueryBoundary query={statusQuery}>{(status) => <LicenseStatusCard status={status} />}</QueryBoundary>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("apiLog.title")}</CardTitle>
          <CardDescription>{t("apiLog.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={apiLogQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => <ApiCallLogTable items={data.items} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("updateNotices.title")}</CardTitle>
          <CardDescription>{t("updateNotices.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={updateNoticesQuery} isEmpty={(d) => d.length === 0}>
            {(notices) => <UpdateNoticesList notices={notices} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
