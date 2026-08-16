"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ShieldQuestion } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import type { BackupRunStatus, RestoreRunResponseDto, VerifyRestoreTarget } from "../api/backups.api";
import { useVerifyRestore } from "../hooks/use-backups";

const EMPTY_TARGET: VerifyRestoreTarget = { host: "", port: 5432, database: "", user: "", password: "" };

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `POST /backups/:id/verify-restore`,
 * `backups:restore:verify`. The 5-field target-connection form
 * (host/port/database/user/password — `password` genuinely masked,
 * `type="password"`, same convention `mpesa-config-form.tsx` already
 * established for this codebase's other credential inputs).
 *
 * **Honest scope note, surfaced directly in the dialog's own copy**: per
 * `BackupsController`'s own `@ApiOperation` summary and
 * `RestoreVerificationService`'s own doc comment, this endpoint requires an
 * ALREADY-REACHABLE target Postgres connection — provisioning the target
 * itself (a scratch database/container) is explicitly out of this
 * endpoint's, and therefore this form's, scope. The help text sets that
 * expectation rather than implying this button spins up infrastructure.
 *
 * Disabled with a native `title` hint (no tooltip primitive exists anywhere
 * in this codebase, same precedent `period-status-actions.tsx`'s own
 * Hard-Close button already established) unless the run's own
 * `status==='OK'` — the server rejects any other status with a real
 * `ValidationException`, confirmed by reading `RestoreVerificationService`
 * directly, so this mirrors that constraint client-side rather than letting
 * a doomed request round-trip.
 */
export function VerifyRestoreDialog({ runId, runStatus }: { runId: string; runStatus: BackupRunStatus }) {
  const t = useTranslations("backupsOps.verifyRestoreDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<VerifyRestoreTarget>(EMPTY_TARGET);
  const [result, setResult] = React.useState<RestoreRunResponseDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const verifyMutation = useVerifyRestore(runId);

  function set<K extends keyof VerifyRestoreTarget>(key: K, value: VerifyRestoreTarget[K]) {
    setTarget((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setError(null);
      setTarget(EMPTY_TARGET);
    }
  }

  const isComplete = !!(target.host && target.port && target.database && target.user && target.password);

  async function handleVerify() {
    setError(null);
    setResult(null);
    try {
      const outcome = await verifyMutation.mutateAsync(target);
      setResult(outcome);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (runStatus !== "OK") {
    return (
      <span title={t("notEligibleHint")}>
        <Button type="button" variant="outline" disabled>
          <ShieldQuestion className="size-4" />
          {t("trigger")}
        </Button>
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ShieldQuestion className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("scopeNote")}</AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("hostLabel")}</Label>
            <Input value={target.host} onChange={(e) => set("host", e.target.value)} disabled={verifyMutation.isPending} placeholder={t("hostPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("portLabel")}</Label>
            <Input
              type="number"
              min={1}
              max={65535}
              value={target.port}
              onChange={(e) => set("port", Number(e.target.value))}
              disabled={verifyMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("databaseLabel")}</Label>
            <Input
              value={target.database}
              onChange={(e) => set("database", e.target.value)}
              disabled={verifyMutation.isPending}
              placeholder={t("databasePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("userLabel")}</Label>
            <Input value={target.user} onChange={(e) => set("user", e.target.value)} disabled={verifyMutation.isPending} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label required>{t("passwordLabel")}</Label>
            <Input type="password" value={target.password} onChange={(e) => set("password", e.target.value)} disabled={verifyMutation.isPending} />
          </div>
        </div>

        {result && (
          <Alert variant={result.status === "OK" ? "success" : "destructive"}>
            <AlertDescription className="space-y-1">
              <p className="font-medium">{result.status === "OK" ? t("resultOk") : t("resultFailed")}</p>
              {result.notes && <p className="text-xs">{result.notes}</p>}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={verifyMutation.isPending}>
            {tCommon("close")}
          </Button>
          <Button type="button" onClick={() => void handleVerify()} disabled={verifyMutation.isPending || !isComplete}>
            {verifyMutation.isPending ? t("running") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
