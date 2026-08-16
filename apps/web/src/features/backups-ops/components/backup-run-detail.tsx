"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BackupRunResponseDto, BackupRunStatus } from "../api/backups.api";
import { formatBytes } from "../lib/format-bytes";

const STATUS_BADGE_VARIANT: Record<BackupRunStatus, BadgeProps["variant"]> = {
  RUNNING: "soft-warning",
  OK: "soft-success",
  FAILED: "soft-destructive",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "break-all font-mono text-xs text-foreground" : "text-sm font-medium text-foreground"}>{value}</p>
    </div>
  );
}

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — one backup run's full detail:
 * status/size/sha256/destinations/manifest. `manifest` renders STRUCTURED
 * (not a raw `<pre>` dump, unlike `integrity-run-findings.tsx`'s own
 * `parsed === null` fallback) — `BackupManifest`'s shape is a real, fixed TS
 * interface server-side (`domain/bkp-backup-run.entity.ts`), not genuinely
 * arbitrary JSON, so this codebase's own "structure what's structured,
 * `<pre>`-dump what's genuinely arbitrary" precedent points at building real
 * fields here. `tableRowCounts` (the one genuinely dynamic-keyed piece) gets
 * a small key/value table rather than a fixed set of `<Field>`s.
 */
export function BackupRunDetail({ run }: { run: BackupRunResponseDto }) {
  const t = useTranslations("backupsOps.detail");
  const tKinds = useTranslations("backupsOps.kinds");
  const tStatuses = useTranslations("backupsOps.statuses");

  const rowCountEntries = run.manifest ? Object.entries(run.manifest.tableRowCounts) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
            <CardDescription className="break-all">{run.id}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="soft-secondary">{tKinds(run.kind)}</Badge>
            <Badge variant={STATUS_BADGE_VARIANT[run.status]}>{tStatuses(run.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("startedAtLabel")} value={formatDateTime(run.startedAt)} />
          <Field label={t("finishedAtLabel")} value={formatDateTime(run.finishedAt)} />
          <Field label={t("sizeLabel")} value={formatBytes(run.sizeBytes)} />
          <Field label={t("shaLabel")} value={run.sha256 ?? "—"} mono />
          <Field label={t("createdAtLabel")} value={formatDateTime(run.createdAt)} />
        </CardContent>
        {run.error && (
          <CardContent className="pt-0">
            <Alert variant="destructive">
              <AlertDescription>{run.error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("destinationsTitle")}</CardTitle>
          <CardDescription>{t("destinationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {run.destinations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDestinations")}</p>
          ) : (
            <ul className="space-y-2">
              {run.destinations.map((destination, index) => (
                <li key={`${destination.type}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{destination.type}</Badge>
                    <span className="break-all text-sm text-muted-foreground">
                      {destination.path ?? (destination.bucket && destination.key ? `${destination.bucket}/${destination.key}` : "—")}
                    </span>
                  </div>
                  <Badge variant={destination.ok ? "soft-success" : "soft-destructive"}>
                    {destination.ok ? t("destinationOk") : t("destinationFailed")}
                  </Badge>
                  {destination.error && <p className="w-full text-xs text-destructive">{destination.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("manifestTitle")}</CardTitle>
          <CardDescription>{t("manifestDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!run.manifest ? (
            <p className="text-sm text-muted-foreground">{t("noManifest")}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={t("manifestShaLabel")} value={run.manifest.sha256} mono />
                <Field label={t("manifestSizeLabel")} value={formatBytes(run.manifest.sizeBytes)} />
                <Field label={t("manifestDbDumpSizeLabel")} value={formatBytes(run.manifest.dbDumpSizeBytes)} />
                <Field label={t("manifestFilesTarSizeLabel")} value={formatBytes(run.manifest.filesTarSizeBytes)} />
                <Field label={t("manifestCreatedAtLabel")} value={formatDateTime(run.manifest.createdAt)} />
                <Field
                  label={t("manifestPassphraseCheckLabel")}
                  value={run.manifest.passphraseCheck ? t("passphraseCheckPresent") : t("passphraseCheckMissing")}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t("tableRowCountsLabel")}</p>
                {rowCountEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noRowCounts")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {rowCountEntries.map(([table, count]) => (
                          <tr key={table} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 text-muted-foreground">{table}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">{count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
