"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import type { PruneBackupsResponse } from "../api/backups.api";
import { usePruneBackups } from "../hooks/use-backups";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `POST /backups/prune`,
 * `backups:retention:prune`. No body. A real, permanent deletion for
 * whatever gets pruned (both destination files/objects AND the
 * `bkp_backup_run` rows themselves) — mirrors `period-status-actions.tsx`'s
 * own Hard-Close confirm-dialog treatment for the one other genuinely
 * destructive, irreversible action in this codebase, not the direct-click
 * `run-sweep-button.tsx` pattern.
 *
 * The confirm copy states the real 7 daily / 4 weekly / 12 monthly GFS
 * policy plainly, and that it applies ONLY to `kind='SCHEDULED'` runs —
 * `MANUAL`/`PRE_UPDATE` runs are deliberately never auto-pruned (confirmed
 * by reading `BackupOrchestratorService.pruneOldBackups()`/
 * `retention.util.ts` directly), so a caller worried about losing a manual
 * backup they just ran can see, in the dialog itself, that this action
 * cannot touch it.
 */
export function PruneButton() {
  const t = useTranslations("backupsOps.pruneDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<PruneBackupsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const pruneMutation = usePruneBackups();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setError(null);
    }
  }

  async function handlePrune() {
    setError(null);
    setResult(null);
    try {
      const outcome = await pruneMutation.mutateAsync();
      setResult(outcome);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Trash2 className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertDescription className="space-y-1">
            <p>{t("permanentWarning")}</p>
            <p className="text-xs">{t("neverTouchesWarning")}</p>
          </AlertDescription>
        </Alert>

        {result && (
          <Alert variant="success">
            <AlertDescription>{result.prunedCount === 0 ? t("resultNone") : t("resultCount", { count: result.prunedCount })}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pruneMutation.isPending}>
            {tCommon("close")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handlePrune()} disabled={pruneMutation.isPending}>
            {pruneMutation.isPending ? t("running") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
