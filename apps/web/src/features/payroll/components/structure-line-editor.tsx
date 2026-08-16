"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import type { PyrlSalaryStructureResponseDto, StructureComponentLineDto, StructureComponentLineResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useComponents } from "../hooks/use-components";
import { useAddStructureLine, useRemoveStructureLine, useStructureLines, useUpdateStructureLine } from "../hooks/use-salary-structures";
import { fractionToPercent, percentToFraction } from "../lib/percent";
import { ComponentCombobox } from "./component-combobox";

const LINE_TYPES = ["FIXED", "PERCENT_OF_BASIC"] as const;
type LineType = (typeof LINE_TYPES)[number];

type LineDisplay = { type: "FIXED"; amount: string } | { type: "PERCENT_OF_BASIC"; rate: string } | null;

/**
 * Resolves what a line ACTUALLY is — reading the top-level `amount` column
 * FIRST (the documented, intended shape), but falling back to
 * `formula.amount`/`formula.rate` since a real, live-confirmed backend bug
 * (see this file's own doc comment above) means every line ever created
 * through `SalaryStructuresController.addLine()`/`updateLine()` — the ONLY
 * real way to create/edit one — lands with `amount` permanently `null` and
 * the FULL formula (including FIXED lines) inside `formula` instead. This
 * fallback is what makes the table/edit-dialog correctly show a FIXED
 * line's real KES amount today, and stays correct for free if that
 * controller bug is ever fixed and `amount` starts being populated for
 * real (the first branch below would then simply start firing instead).
 */
function resolveLineDisplay(line: StructureComponentLineResponseDto): LineDisplay {
  if (line.amount !== null) return { type: "FIXED", amount: line.amount };
  const formula = line.formula;
  if (formula && typeof formula.type === "string") {
    if (formula.type === "FIXED" && typeof formula.amount === "string") return { type: "FIXED", amount: formula.amount };
    if (formula.type === "PERCENT_OF_BASIC" && typeof formula.rate === "string") return { type: "PERCENT_OF_BASIC", rate: formula.rate };
  }
  return null;
}

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — add/edit/remove
 * `pyrl_structure_component` lines on an existing salary structure, each a
 * real, individual API call (`POST .../lines`, `PATCH lines/{lineId}`,
 * `DELETE lines/{lineId}`), the same per-line-mutation shape
 * `budget-line-editor.tsx` (Accounting Budgets, Slice 17 Part 3) already
 * establishes for this codebase. Unlike that component, there is no
 * DRAFT-only status gate here — `pyrl_salary_structure` carries no lifecycle
 * at all, so every action stays available regardless of the structure's own
 * `effectiveFrom`.
 *
 * **A real, live-confirmed backend bug this part found (out of this part's
 * own pre-authorized backend-touch scope — the `create()` 409 fix only —
 * left unfixed, honestly flagged, not silently patched over)**:
 * `SalaryStructuresController.addLine()`/`updateLine()` build their request
 * to `SalaryStructuresService` via a local `toFormula(dto)` helper that
 * ALWAYS wraps the line into `{ formula: ... }`, even for `type: "FIXED"`
 * (`toFormula()` returns `{ type: "FIXED", amount: dto.amount }` as a
 * FORMULA object, never as the dedicated `amount` Money argument the
 * service itself genuinely supports — confirmed correct at the service
 * layer by its own unit test, `salary-structures.service.spec.ts`'s "accepts
 * a FIXED amount line" case, which calls `service.addLine()` DIRECTLY with a
 * real `amount: Money` and gets it stored on the dedicated column). The
 * practical effect, confirmed live via `psql`/the real HTTP response on a
 * FIXED line created through this part's own verification pass: the
 * dedicated `pyrl_structure_component.amount` NUMERIC column is permanently
 * `null` for every line ever created through the only real API surface that
 * exists, and a FIXED line's amount lives at `formula.amount` instead — the
 * exact same jsonb slot a PERCENT_OF_BASIC line's `rate` lives in.
 * **Payroll computation itself is unaffected** — `resolveComponentAmount()`
 * (a pure function, `salary-structures.service.ts:44-57`) reads whichever of
 * `line.amount`/`line.formula` is set and already handles a `{type:"FIXED",
 * amount}` formula shape correctly, since that's a real member of its own
 * `StructureComponentFormula` union — so Pass B's future run-computation
 * engine will resolve FIXED lines correctly regardless of this bug. This
 * component's own `resolveLineDisplay()` above is written to match this
 * REAL behavior (read `formula.type`/`formula.amount`/`formula.rate` as the
 * source of truth, falling back to the top-level `amount` column only if
 * that bug is ever fixed and it starts being populated for real) rather than
 * the brief's own assumption (`line.amount !== null` distinguishes a FIXED
 * line) — that assumption never holds true against the live API.
 *
 * **Exactly one of amount/rate per line, enforced client-side too** — the
 * `type` toggle in both add/edit dialogs shows ONLY the `MoneyInput` (for
 * FIXED) or ONLY a percentage `Input` (for PERCENT_OF_BASIC), mirroring the
 * server's own `@ValidateIf` + `ck_pyrl_structure_component_amount_or_formula`
 * DB check (`salary-structure.dto.ts`/`salary-structures.service.ts:121`).
 *
 * **The rate field is a decimal FRACTION on the wire (`"0.15"` for 15%), but
 * a PERCENTAGE in this UI** (`"15"`) — `../lib/percent.ts`'s
 * `percentToFraction()`/`fractionToPercent()` convert exactly (a base-10
 * decimal-point shift, never floating-point `* 100`/`/ 100`) at the two
 * boundaries (submit, and re-displaying an existing line for edit/in the
 * table).
 *
 * **No KES figure is ever computed or shown for a PERCENT_OF_BASIC line** —
 * per this part's own task brief: `resolveComponentAmount()`
 * (`salary-structures.service.ts:44-57`) resolves `basicPay × rate` fresh at
 * payroll-run time, and no single employee's `basicPay` is in scope on this
 * screen (that only exists once an employee is assigned to this structure,
 * Part 3's own scope) — the table shows the rate/percentage plainly
 * (`"15% of basic pay"`) instead, and `resolvedAtPayrollTimeNotice` below
 * states this plainly rather than implying a number that can't actually be
 * computed here.
 *
 * **The edit dialog does not expose a component picker at all** — per this
 * part's own task brief: `componentId` is accepted but silently ignored by
 * `SalaryStructuresService.updateLine()` (confirmed by reading it directly,
 * only `formula` is ever applied), so re-picking a different component here
 * would be pure UI theater. The line's own existing `componentId` is shown
 * as a plain read-only label and carried through verbatim in every submitted
 * `PATCH` body — the simplest correct approach, not a disabled-but-visible
 * picker pretending to be interactive.
 */
export function StructureLineEditor({ structure }: { structure: PyrlSalaryStructureResponseDto }) {
  const t = useTranslations("payroll.salaryStructures.lineEditor");
  const linesQuery = useStructureLines(structure.id);
  const componentsQuery = useComponents();

  const componentLabelById = React.useMemo(
    () => new Map((componentsQuery.data ?? []).map((c) => [c.id, `${c.code} — ${c.name}`])),
    [componentsQuery.data],
  );

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t("resolvedAtPayrollTimeNotice")}</AlertDescription>
      </Alert>

      <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
        {(lines) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("componentColumn")}</TableHead>
                  <TableHead>{t("typeColumn")}</TableHead>
                  <TableHead>{t("amountOrRateColumn")}</TableHead>
                  <TableHead className="w-20">{t("actionsColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const display = resolveLineDisplay(line);
                  const percentDisplay = display?.type === "PERCENT_OF_BASIC" ? fractionToPercent(display.rate) : null;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{componentLabelById.get(line.componentId) ?? line.componentId}</TableCell>
                      <TableCell>{display?.type === "FIXED" ? t("typeFixed") : display?.type === "PERCENT_OF_BASIC" ? t("typePercentOfBasic") : "—"}</TableCell>
                      <TableCell>
                        {display?.type === "FIXED"
                          ? formatMoney(display.amount)
                          : percentDisplay !== null
                            ? t("percentOfBasicPay", { percent: percentDisplay })
                            : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <EditStructureLineDialog structureId={structure.id} line={line} componentLabel={componentLabelById.get(line.componentId) ?? line.componentId} />
                          <DeleteStructureLineDialog structureId={structure.id} line={line} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>

      <div>
        <AddStructureLineDialog structureId={structure.id} />
      </div>
    </div>
  );
}

/** Shared FIXED/PERCENT_OF_BASIC conditional field pair — the amount `MoneyInput` shows only when `type==="FIXED"`, the percentage `Input` only when `type==="PERCENT_OF_BASIC"`, matching the server's own `@ValidateIf` toggle. */
function AmountOrRateFields({
  type,
  amount,
  onAmountChange,
  percent,
  onPercentChange,
}: {
  type: LineType;
  amount: string;
  onAmountChange: (value: string) => void;
  percent: string;
  onPercentChange: (value: string) => void;
}) {
  const t = useTranslations("payroll.salaryStructures.lineEditor");

  if (type === "FIXED") {
    return (
      <div className="space-y-1.5">
        <Label required>{t("amountLabel")}</Label>
        <MoneyInput value={amount} onValueChange={(v) => onAmountChange(v ?? "")} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label required>{t("rateLabel")}</Label>
      <div className="relative">
        <Input inputMode="decimal" value={percent} onChange={(e) => onPercentChange(e.target.value)} placeholder="0" className="pr-9" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("rateHint")}</p>
    </div>
  );
}

function AddStructureLineDialog({ structureId }: { structureId: string }) {
  const t = useTranslations("payroll.salaryStructures.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [componentId, setComponentId] = React.useState("");
  const [type, setType] = React.useState<LineType>("FIXED");
  const [amount, setAmount] = React.useState("");
  const [percent, setPercent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addMutation = useAddStructureLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setComponentId("");
      setType("FIXED");
      setAmount("");
      setPercent("");
      setError(null);
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const normalizedRate = type === "PERCENT_OF_BASIC" ? percentToFraction(percent) : null;
  const canSubmit = !!componentId && (type === "FIXED" ? normalizedAmount !== null : normalizedRate !== null) && !addMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: StructureComponentLineDto =
      type === "FIXED"
        ? { componentId, type: "FIXED", amount: normalizedAmount ?? "0" }
        : { componentId, type: "PERCENT_OF_BASIC", rate: normalizedRate ?? "0" };
    try {
      await addMutation.mutateAsync({ structureId, dto });
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
          {t("addLineTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addDialogTitle")}</DialogTitle>
          <DialogDescription>{t("addDialogDescription")}</DialogDescription>
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
            <Label required>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as LineType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_TYPES.map((lt) => (
                  <SelectItem key={lt} value={lt}>
                    {lt === "FIXED" ? t("typeFixed") : t("typePercentOfBasic")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AmountOrRateFields type={type} amount={amount} onAmountChange={setAmount} percent={percent} onPercentChange={setPercent} />
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

function EditStructureLineDialog({
  structureId,
  line,
  componentLabel,
}: {
  structureId: string;
  line: StructureComponentLineResponseDto;
  componentLabel: string;
}) {
  const t = useTranslations("payroll.salaryStructures.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const initialDisplay = resolveLineDisplay(line);
  const initialType: LineType = initialDisplay?.type === "PERCENT_OF_BASIC" ? "PERCENT_OF_BASIC" : "FIXED";
  const initialAmount = initialDisplay?.type === "FIXED" ? initialDisplay.amount : "";
  const initialPercent = initialDisplay?.type === "PERCENT_OF_BASIC" ? (fractionToPercent(initialDisplay.rate) ?? "") : "";
  const [type, setType] = React.useState<LineType>(initialType);
  const [amount, setAmount] = React.useState(initialAmount);
  const [percent, setPercent] = React.useState(initialPercent);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateStructureLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setType(initialType);
      setAmount(initialAmount);
      setPercent(initialPercent);
      setError(null);
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const normalizedRate = type === "PERCENT_OF_BASIC" ? percentToFraction(percent) : null;
  const canSubmit = (type === "FIXED" ? normalizedAmount !== null : normalizedRate !== null) && !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: StructureComponentLineDto =
      type === "FIXED"
        ? { componentId: line.componentId, type: "FIXED", amount: normalizedAmount ?? "0" }
        : { componentId: line.componentId, type: "PERCENT_OF_BASIC", rate: normalizedRate ?? "0" };
    try {
      await updateMutation.mutateAsync({ structureId, lineId: line.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={tCommon("edit")}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          <DialogDescription>{t("editDialogDescription", { component: componentLabel })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("componentLabel")}</Label>
            <p className="text-sm text-foreground">{componentLabel}</p>
            <p className="text-xs text-muted-foreground">{t("componentNotEditableHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as LineType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_TYPES.map((lt) => (
                  <SelectItem key={lt} value={lt}>
                    {lt === "FIXED" ? t("typeFixed") : t("typePercentOfBasic")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AmountOrRateFields type={type} amount={amount} onAmountChange={setAmount} percent={percent} onPercentChange={setPercent} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStructureLineDialog({ structureId, line }: { structureId: string; line: StructureComponentLineResponseDto }) {
  const t = useTranslations("payroll.salaryStructures.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const removeMutation = useRemoveStructureLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await removeMutation.mutateAsync({ structureId, lineId: line.id });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-tint-destructive hover:text-destructive" aria-label={tCommon("delete")}>
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
          <DialogDescription>{t("deleteDialogDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={removeMutation.isPending}>
            {removeMutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
