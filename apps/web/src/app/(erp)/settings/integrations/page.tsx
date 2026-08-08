"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useIntegrationConfigs } from "@/features/settings/hooks/use-integration-configs";
import { IntegrationEnabledBadge, IntegrationLastTestBadge } from "@/features/settings/components/integration-status-badges";
import { NewIntegrationDialog } from "@/features/settings/components/new-integration-dialog";
import { EditIntegrationDialog } from "@/features/settings/components/edit-integration-dialog";
import { TestConnectionDialog } from "@/features/settings/components/test-connection-dialog";
import type { IntegrationConfig } from "@/features/settings/types";

/**
 * `settings:integration:view`/`:manage` — the first Settings-area screen in
 * the whole frontend (per the plan). Every column here is a real, non-secret
 * field the controller's own `toView()` mapper returns (`kind`/`name`/
 * `isEnabled`/`priority`/`lastTestedAt`/`lastTestOk`) — `configEnc` is never
 * fetched, never rendered, never in this page's own data at all.
 */
export default function IntegrationsSettingsPage() {
  const t = useTranslations("settings.integrations");
  const configsQuery = useIntegrationConfigs();

  const columns = React.useMemo<ColumnDef<IntegrationConfig>[]>(
    () => [
      { accessorKey: "kind", header: t("kind") },
      { accessorKey: "name", header: t("name") },
      { id: "isEnabled", header: t("isEnabledLabel"), cell: ({ row }) => <IntegrationEnabledBadge isEnabled={row.original.isEnabled} /> },
      { accessorKey: "priority", header: t("priority") },
      {
        id: "lastTestedAt",
        header: t("lastTestedAt"),
        cell: ({ row }) => (row.original.lastTestedAt ? new Date(row.original.lastTestedAt).toLocaleString() : t("neverTested")),
      },
      { id: "lastTestOk", header: t("lastTestResult"), cell: ({ row }) => <IntegrationLastTestBadge lastTestOk={row.original.lastTestOk} /> },
      {
        id: "actions",
        header: t("actionsHeader"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <EditIntegrationDialog config={row.original} />
            <TestConnectionDialog config={row.original} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <NewIntegrationDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={configsQuery} isEmpty={(d) => d.length === 0}>
            {(configs) => <DataTable columns={columns} data={configs} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
