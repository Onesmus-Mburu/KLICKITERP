"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlLoanDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { normalizeMoneyInput } from "@/lib/money";
import { useCreateLoan } from "../hooks/use-loans";
import type { PyrlLoanRateKind } from "../api/loans.api";
import { EmployeeCombobox } from "./employee-combobox";

const RATE_KINDS: PyrlLoanRateKind[] = ["FLAT", "REDUCING"];

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the staff loan application
 * form: employee (a real `<EmployeeCombobox>` field, per this part's own
 * task brief instruction to reuse Part 3's picker directly here — seeded
 * from `defaultEmployeeId` when the caller already has one selected, e.g.
 * `/payroll/loans/page.tsx`'s own employee-scoped list, but always genuinely
 * editable, so this dialog stays usable from anywhere) + `principal` (a real
 * `<MoneyInput>`) + `rate` + `rateKind` + `termMonths`.
 *
 * **`rate` is NOT a `<MoneyInput>`** — it's an interest RATE (a decimal
 * fraction), not a currency amount, and `MoneyInput`'s own "KES" prefix
 * would be actively misleading on this field. It IS, however, validated
 * against the exact same shape `principal`/`amount` fields already use
 * (`DECIMAL_PATTERN` server-side, `^-?\d+(\.\d+)?$` — confirmed by reading
 * `loan.dto.ts` directly), so `lib/money.ts`'s own `normalizeMoneyInput()`
 * is reused here for validation/normalization — a DIFFERENT judgment call
 * from `statutory-params-form.tsx`'s own decision NOT to reuse
 * `lib/percent.ts` for its rate fields (Part 4): that field is a plain JS
 * `number` stored directly as a fraction with no decimal-string contract at
 * all, a genuinely different underlying type, while THIS `rate` field is
 * exactly the same decimal-string-matching-`DECIMAL_PATTERN` shape
 * `normalizeMoneyInput()` already validates correctly for `principal` — so
 * reusing it here is the right call for the same reason avoiding it there
 * was.
 *
 * **The rate hint text is load-bearing, not decorative** — `rate` is the
 * ANNUAL rate as a decimal FRACTION (e.g. `"0.145"` for 14.5%/year), never a
 * monthly rate, never a percentage written as a whole number. A payroll
 * admin misreading this field (entering `"14.5"` thinking it means 14.5%, or
 * entering a monthly-equivalent figure) would produce a loan schedule wildly
 * wrong in the employee's favor or against them — this hint (and its
 * Swahili/French translations) was written and reviewed with that real
 * financial-safety stake in mind, per this part's own task brief.
 *
 * **No client-side schedule preview is attempted anywhere in this dialog**
 * — the real schedule only exists after a real `decide(approved: true)`
 * call server-side (`onApprovalDecided()`, `loans.service.ts:236-258`);
 * hand-rolling a preview calculator here risks silently drifting from the
 * server's own real FLAT/REDUCING amortization math. `noPreviewHint` sets
 * this expectation honestly instead.
 *
 * Server-side validation surfaces verbatim via `ApiError.message` on a
 * caught 4xx — `principal` must be positive, `termMonths` a positive
 * integer (`loans.service.ts:186-191`'s own exact `ValidationException`
 * text), never paraphrased here.
 */
export function CreateLoanDialog({ defaultEmployeeId }: { defaultEmployeeId?: string }) {
  const t = useTranslations("payroll.loans.createDialog");
  const tRateKinds = useTranslations("payroll.loans.rateKinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState(defaultEmployeeId ?? "");
  const [principal, setPrincipal] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [rateKind, setRateKind] = React.useState<PyrlLoanRateKind>("FLAT");
  const [termMonths, setTermMonths] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateLoan();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEmployeeId(defaultEmployeeId ?? "");
      setPrincipal("");
      setRate("");
      setRateKind("FLAT");
      setTermMonths("");
      setError(null);
    }
  }

  const normalizedPrincipal = normalizeMoneyInput(principal);
  const normalizedRate = normalizeMoneyInput(rate);
  const termMonthsNumber = Number(termMonths);
  const canSubmit =
    !!employeeId &&
    normalizedPrincipal !== null &&
    normalizedRate !== null &&
    Number.isInteger(termMonthsNumber) &&
    termMonthsNumber > 0 &&
    !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || normalizedPrincipal === null || normalizedRate === null) return;
    setError(null);
    const dto: CreatePyrlLoanDto = {
      employeeId,
      principal: normalizedPrincipal,
      rate: normalizedRate,
      rateKind,
      termMonths: termMonthsNumber,
    };
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
            <Label required>{t("employeeLabel")}</Label>
            <EmployeeCombobox
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={t("employeePlaceholder")}
              searchPlaceholder={t("employeeSearchPlaceholder")}
              emptyText={t("employeeEmptyText")}
              loadingText={t("loadingEmployees")}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("principalLabel")}</Label>
            <MoneyInput value={principal} onValueChange={(v) => setPrincipal(v ?? "")} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("rateLabel")}</Label>
              <Input inputMode="decimal" placeholder="0.145" value={rate} onChange={(e) => setRate(e.target.value)} />
              <p className="text-xs font-medium text-warning-foreground">{t("rateHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("termMonthsLabel")}</Label>
              <Input type="number" min={1} step={1} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("rateKindLabel")}</Label>
            <Select value={rateKind} onValueChange={(v) => setRateKind(v as PyrlLoanRateKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {tRateKinds(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{rateKind === "FLAT" ? t("flatHint") : t("reducingHint")}</p>
          </div>

          <Alert>
            <AlertDescription>{t("noPreviewHint")}</AlertDescription>
          </Alert>
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
