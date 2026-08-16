"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import type { PyrlRunLinePaidVia } from "../api/payroll-runs.api";
import { usePayRun } from "../hooks/use-payroll-runs";

const PAY_METHODS: PyrlRunLinePaidVia[] = ["BANK", "MPESA_B2C", "CASH"];

/**
 * Phase 6 Slice 22 Part 7 (Payroll, Module 15) — `pay()`'s own dialog,
 * separate from `run-status-actions.tsx`'s shared generic `ConfirmKind`
 * dialog (which `commit`/`file` reuse unchanged) because `PayPyrlRunDto`
 * genuinely needs one real input: `{ method: "BANK" | "MPESA_B2C" | "CASH" }`.
 *
 * **Deliberately offers ONLY a method selector — no bank-account picker,
 * because there is genuinely nowhere for one to go.** Read directly, not
 * assumed: `resolveBankDisbursementAccount()`
 * (`gl-payroll-accounts.util.ts:100-118`) is a fixed CoA-code map —
 * `BANK` -> hardcoded account code `"1020"`, `CASH` -> `"1010"`,
 * `MPESA_B2C` -> the real `MPESA_CLEARING` control account via
 * `resolveControlAccount()`. `PayrollModule` doesn't even import
 * `BankingModule` (confirmed via `module-deps.json`), and the util's own doc
 * comment names this an interim forward gap itself — a REAL selected
 * `bank_account` row isn't wired anywhere on this route. `methodOnlyHint`
 * states this plainly rather than building a picker whose value the backend
 * would have nowhere to consume.
 *
 * Real `ValidationException`s (`pay()` only valid from `COMMITTED`; a
 * genuinely-zero-net-pay run) surface verbatim via `ApiError.message` on a
 * caught 4xx, same discipline as every other action in this feature.
 */
export function PayRunDialog({ runId, open, onOpenChange }: { runId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("payroll.runs.payDialog");
  const tCommon = useTranslations("common");
  const [method, setMethod] = React.useState<PyrlRunLinePaidVia>("BANK");
  const [error, setError] = React.useState<string | null>(null);
  const payMutation = usePayRun();

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await payMutation.mutateAsync({ id: runId, dto: { method } });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label required>{t("methodLabel")}</Label>
          <Select value={method} onValueChange={(value) => setMethod(value as PyrlRunLinePaidVia)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAY_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`methods.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("methodOnlyHint")}</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={payMutation.isPending}>
            <Send className="size-4" />
            {payMutation.isPending ? t("submitting") : t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
