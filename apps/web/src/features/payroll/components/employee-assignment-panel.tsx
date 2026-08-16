"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Square } from "lucide-react";
import type { AssignEmployeeDto, EndAssignmentDto, PyrlEmployeeAssignmentResponseDto } from "@klickit/contracts";
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
import { useSalaryStructures } from "../hooks/use-salary-structures";
import { useAssignEmployee, useEmployeeAssignments, useEndEmployeeAssignment } from "../hooks/use-employee-assignments";
import { SalaryStructureCombobox } from "./salary-structure-combobox";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 3 (Payroll, Module 15) — an employee's
 * `pyrl_employee_assignment` history (which salary structure they've been
 * assigned to, and their own `basicPay` snapshot for each period) plus the
 * two real mutating actions the backend genuinely supports: "New assignment"
 * and "End current assignment." Embedded on `app/(erp)/payroll/employees/[id]/page.tsx`
 * as its own section — there is no standalone route for this, and none is
 * added: `EmployeeAssignmentsController` has no global "list every
 * assignment across every employee" endpoint (every route requires
 * `employeeId`), so a list-all screen would have nothing real to back it —
 * confirmed by reading the controller directly, matching this part's own
 * task brief.
 *
 * **`basicPay` is a SNAPSHOT captured at assignment time — completely
 * independent of the structure's own lines.** It's the real figure any
 * PERCENT_OF_BASIC line on the assigned structure multiplies against for
 * THIS employee specifically (`resolveComponentAmount()`,
 * `salary-structures.service.ts:44-57`, confirmed by reading it directly) —
 * `newAssignmentDialog.basicPayHint` below states this plainly so a user
 * doesn't assume it's read from the structure itself.
 *
 * **A genuine 2-call workflow to change structure/basic-pay — not a single
 * "replace" button**: `EmployeeAssignmentsController` has no direct replace
 * endpoint. Changing what an employee is assigned to requires (1) ending the
 * currently open-ended row via `POST .../end` (`useEndEmployeeAssignment()`),
 * then (2) creating the new one via `POST .../` (`useAssignEmployee()`) with
 * an `effectiveFrom` on/after the old row's `effectiveTo` — the DB's own
 * `excl_pyrl_employee_assignment_no_overlap` EXCLUDE constraint is the real
 * enforcement of that ordering, not a client-side date nudge (a same-day
 * `effectiveFrom`/`effectiveTo` boundary is accepted by the constraint; see
 * `employee-assignments.service.ts`'s own doc comment). "End current
 * assignment" below is a separate action from "New assignment," only enabled
 * while an open-ended row (`effectiveTo === null`) actually exists in the
 * history — it does not attempt to fake a single combined call.
 *
 * **The overlap `409` is surfaced verbatim** (`` `pyrl_employee_assignment:
 * overlapping assignment period for employee ${employeeId}` ``, from the
 * DB's own `23P01` exclusion_violation, translated by
 * `EmployeeAssignmentsService.assign()` — see `employee-assignments.api.ts`'s
 * own doc comment) via `ApiError.message` on a caught conflict in the "New
 * assignment" dialog below, not a generic error.
 */
export function EmployeeAssignmentPanel({ employeeId }: { employeeId: string }) {
  const t = useTranslations("payroll.employees.assignmentPanel");
  const assignmentsQuery = useEmployeeAssignments(employeeId);
  const structuresQuery = useSalaryStructures();

  const structureLabelById = React.useMemo(
    () => new Map((structuresQuery.data ?? []).map((s) => [s.id, s.grade ? `${s.name} (${s.grade})` : s.name])),
    [structuresQuery.data],
  );

  const openAssignment = (assignmentsQuery.data ?? []).find((row) => row.effectiveTo === null) ?? null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("sectionHint")}</p>
      </div>

      <QueryBoundary query={assignmentsQuery} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("structureColumn")}</TableHead>
                  <TableHead>{t("basicPayColumn")}</TableHead>
                  <TableHead>{t("effectiveFromColumn")}</TableHead>
                  <TableHead>{t("effectiveToColumn")}</TableHead>
                  <TableHead>{t("statusColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows]
                  .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
                  .map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{structureLabelById.get(row.structureId) ?? row.structureId}</TableCell>
                      <TableCell>{formatMoney(row.basicPay)}</TableCell>
                      <TableCell>{row.effectiveFrom}</TableCell>
                      <TableCell>{row.effectiveTo ?? "—"}</TableCell>
                      <TableCell>
                        {row.effectiveTo === null ? (
                          <Badge variant="soft-success">{t("statusCurrent")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("statusEnded")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>

      <div className="flex flex-wrap items-center gap-2">
        <NewAssignmentDialog employeeId={employeeId} />
        <EndAssignmentDialog employeeId={employeeId} openAssignment={openAssignment} />
      </div>
    </div>
  );
}

function NewAssignmentDialog({ employeeId }: { employeeId: string }) {
  const t = useTranslations("payroll.employees.assignmentPanel.newDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [structureId, setStructureId] = React.useState("");
  const [basicPay, setBasicPay] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState(todayIsoDate());
  const [effectiveTo, setEffectiveTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const assignMutation = useAssignEmployee();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStructureId("");
      setBasicPay("");
      setEffectiveFrom(todayIsoDate());
      setEffectiveTo("");
      setError(null);
    }
  }

  const normalizedBasicPay = normalizeMoneyInput(basicPay);
  const canSubmit = !!structureId && normalizedBasicPay !== null && !!effectiveFrom && !assignMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: AssignEmployeeDto = {
      employeeId,
      structureId,
      basicPay: normalizedBasicPay ?? "0",
      effectiveFrom,
    };
    if (effectiveTo) dto.effectiveTo = effectiveTo;
    try {
      await assignMutation.mutateAsync(dto);
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
            <Label required>{t("structureLabel")}</Label>
            <SalaryStructureCombobox
              value={structureId}
              onChange={setStructureId}
              placeholder={t("structurePlaceholder")}
              searchPlaceholder={t("structureSearchPlaceholder")}
              emptyText={t("structureEmptyText")}
              loadingText={t("loadingStructures")}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("basicPayLabel")}</Label>
            <MoneyInput value={basicPay} onValueChange={(v) => setBasicPay(v ?? "")} />
            <p className="text-xs text-muted-foreground">{t("basicPayHint")}</p>
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
            {assignMutation.isPending ? t("assigning") : t("assignButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndAssignmentDialog({ employeeId, openAssignment }: { employeeId: string; openAssignment: PyrlEmployeeAssignmentResponseDto | null }) {
  const t = useTranslations("payroll.employees.assignmentPanel.endDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [effectiveTo, setEffectiveTo] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const endMutation = useEndEmployeeAssignment();

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
    const dto: EndAssignmentDto = { effectiveTo };
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
        <Button type="button" variant="outline" disabled={!openAssignment}>
          <Square className="size-4" />
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

        <div className="space-y-1.5">
          <Label required>{t("effectiveToLabel")}</Label>
          <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("effectiveToHint")}</p>
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
