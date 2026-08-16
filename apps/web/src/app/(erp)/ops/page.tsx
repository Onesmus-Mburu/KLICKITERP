"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useOpsHealth } from "@/features/backups-ops/hooks/use-ops-health";
import { OpsHealthDashboard } from "@/features/backups-ops/components/ops-health-dashboard";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `ops:health:view`. The System
 * Health landing page (`GET /ops/health`), one nav-reachable half of this
 * slice's single nav entry (`/ops/backups`) — see this page's own header
 * link into the Backups list, and that list's own reciprocal link back here,
 * a two-way link pair rather than folding both into one route/tab, per the
 * task brief's own explicit "your call" on exact routing shape.
 *
 * **Not `@ExemptFromLicenseGuard()` server-side** (a real, if minor,
 * inconsistency with `BackupsController`'s own class-level exemption,
 * confirmed by reading `OpsController` directly — see `features/backups-ops/
 * api/ops.api.ts`'s own doc comment) — if this instance's license ever
 * reaches `DEACTIVATED`, this query hits a real `403` from the global
 * `LicenseStateGuard` before the controller ever runs. `<QueryBoundary>`'s
 * generic permission-denied state renders that reasonably.
 */
export default function OpsHealthPage() {
  const t = useTranslations("backupsOps.health");
  const healthQuery = useOpsHealth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link href="/ops/backups">
            {t("viewBackupsLink")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <QueryBoundary query={healthQuery}>{(health) => <OpsHealthDashboard health={health} />}</QueryBoundary>
    </div>
  );
}
