"use client";

import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { InboxTable } from "@/features/approvals/components/inbox-table";
import { useInbox } from "@/features/approvals/hooks/use-instances";

/**
 * The approval inbox — `<DataTable>` over `GET /approvals/instances/inbox`,
 * each row resolved via `<EntityLabel>`/`<UserName>`. No notifications/
 * polling/websocket mechanism exists anywhere in this codebase (per the
 * plan's explicit instruction not to build one) — freshness relies on
 * TanStack Query's default `refetchOnWindowFocus` plus this explicit manual
 * refresh control.
 */
export default function ApprovalsPage() {
  const t = useTranslations("approvals.inbox");
  const tCommon = useTranslations("common");
  const inboxQuery = useInbox();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void inboxQuery.refetch()} disabled={inboxQuery.isFetching}>
          <RefreshCw className={inboxQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
          {tCommon("refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={inboxQuery}>{(instances) => <InboxTable instances={instances} />}</QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
