"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { type ServerPaginationState } from "@/components/patterns/data-table";
import { useWebhookSubscriptions } from "@/features/integrations/hooks/use-webhook-subscriptions";
import { useWebhookDeliveries } from "@/features/integrations/hooks/use-webhook-deliveries";
import { WebhookSubscriptionsTable } from "@/features/integrations/components/webhook-subscriptions-table";
import { WebhookDeliveriesTable } from "@/features/integrations/components/webhook-deliveries-table";
import { NewWebhookSubscriptionDialog } from "@/features/integrations/components/new-webhook-subscription-dialog";
import { ProcessDueDeliveriesButton } from "@/features/integrations/components/process-due-deliveries-button";
import type { WebhookDeliveryStatus } from "@/features/integrations/api/webhook-deliveries.api";

const DEFAULT_PAGE_SIZE = 10;
const ALL_SUBSCRIPTIONS_VALUE = "__all__";
const ALL_STATUSES_VALUE = "__all__";
const DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] = ["PENDING", "DELIVERED", "FAILED", "DEAD"];

/**
 * `integrations:webhook:view`/`:manage`/`:retry` — Phase 6 Slice 11 Part 4's
 * Webhooks screen (Module 19, FR-INTG-007.1). Two sections on one page (the
 * plan's own "your call" — a plain stacked-Card layout, mirroring
 * `academic-calendar/page.tsx`'s established "list + filtered sub-list"
 * shape rather than a tabbed layout, since both sections are small enough to
 * both stay visible at once): Subscriptions (an unpaginated `<DataTable>` —
 * `WebhookSubscriptionsController.list()` returns a bare array) and
 * Deliveries (a real `<DataTable serverPagination>`, filterable by
 * subscription/status, with a prominent "Process due deliveries now" button
 * — no scheduler exists anywhere in this codebase, so this is a deliberate
 * manual admin action, never implied to run automatically).
 */
export default function WebhooksSettingsPage() {
  const t = useTranslations("settings.webhooks");
  const subscriptionsQuery = useWebhookSubscriptions();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [subscriptionId, setSubscriptionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<WebhookDeliveryStatus | null>(null);

  const deliveriesQuery = useWebhookDeliveries({
    page,
    pageSize,
    subscriptionId: subscriptionId ?? undefined,
    status: status ?? undefined,
  });

  React.useEffect(() => {
    setPage(1);
  }, [subscriptionId, status]);

  const total = deliveriesQuery.data?.meta.total ?? 0;
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-foreground">{t("subscriptionsTitle")}</CardTitle>
            <CardDescription>{t("subscriptionsDescription")}</CardDescription>
          </div>
          <NewWebhookSubscriptionDialog />
        </CardHeader>
        <CardContent>
          <QueryBoundary query={subscriptionsQuery} isEmpty={(d) => d.length === 0}>
            {(subscriptions) => <WebhookSubscriptionsTable subscriptions={subscriptions} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("deliveries.title")}</CardTitle>
          <CardDescription>{t("deliveries.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProcessDueDeliveriesButton />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("deliveries.filterSubscription")}</Label>
              <Select value={subscriptionId ?? ALL_SUBSCRIPTIONS_VALUE} onValueChange={(v) => setSubscriptionId(v === ALL_SUBSCRIPTIONS_VALUE ? null : v)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={t("deliveries.allSubscriptions")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUBSCRIPTIONS_VALUE}>{t("deliveries.allSubscriptions")}</SelectItem>
                  {subscriptionsQuery.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("deliveries.filterStatus")}</Label>
              <Select value={status ?? ALL_STATUSES_VALUE} onValueChange={(v) => setStatus(v === ALL_STATUSES_VALUE ? null : (v as WebhookDeliveryStatus))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("deliveries.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>{t("deliveries.allStatuses")}</SelectItem>
                  {DELIVERY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`deliveries.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QueryBoundary query={deliveriesQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => (
              <WebhookDeliveriesTable deliveries={data.items} subscriptions={subscriptionsQuery.data ?? []} serverPagination={serverPagination} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
