"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OpsHealthSummary } from "../api/ops.api";
import { formatBytes } from "../lib/format-bytes";

/**
 * `license.license.state`'s real values (`license-status-card.tsx`'s own
 * 6-value enum) plus `"NOT_PROVISIONED"` (this environment's own real,
 * expected value per Slice 24's findings — zero rows in `license.license`)
 * and a generic fallback for the `"ERROR: ..."` string
 * `OpsHealthService.checkLicenseState()` returns on a genuine query failure.
 * Echoes `license-status-card.tsx`'s own established badge-tone vocabulary
 * for visual consistency between the two System Administration screens, per
 * this slice's own brief.
 */
const LICENSE_STATE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  GRACE: "soft-warning",
  PROVISIONED: "soft-primary",
  NOT_PROVISIONED: "soft-secondary",
  SUSPENDED: "soft-destructive",
  DEACTIVATED: "soft-destructive",
  EXPIRED: "soft-destructive",
};

function licenseStateBadgeVariant(state: string): BadgeProps["variant"] {
  if (state.startsWith("ERROR")) return "soft-destructive";
  return LICENSE_STATE_BADGE_VARIANT[state] ?? "outline";
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-destructive" />;
}

function CheckCard({ title, ok, children }: { title: string; ok: boolean; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm text-foreground">{title}</CardTitle>
        <StatusIcon ok={ok} />
      </CardHeader>
      <CardContent className="space-y-1 text-xs text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `GET /ops/health` rendered as a
 * grid of health-check cards (DB/Redis/MinIO/Disk/Last Backup) each with its
 * own real ok/error state, plus a "System info" section.
 *
 * `disk.available: false` is rendered as a real, non-error DEGRADED-BUT-VALID
 * state (per `OpsHealthService`'s own doc comment: "Windows dev environments
 * can lack full fs.statfs support") — the card's own status icon still turns
 * red (it genuinely couldn't measure disk usage), but the body text reads as
 * an honest explanation, not a crash. Same treatment for
 * `lastBackup.found: false` (a real "no backup has ever run" state).
 */
export function OpsHealthDashboard({ health }: { health: OpsHealthSummary }) {
  const t = useTranslations("backupsOps.health");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CheckCard title={t("databaseTitle")} ok={health.database.ok}>
          {health.database.ok ? (
            <p>{t("databaseSize", { size: formatBytes(health.database.sizeBytes ?? null) })}</p>
          ) : (
            <p className="text-destructive">{health.database.error}</p>
          )}
        </CheckCard>

        <CheckCard title={t("redisTitle")} ok={health.redis.ok}>
          {health.redis.ok ? <p>{t("redisDetail", { detail: health.redis.detail ?? "—" })}</p> : <p className="text-destructive">{health.redis.error}</p>}
        </CheckCard>

        <CheckCard title={t("minioTitle")} ok={health.minio.ok}>
          {health.minio.ok ? <p>{t("minioOk")}</p> : <p className="text-destructive">{health.minio.error}</p>}
        </CheckCard>

        <CheckCard title={t("diskTitle")} ok={health.disk.available}>
          {health.disk.available ? (
            <>
              <p>{t("diskUsed", { percent: health.disk.usedPercent ?? 0 })}</p>
              <p>{t("diskFree", { free: formatBytes(health.disk.freeBytes ?? null), total: formatBytes(health.disk.totalBytes ?? null) })}</p>
            </>
          ) : (
            <p>{t("diskUnavailable", { note: health.disk.note ?? "—" })}</p>
          )}
        </CheckCard>

        <CheckCard title={t("lastBackupTitle")} ok={health.lastBackup.found}>
          {health.lastBackup.found ? (
            <>
              <p>{t("lastBackupStatus", { status: health.lastBackup.status ?? "—" })}</p>
              <p>{t("lastBackupAge", { hours: health.lastBackup.ageHours ?? 0 })}</p>
            </>
          ) : (
            <p>{t("lastBackupNone")}</p>
          )}
        </CheckCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("systemInfoTitle")}</CardTitle>
          <CardDescription>{t("systemInfoDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("appVersionLabel")}</p>
            <p className="text-sm font-medium text-foreground">{health.appVersion}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("licenseStateLabel")}</p>
            <Badge variant={licenseStateBadgeVariant(health.licenseState)}>{health.licenseState}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("queueDepthsLabel")}</p>
            <p className="text-sm text-muted-foreground">{health.queueDepths.note}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("logLevelLabel")}</p>
            <p className="text-sm font-medium text-foreground">{health.logLevel.current}</p>
            <p className="text-xs text-muted-foreground">{health.logLevel.note}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("generatedAtLabel")}</p>
            <p className="text-sm font-medium text-foreground">{formatDateTime(health.generatedAt)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
