"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { formatMoney, normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { useLoanSchedule, useRecordLoanRecovery } from "../hooks/use-loans";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the out-of-band manual
 * recovery-recording tool (`POST .../record-recovery`), an explicit
 * correction path — real payroll runs call `LoansService.recordRecovery()`
 * directly at commit time (a future part's own concern), not this endpoint.
 *
 * **The `periodKey` field is a real `<Select>` sourced from the loan's own
 * live schedule rows (`useLoanSchedule()`), never free-typed text** — per
 * this part's own task brief: the server requires an EXACT
 * `duePeriod === periodKey` match against an existing
 * `pyrl_loan_schedule` row (else a real `ValidationException`,
 * `` `pyrl_loan ${loanId} has no installment due in period ${periodKey}` ``),
 * and a free-text field would make that easy to get wrong through nothing
 * more than a typo (`"2026-8"` vs `"2026-08"`). Picking a period prefills
 * `amount` with that installment's own remaining due
 * (`principalDue + interestDue − recoveredAmount`, via `sumMoneyStrings()`'s
 * exact BigInt arithmetic, never `parseFloat`) as a convenience — genuinely
 * editable afterward, since this is a manual correction tool that may
 * legitimately record a different real amount (a partial recovery, or a
 * correction for an amount recorded elsewhere).
 *
 * Only rendered when `loan.status === "ACTIVE"` — the server rejects
 * `record-recovery` on any other status with a real `ValidationException`,
 * surfaced verbatim via `ApiError.message` if a race ever lets a stale
 * status slip through.
 */
export function RecordRecoveryDialog({ loan }: { loan: PyrlLoanResponseDto }) {
  const t = useTranslations("payroll.loans.recordRecoveryDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [periodKey, setPeriodKey] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const scheduleQuery = useLoanSchedule(loan.id, { enabled: open });
  const recoveryMutation = useRecordLoanRecovery();

  const sortedRows = React.useMemo(() => [...(scheduleQuery.data ?? [])].sort((a, b) => a.seq - b.seq), [scheduleQuery.data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPeriodKey("");
      setAmount("");
      setError(null);
    }
  }

  function handlePeriodChange(next: string) {
    setPeriodKey(next);
    const row = sortedRows.find((r) => r.duePeriod === next);
    if (row) {
      setAmount(sumMoneyStrings([row.principalDue, row.interestDue, `-${row.recoveredAmount}`]));
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const canSubmit = !!periodKey && normalizedAmount !== null && !recoveryMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || normalizedAmount === null) return;
    setError(null);
    try {
      await recoveryMutation.mutateAsync({ id: loan.id, dto: { periodKey, amount: normalizedAmount } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (loan.status !== "ACTIVE") return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Coins className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("periodLabel")}</Label>
            <Select value={periodKey} onValueChange={handlePeriodChange} disabled={scheduleQuery.isPending || sortedRows.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={scheduleQuery.isPending ? tCommon("loading") : t("periodPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {sortedRows.map((row) => (
                  <SelectItem key={row.id} value={row.duePeriod}>
                    {t("periodOptionLabel", {
                      seq: row.seq,
                      period: row.duePeriod,
                      amount: formatMoney(sumMoneyStrings([row.principalDue, row.interestDue])),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("periodHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} />
            <p className="text-xs text-muted-foreground">{t("amountHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {recoveryMutation.isPending ? t("recording") : t("recordButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
