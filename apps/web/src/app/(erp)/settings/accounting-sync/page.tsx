"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { type ServerPaginationState } from "@/components/patterns/data-table";
import { useSyncLog } from "@/features/integrations/hooks/use-sync";
import { ACCOUNTING_SYNC_KINDS, type AccountingSyncKind, type SyncLogStatus } from "@/features/integrations/api/sync.api";
import { SyncLogTable } from "@/features/integrations/components/sync-log-table";
import { TestAccountingSyncConnectionCard } from "@/features/integrations/components/test-accounting-sync-connection-card";

const DEFAULT_PAGE_SIZE = 10;
const ALL_KINDS_VALUE = "__all__";
const ALL_STATUSES_VALUE = "__all__";
const SYNC_LOG_STATUSES: readonly SyncLogStatus[] = ["SUCCESS", "FAILED"];

/**
 * `integrations:sync:view`/`:test` — Phase 6 Slice 11 Part 4's Accounting
 * Sync screen (Module 19). A real "Test the real provider connection" card
 * (`<TestAccountingSyncConnectionCard>` — deliberately, explicitly labeled
 * as distinct from Module 2's own permanent-stub "Test connection" button on
 * `/settings/integrations`, see that component's own doc comment) plus a
 * paginated, filterable Sync Log viewer (`GET /integrations/sync/log`).
 * `POST /integrations/sync/push` is deliberately NOT wired up anywhere on
 * this page — out of scope per the plan's own explicit scope boundary (a
 * raw provider-shaped payload only makes sense constructed from a real
 * domain record by that record's own screen, a future integration task).
 */
export default function AccountingSyncSettingsPage() {
  const t = useTranslations("settings.accountingSync");

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [kind, setKind] = React.useState<AccountingSyncKind | null>(null);
  const [entityType, setEntityType] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [status, setStatus] = React.useState<SyncLogStatus | null>(null);

  const logQuery = useSyncLog({
    page,
    pageSize,
    kind: kind ?? undefined,
    entityType: entityType.trim() || undefined,
    entityId: entityId.trim() || undefined,
    status: status ?? undefined,
  });

  React.useEffect(() => {
    setPage(1);
  }, [kind, entityType, entityId, status]);

  const total = logQuery.data?.meta.total ?? 0;
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

      <TestAccountingSyncConnectionCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("logTitle")}</CardTitle>
          <CardDescription>{t("logDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("filterKind")}</Label>
              <Select value={kind ?? ALL_KINDS_VALUE} onValueChange={(v) => setKind(v === ALL_KINDS_VALUE ? null : (v as AccountingSyncKind))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("allKinds")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_KINDS_VALUE}>{t("allKinds")}</SelectItem>
                  {ACCOUNTING_SYNC_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("filterEntityType")}</Label>
              <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder={t("allEntityTypes")} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("filterEntityId")}</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder={t("entityIdPlaceholder")} className="w-64" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("filterStatus")}</Label>
              <Select value={status ?? ALL_STATUSES_VALUE} onValueChange={(v) => setStatus(v === ALL_STATUSES_VALUE ? null : (v as SyncLogStatus))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>{t("allStatuses")}</SelectItem>
                  {SYNC_LOG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={logQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => <SyncLogTable logs={data.items} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
