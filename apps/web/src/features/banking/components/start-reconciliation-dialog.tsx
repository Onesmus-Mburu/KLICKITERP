"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years";
import { usePeriodsForFiscalYear } from "@/features/accounting/hooks/use-periods";
import { useStartReconciliation } from "../hooks/use-reconciliation";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — `POST /banking/reconciliations`.
 * `accountId` reuses Part 1's own bank-account picker (`isActive: true`, no
 * `kind` filter — `ReconciliationService.start()` imposes none, confirmed by
 * reading it directly). `periodId` references Accounting's own `gl_period`
 * (Slice 17), which has no standalone flat picker anywhere in this codebase
 * — every existing consumer reaches a period via ITS OWN parent fiscal year
 * (`fiscal-years/[id]/page.tsx`'s own periods table). This dialog reuses that
 * exact same two-step shape: a fiscal-year `<Select>` first, then a period
 * `<Select>` populated by `usePeriodsForFiscalYear(fiscalYearId)` (Slice 17's
 * own hook, already ascending by `seq` server-side) once a year is chosen —
 * not a new picker component, this codebase's established "reuse the
 * existing per-year period list" shape.
 *
 * BR-BANK's `uq_bank_reconciliation_account_period` 409 (one reconciliation
 * per account+period, ever) is never pre-validated client-side — no
 * "does one already exist for this pair" cheap-check endpoint exists beyond
 * the general list route — surfaced verbatim via `ApiError.message` if hit
 * (see `reconciliation.api.ts`'s own doc comment).
 */
export function StartReconciliationDialog() {
  const t = useTranslations("banking.reconciliations.startDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState("");
  const [fiscalYearId, setFiscalYearId] = React.useState("");
  const [periodId, setPeriodId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const startMutation = useStartReconciliation();
  const accountsQuery = useBankAccounts({ isActive: true });
  const fiscalYearsQuery = useFiscalYears();
  const periodsQuery = usePeriodsForFiscalYear(fiscalYearId);

  function resetForm() {
    setAccountId("");
    setFiscalYearId("");
    setPeriodId("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const accountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );

  function handleFiscalYearChange(next: string) {
    setFiscalYearId(next);
    // Changing the year invalidates whatever period was picked from the OLD year's own list.
    setPeriodId("");
  }

  const canSubmit = !!accountId && !!periodId && !startMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await startMutation.mutateAsync({ accountId, periodId });
      setOpen(false);
      router.push(`/banking/reconciliations/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("accountLabel")}</Label>
            <Combobox
              items={accountItems}
              value={accountId}
              onChange={setAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("fiscalYearLabel")}</Label>
            <Select value={fiscalYearId} onValueChange={handleFiscalYearChange} disabled={fiscalYearsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectFiscalYearPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(fiscalYearsQuery.data ?? []).map((fy) => (
                  <SelectItem key={fy.id} value={fy.id}>
                    {fy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("periodLabel")}</Label>
            <Select value={periodId} onValueChange={setPeriodId} disabled={!fiscalYearId || periodsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={fiscalYearId ? t("selectPeriodPlaceholder") : t("chooseFiscalYearFirst")} />
              </SelectTrigger>
              <SelectContent>
                {(periodsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {t("periodOptionLabel", { seq: p.seq, startsOn: p.startsOn, endsOn: p.endsOn })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("periodHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {startMutation.isPending ? t("starting") : t("startButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
