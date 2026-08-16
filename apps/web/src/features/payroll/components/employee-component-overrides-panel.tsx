"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Plus, Square } from "lucide-react";
import type { AddEmployeeComponentDto, EndEmployeeComponentDto, PyrlEmployeeComponentResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useComponents } from "../hooks/use-components";
import { useAddEmployeeComponent, useEmployeeComponents, useEndEmployeeComponent } from "../hooks/use-employee-components";
import { ComponentCombobox } from "./component-combobox";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — an employee's
 * `pyrl_employee_component` history (personal, per-employee amounts against
 * Part 1's own component catalogue) plus "Add override" and a PER-ROW "End
 * override" action (unlike the assignment panel's single current row, an
 * employee can hold several DIFFERENT components concurrently — only two
 * overlapping ranges for the SAME `componentId` conflict, scoped by
 * `excl_pyrl_employee_component_no_overlap` on `(employeeId, componentId)`,
 * confirmed by reading `EmployeeComponentsService` directly — so "which one
 * to end" is genuinely per-row here, not a single panel-level action).
 *
 * **THE MOST IMPORTANT THING ABOUT THIS PANEL — read before touching this
 * file's copy.** Despite this entity's own name ("component override"),
 * confirmed directly by reading `payroll-runs.service.ts:365-383`: at actual
 * payroll-compute time, an employee's assigned structure's own lines AND
 * their active rows here are BOTH independently summed into the SAME
 * `componentLines` array, with ZERO deduplication by `componentId`. If an
 * employee's structure already has a `HOUSE_ALLOWANCE` line and this panel
 * also shows an active `HOUSE_ALLOWANCE` row for them, a real payroll run
 * pays BOTH amounts — this does NOT replace/win over the structure's own
 * line for the same component the way "override" would normally suggest.
 * `additiveWarning` below states this plainly, in a persistently-visible
 * `<Alert variant="warning">` right under the section header (not buried in
 * a tooltip or a dialog a user might skip past) — a payroll administrator
 * who misreads this as a true override could cause a real double-payment in
 * production. The create-dialog's own `description` repeats the same
 * warning in miniature immediately above its form fields, so the message is
 * visible again at the exact moment of the risky action.
 */
export function EmployeeComponentOverridesPanel({ employeeId }: { employeeId: string }) {
  const t = useTranslations("payroll.employees.componentOverridesPanel");
  const overridesQuery = useEmployeeComponents(employeeId);
  const componentsQuery = useComponents();

  const componentLabelById = React.useMemo(
    () => new Map((componentsQuery.data ?? []).map((c) => [c.id, `${c.code} — ${c.name}`])),
    [componentsQuery.data],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("sectionHint")}</p>
      </div>

      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertDescription>{t("additiveWarning")}</AlertDescription>
      </Alert>

      <QueryBoundary query={overridesQuery} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("componentColumn")}</TableHead>
                  <TableHead>{t("amountColumn")}</TableHead>
                  <TableHead>{t("effectiveFromColumn")}</TableHead>
                  <TableHead>{t("effectiveToColumn")}</TableHead>
                  <TableHead>{t("statusColumn")}</TableHead>
                  <TableHead className="w-20">{t("actionsColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows]
                  .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
                  .map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{componentLabelById.get(row.componentId) ?? row.componentId}</TableCell>
                      <TableCell>{formatMoney(row.amount)}</TableCell>
                      <TableCell>{row.effectiveFrom}</TableCell>
                      <TableCell>{row.effectiveTo ?? "—"}</TableCell>
                      <TableCell>
                        {row.effectiveTo === null ? (
                          <Badge variant="soft-success">{t("statusCurrent")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("statusEnded")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.effectiveTo === null && (
                          <EndOverrideDialog
                            employeeId={employeeId}
                            row={row}
                            componentLabel={componentLabelById.get(row.componentId) ?? row.componentId}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>

      <div>
        <AddOverrideDialog employeeId={employeeId} />
      </div>
    </div>
  );
}

function AddOverrideDialog({ employeeId }: { employeeId: string }) {
  const t = useTranslations("payroll.employees.componentOverridesPanel.addDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [componentId, setComponentId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState(todayIsoDate());
  const [effectiveTo, setEffectiveTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addMutation = useAddEmployeeComponent();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setComponentId("");
      setAmount("");
      setEffectiveFrom(todayIsoDate());
      setEffectiveTo("");
      setError(null);
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const canSubmit = !!componentId && normalizedAmount !== null && !!effectiveFrom && !addMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: AddEmployeeComponentDto = {
      employeeId,
      componentId,
      amount: normalizedAmount ?? "0",
      effectiveFrom,
    };
    if (effectiveTo) dto.effectiveTo = effectiveTo;
    try {
      await addMutation.mutateAsync(dto);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
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

        <div className="space-y-3">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("effectiveFromLabel")}</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("effectiveToLabel")}</Label>
              <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("effectiveToHint")}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {addMutation.isPending ? t("adding") : t("addButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndOverrideDialog({
  employeeId,
  row,
  componentLabel,
}: {
  employeeId: string;
  row: PyrlEmployeeComponentResponseDto;
  componentLabel: string;
}) {
  const t = useTranslations("payroll.employees.componentOverridesPanel.endDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [effectiveTo, setEffectiveTo] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const endMutation = useEndEmployeeComponent();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEffectiveTo(todayIsoDate());
      setError(null);
    }
  }

  async function handleSubmit() {
    if (!effectiveTo || endMutation.isPending) return;
    setError(null);
    const dto: EndEmployeeComponentDto = { componentId: row.componentId, effectiveTo };
    try {
      await endMutation.mutateAsync({ employeeId, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t("trigger")}>
          <Square className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { component: componentLabel })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("effectiveToLabel")}</Label>
          <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!effectiveTo || endMutation.isPending}>
            {endMutation.isPending ? t("ending") : t("endButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
