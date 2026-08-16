"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CircleCheckBig } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useSettleLoanEarly } from "../hooks/use-loans";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the out-of-band lump-sum
 * early-settlement action (`POST .../settle-early`,
 * `SettleLoanEarlyDto: { settlementDate: 'YYYY-MM-DD' }`).
 *
 * **The confirm copy is explicit that this is a lump-sum payoff, not a
 * partial payment** — `settleEarly()` cancels every schedule installment due
 * AFTER `settlementDate`'s own month that has NOT yet had any recovery
 * recorded (zeroing `principalDue`/`interestDue` on those rows only — rows
 * already recovered against are left untouched), then sets `balance = 0` and
 * `status = SETTLED` UNCONDITIONALLY regardless of what the real remaining
 * balance actually was (`loans.service.ts:289-321`). A user who reaches for
 * this expecting a "record one more real payment and let the balance land
 * near zero naturally" behavior would be surprised by this — the dialog says
 * so plainly before the action is confirmed.
 *
 * Only rendered when `loan.status === "ACTIVE"` — the server rejects
 * `settle-early` on any other status with a real `ValidationException`,
 * surfaced verbatim via `ApiError.message` if a race ever lets a stale
 * status slip through.
 */
export function SettleEarlyDialog({ loan }: { loan: PyrlLoanResponseDto }) {
  const t = useTranslations("payroll.loans.settleEarlyDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [settlementDate, setSettlementDate] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const settleMutation = useSettleLoanEarly();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSettlementDate(todayIsoDate());
      setError(null);
    }
  }

  async function handleSubmit() {
    if (!settlementDate || settleMutation.isPending) return;
    setError(null);
    try {
      await settleMutation.mutateAsync({ id: loan.id, dto: { settlementDate } });
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
          <CircleCheckBig className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("lumpSumNotice")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("settlementDateLabel")}</Label>
          <Input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("settlementDateHint")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleSubmit()} disabled={!settlementDate || settleMutation.isPending}>
            {settleMutation.isPending ? t("settling") : t("settleButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
