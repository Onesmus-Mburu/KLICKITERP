"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { BACKUP_RUN_KINDS, type BackupRunKind, type BackupRunResponseDto } from "../api/backups.api";
import { useRunBackup } from "../hooks/use-backups";
import { formatBytes } from "../lib/format-bytes";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `POST /backups/run`,
 * `backups:run:create`. A REAL confirm dialog (not a direct-click button,
 * unlike `run-sweep-button.tsx`'s structurally similar sweep trigger) — this
 * is a genuinely heavy, slow operation (real `pg_dump` + files-bucket mirror
 * + AES-256-GCM encrypt + multi-destination fan-out), never instant, so the
 * confirm step's own copy sets that expectation explicitly rather than
 * looking like any other one-click action in this app.
 *
 * The mutation itself is synchronous (the controller always returns a
 * terminal `status: 'OK'|'FAILED'`, never `RUNNING`) — the dialog's own
 * "running" button state IS the real wait, no polling needed. Result is
 * shown inline (same `<Alert>` pattern `run-sweep-button.tsx` established,
 * no toast primitive exists anywhere in this codebase) rather than closing
 * the dialog immediately, so a `FAILED` run's own `error` message is visible
 * before the user has to go find it in the list.
 */
export function RunBackupDialog() {
  const t = useTranslations("backupsOps.runDialog");
  const tKinds = useTranslations("backupsOps.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<BackupRunKind>("MANUAL");
  const [result, setResult] = React.useState<BackupRunResponseDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const runMutation = useRunBackup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setError(null);
      setKind("MANUAL");
    }
  }

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      const run = await runMutation.mutateAsync(kind);
      setResult(run);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Play className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("slowOperationWarning")}</AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label required>{t("kindLabel")}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as BackupRunKind)} disabled={runMutation.isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKUP_RUN_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {tKinds(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t(`kindHelp.${kind}`)}</p>
        </div>

        {result && (
          <Alert variant={result.status === "OK" ? "success" : "destructive"}>
            <AlertDescription className="space-y-1">
              <p className="font-medium">{result.status === "OK" ? t("resultOk") : t("resultFailed")}</p>
              {result.status === "OK" && (
                <p className="text-xs">{t("resultSummary", { size: formatBytes(result.sizeBytes), sha: result.sha256?.slice(0, 16) ?? "—" })}</p>
              )}
              {result.status === "FAILED" && result.error && <p className="text-xs">{result.error}</p>}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={runMutation.isPending}>
            {tCommon("close")}
          </Button>
          <Button type="button" onClick={() => void handleRun()} disabled={runMutation.isPending}>
            {runMutation.isPending ? t("running") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
