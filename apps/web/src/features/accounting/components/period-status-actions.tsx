"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { PeriodResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useHardClosePeriod, useOpenPeriod, useSoftClosePeriod } from "../hooks/use-periods";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — one
 * button per transition (`open`/`soft-close`/`hard-close`), matching
 * `features/users/components/user-status-action-button.tsx`'s own "a fixed
 * set of transition endpoints, not a single `<Select>`" reasoning (3
 * separate no-body verb endpoints, no PATCH body to build from a
 * selection). Open/Soft-Close are direct-click (both reversible in either
 * direction per `FiscalYearsController`'s own doc comments — "Legal from
 * OPEN or SOFT_CLOSED" / "Legal unless HARD_CLOSED"); Hard Close gets a
 * confirm dialog with an explicit "final, cannot be undone" warning,
 * mirroring `UserStatusActions`' own `destructive`-transition treatment for
 * `DEACTIVATED` (the one other genuinely terminal state transition in this
 * codebase).
 *
 * **Hard Close stays disabled (with a native `title` tooltip — no
 * `@radix-ui/react-tooltip`/dedicated tooltip primitive exists anywhere in
 * this codebase, confirmed by grep before writing this; a plain `title`
 * attribute on the wrapping `<span>` matches
 * `features/branding/components/file-picker.tsx`'s own established
 * precedent for a lightweight native hover hint) until `status ===
 * "SOFT_CLOSED"` — but the mutation itself still runs for real if invoked
 * anyway (a race condition, or a direct API call bypassing this UI) and a
 * real 422 is caught and rendered inline, never silently swallowed.**
 */
export function PeriodStatusActions({ period, fiscalYearId }: { period: PeriodResponseDto; fiscalYearId: string }) {
  const t = useTranslations("accounting.periods.actions");
  const tCommon = useTranslations("common");
  const [hardCloseOpen, setHardCloseOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const openMutation = useOpenPeriod();
  const softCloseMutation = useSoftClosePeriod();
  const hardCloseMutation = useHardClosePeriod();

  async function handleOpen() {
    setError(null);
    try {
      await openMutation.mutateAsync({ id: period.id, fiscalYearId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleSoftClose() {
    setError(null);
    try {
      await softCloseMutation.mutateAsync({ id: period.id, fiscalYearId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleHardClose() {
    setError(null);
    try {
      await hardCloseMutation.mutateAsync({ id: period.id, fiscalYearId });
      setHardCloseOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canReopen = period.status === "SOFT_CLOSED";
  const canSoftClose = period.status === "OPEN";
  const canHardClose = period.status === "SOFT_CLOSED";
  const anyPending = openMutation.isPending || softCloseMutation.isPending || hardCloseMutation.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!canReopen || anyPending} onClick={() => void handleOpen()}>
          {t("open")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canSoftClose || anyPending} onClick={() => void handleSoftClose()}>
          {t("softClose")}
        </Button>
        <span title={canHardClose ? undefined : t("hardCloseHint")}>
          <Dialog open={hardCloseOpen} onOpenChange={setHardCloseOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="destructive" disabled={!canHardClose || anyPending}>
                {t("hardClose")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("hardCloseConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("hardCloseConfirmDescription", { seq: period.seq })}</DialogDescription>
              </DialogHeader>
              <Alert variant="destructive">
                <AlertDescription>{t("hardClosePermanentWarning")}</AlertDescription>
              </Alert>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setHardCloseOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleHardClose()} disabled={hardCloseMutation.isPending}>
                  {hardCloseMutation.isPending ? t("processing") : t("hardCloseConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </span>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
