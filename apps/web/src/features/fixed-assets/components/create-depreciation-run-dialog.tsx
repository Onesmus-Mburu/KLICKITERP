"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years";
import { usePeriodsForFiscalYear } from "@/features/accounting/hooks/use-periods";
import { useCreateDepreciationRun } from "../hooks/use-depreciation-runs";

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — `POST
 * /fixed-assets/depreciation-runs`. `periodId` references Accounting's own
 * `gl_period` — there is no bulk "list every period across every fiscal
 * year" endpoint anywhere in this codebase (confirmed: `GET
 * /accounting/periods` doesn't exist, only `GET
 * /accounting/fiscal-years/{id}/periods`), so this dialog reuses Banking
 * Slice 21 Part 4's exact two-step cascade shape
 * (`start-reconciliation-dialog.tsx`): a fiscal-year `<Select>` first, then
 * a period `<Select>` populated by `usePeriodsForFiscalYear(fiscalYearId)`
 * once a year is chosen — reusing Accounting's own `useFiscalYears()`/
 * `usePeriodsForFiscalYear()` hooks DIRECTLY, cross-feature-folder, per this
 * part's own task brief (an established, approved pattern in this codebase,
 * not a new one invented here).
 *
 * **Only 4 real lifecycle steps, not 5** — this single call creates the run
 * at `DRAFT` AND computes every eligible active asset's line in the SAME
 * request (no separate `compute` step, unlike Payroll's own run engine) —
 * `description` says so plainly.
 *
 * **`uq_fa_depreciation_run_period_id` (at most one run per period, ever) is
 * never pre-validated client-side** — no cheap "does one already exist for
 * this period" endpoint exists beyond the general list route — a real 409
 * surfaces verbatim via `ApiError.message` if hit, see
 * `depreciation-runs.api.ts`'s own doc comment.
 *
 * **Disabled immediately on click, no double-submit** — `canSubmit` already
 * folds in `!createMutation.isPending`, the same standard disable-while-
 * pending pattern every dialog in this codebase already uses. A genuine
 * TOCTOU race exists between the server's own pre-check and insert under
 * concurrent submission (two staff creating a run for the same period at
 * the exact same instant) — a documented, low-likelihood edge case, not
 * something this dialog builds special handling for beyond that standard
 * pattern; a loser of that race simply sees the real 409 above.
 */
export function CreateDepreciationRunDialog() {
  const t = useTranslations("fixedAssets.depreciationRuns.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [fiscalYearId, setFiscalYearId] = React.useState("");
  const [periodId, setPeriodId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateDepreciationRun();
  const fiscalYearsQuery = useFiscalYears();
  const periodsQuery = usePeriodsForFiscalYear(fiscalYearId);

  function resetForm() {
    setFiscalYearId("");
    setPeriodId("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handleFiscalYearChange(next: string) {
    setFiscalYearId(next);
    // Changing the year invalidates whatever period was picked from the OLD year's own list.
    setPeriodId("");
  }

  const canSubmit = !!periodId && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await createMutation.mutateAsync({ periodId });
      setOpen(false);
      router.push(`/fixed-assets/depreciation-runs/${created.id}`);
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
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
