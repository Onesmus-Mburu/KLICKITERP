"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { RECEIPT_SPLIT_METHODS } from "../constants";
import { useCloseSession } from "../hooks/use-sessions";
import { isVarianceExceededError } from "../lib/errors";
import type { CashierSession } from "../types";

/**
 * No endpoint previews expected-vs-counted before closing (confirmed by
 * reading `cashier-sessions.controller.ts`/`.service.ts` directly —
 * `closeSession()` computes `expectedTotals` internally and only reveals it
 * as part of the SAVED session row afterward, never ahead of time). So this
 * dialog: collect the physically-counted amount per method, attempt close;
 * on the specific BR-PAY-05 variance-exceeded error
 * (`isVarianceExceededError`), reveal the supervisor-override sub-form IN
 * PLACE and let the cashier resubmit with it filled in — the correct,
 * intended shape given the real backend, not a workaround.
 *
 * `payments.session_variance_tolerance` defaults to `"0.00"` when
 * unconfigured (confirmed by reading `cashier-sessions.service.ts`'s
 * `closeSession()`), so the override path is expected to be the NORMAL case
 * in an unconfigured dev environment, not a rare edge case.
 */
export function SessionCloseDialog({ session, trigger }: { session: CashierSession; trigger?: React.ReactNode }) {
  const t = useTranslations("payments.sessionClose");
  const tMethod = useTranslations("payments.splitMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [counted, setCounted] = React.useState<Record<string, string>>({});
  const [needsApproval, setNeedsApproval] = React.useState(false);
  const [supervisorId, setSupervisorId] = React.useState("");
  const [varianceReason, setVarianceReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const closeMutation = useCloseSession(session.id);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCounted({});
      setNeedsApproval(false);
      setSupervisorId("");
      setVarianceReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    const countedPayload: Record<string, string> = {};
    for (const method of RECEIPT_SPLIT_METHODS) {
      const raw = counted[method];
      countedPayload[method] = raw && raw.trim() !== "" ? raw : "0.0000";
    }
    if (needsApproval && (!supervisorId.trim() || !varianceReason.trim())) {
      setError(t("approvalRequiredHint"));
      return;
    }
    try {
      await closeMutation.mutateAsync({
        counted: countedPayload,
        approval: needsApproval ? { supervisorId: supervisorId.trim(), varianceReason: varianceReason.trim() } : undefined,
      });
      setOpen(false);
    } catch (err) {
      if (isVarianceExceededError(err)) {
        setNeedsApproval(true);
        setError(t("varianceExceededError"));
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button type="button" variant="outline">{t("trigger")}</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant={needsApproval ? "warning" : "destructive"}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {RECEIPT_SPLIT_METHODS.map((method) => (
            <div key={method} className="grid grid-cols-[1fr_140px] items-center gap-3">
              <Label>{tMethod(method)}</Label>
              <MoneyInput value={counted[method] ?? ""} onValueChange={(v) => setCounted((c) => ({ ...c, [method]: v ?? "" }))} currency={DEFAULT_CURRENCY} />
            </div>
          ))}
        </div>

        {needsApproval && (
          <div className="space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-3">
            <p className="text-sm font-medium text-warning-foreground">{t("approvalSectionTitle")}</p>
            <div className="space-y-1.5">
              <Label required>{t("supervisorId")}</Label>
              <Input value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} placeholder={t("supervisorIdPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("varianceReason")}</Label>
              <Input value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={closeMutation.isPending}>
            {closeMutation.isPending ? t("closing") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
