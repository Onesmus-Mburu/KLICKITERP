"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { CreateServicePointDialog } from "@/features/wallet/components/service-point-dialog";
import { ServicePointsTable } from "@/features/wallet/components/service-points-table";
import { useServicePoints } from "@/features/wallet/hooks/use-service-points";

/**
 * Phase 6 Slice 11 (Part 3) — `wallet-service-points` CRUD + operator
 * assignment (`wallet:service-point:manage`, the ONLY permission this whole
 * controller has, for both read and write — reused as-is). Reached from the
 * Wallet nav dropdown's new "Service Points" child.
 */
export default function ServicePointsPage() {
  const t = useTranslations("wallet.servicePoints.list");
  const query = useServicePoints();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateServicePointDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={(d) => d.length === 0}>
            {(servicePoints) => <ServicePointsTable servicePoints={servicePoints} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
