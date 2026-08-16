"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlOneoffDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { normalizeMoneyInput } from "@/lib/money";
import { useCreateOneoff } from "../hooks/use-oneoffs";
import type { PyrlOneoffKind } from "../api/oneoffs.api";
import { ComponentCombobox } from "./component-combobox";
import { EmployeeCombobox } from "./employee-combobox";

const ONEOFF_KINDS: PyrlOneoffKind[] = ["EARNING", "DEDUCTION"];

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — a one-off earning/deduction
 * for a single employee, always scoped to the RUN's own `periodKey` (a fixed
 * prop, shown read-only — not a free-typed field, since this dialog is
 * always opened from `run-oneoffs-panel.tsx`, itself already scoped to one
 * specific run's period; per this part's own task brief, "the one-offs panel
 * embedded on the run detail page, scoped to that run's own periodKey").
 * Employee/component pickers reuse Part 3's/Part 1-2's own
 * `<EmployeeCombobox>`/`<ComponentCombobox>` directly, per the task brief's
 * explicit instruction.
 *
 * **DB-unique on `(employeeId, periodKey, componentId)`** — this part's own
 * opportunistic backend fix (`OneoffsService.create()`, matching
 * `ComponentsService`'s/`SalaryStructuresService`'s own `create()` fixes
 * from Parts 1/2) translates a raw `23505` unique-violation into a real
 * `ConflictException`, surfaced verbatim via `ApiError.message` here — no
 * client-side duplicate pre-check is attempted, the DB is the source of
 * truth for this constraint, matching every other unique constraint in this
 * app.
 */
export function CreateOneoffDialog({ periodKey }: { periodKey: string }) {
  const t = useTranslations("payroll.oneoffs.createDialog");
  const tKinds = useTranslations("payroll.oneoffs.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState("");
  const [kind, setKind] = React.useState<PyrlOneoffKind>("EARNING");
  const [componentId, setComponentId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateOneoff();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEmployeeId("");
      setKind("EARNING");
      setComponentId("");
      setAmount("");
      setReason("");
      setError(null);
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const canSubmit = !!employeeId && !!componentId && normalizedAmount !== null && reason.trim().length > 0 && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || normalizedAmount === null) return;
    setError(null);
    const dto: CreatePyrlOneoffDto = {
      employeeId,
      periodKey,
      kind,
      componentId,
      amount: normalizedAmount,
      reason: reason.trim(),
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
        <Button type="button" variant="outline" size="sm">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { period: periodKey })}</DialogDescription>
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
            <Label required>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PyrlOneoffKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ONEOFF_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {tKinds(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("componentLabel")}</Label>
            <ComponentCombobox
              value={componentId}
              onChange={setComponentId}
              placeholder={t("componentPlaceholder")}
              searchPlaceholder={t("componentSearchPlaceholder")}
              emptyText={t("componentEmptyText")}
              loadingText={t("loadingComponents")}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("reasonLabel")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
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
