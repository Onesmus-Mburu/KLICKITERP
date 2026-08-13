"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { BudgetLineResponseDto, BudgetResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "../hooks/use-accounts";
import { useCostCenters } from "../hooks/use-cost-centers";
import { useAddBudgetLine, useBudgetLines, useDeleteBudgetLine, useUpdateBudgetLine } from "../hooks/use-budgets";

/** `JSON.stringify({}) === "{}"` — the send-`{}`-by-default value every line from `create-budget-dialog.tsx`/this file's own add-line dialog starts with, per `lib/budget-lines.ts`'s own doc comment. Used only to decide whether to render a muted "—" instead of the raw JSON in the lines table. */
function isEmptyPhasing(value: Record<string, unknown>): boolean {
  return Object.keys(value ?? {}).length === 0;
}

/** Parses a period-phasing textarea's raw text into `Record<string, unknown>` or `undefined` if invalid (not valid JSON, or valid JSON that isn't a plain object) — an empty/whitespace-only textarea is treated as `{}`, never as an error, matching `BudgetLineInputDto.periodPhasing`'s own "opaque, no shape requirement" contract (`@IsObject()` only, no nested validation). */
function parsePeriodPhasingInput(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — add/edit/delete lines on an
 * EXISTING budget, each a real, individual API call (unlike
 * `create-budget-dialog.tsx`'s own in-memory row array, submitted together
 * in one `POST .../budgets`): `POST .../lines` (one line at a time, not an
 * array — confirmed by reading `BudgetsController.addLine()` directly),
 * `PATCH .../lines/{lineId}`, `DELETE .../lines/{lineId}`.
 *
 * **DRAFT-only, server-enforced** (`BudgetsService.requireDraft()`) — this
 * component reads `budget.status` itself and hides every mutating control
 * (Add/Edit/Delete) once the budget leaves DRAFT, so the table becomes a
 * plain read-only view for PENDING_APPROVAL/ACTIVE/SUPERSEDED budgets rather
 * than exposing controls that would just 422.
 *
 * **`periodPhasing` is editable here, but only here** — per the plan's own
 * "simple free-form JSON textarea, or just send `{}`" instruction: adding a
 * new line still sends a plain `{}` (matching `create-budget-dialog.tsx`'s
 * own choice, for the same "don't ask for JSON before there's a reason to"
 * reasoning), but the EDIT dialog exposes it as a free-form JSON textarea —
 * `UpdateBudgetLineDto.periodPhasing` is genuinely editable server-side
 * (`BudgetsService.updateLine()`), so leaving it completely unreachable
 * everywhere would under-deliver on the DTO's own real capability.
 * `parsePeriodPhasingInput()` validates it parses to a plain object (never a
 * shape check beyond that — the field is genuinely opaque server-side too,
 * `@IsObject()` only) before allowing the edit to submit.
 *
 * **`accountId`/`costCenterId` are NOT editable after a line is created** —
 * `UpdateBudgetLineDto` has no fields for either (confirmed against the DTO
 * directly), so the edit dialog only ever shows annual amount + period
 * phasing; to change the account, delete the line and add a new one.
 */
export function BudgetLineEditor({ budget }: { budget: BudgetResponseDto }) {
  const t = useTranslations("accounting.budgets.lineEditor");
  const tDetail = useTranslations("accounting.budgets.detail");
  const linesQuery = useBudgetLines(budget.id);
  const accountsQuery = useAccounts();
  const costCentersQuery = useCostCenters();
  const editable = budget.status === "DRAFT";

  const accountLabelById = React.useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, `${a.code} — ${a.name}`])),
    [accountsQuery.data],
  );
  const costCenterLabelById = React.useMemo(
    () => new Map((costCentersQuery.data ?? []).map((c) => [c.id, `${c.code} — ${c.name}`])),
    [costCentersQuery.data],
  );

  return (
    <div className="space-y-3">
      <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
        {(lines) => {
          const total = sumMoneyStrings(lines.map((l) => l.annualAmount));
          return (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("account")}</TableHead>
                      <TableHead>{t("costCenter")}</TableHead>
                      <TableHead>{t("annualAmountLabel")}</TableHead>
                      <TableHead>{t("periodPhasingLabel")}</TableHead>
                      {editable && <TableHead className="w-20">{tDetail("columns.actions")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{accountLabelById.get(line.accountId) ?? line.accountId}</TableCell>
                        <TableCell>{line.costCenterId ? (costCenterLabelById.get(line.costCenterId) ?? line.costCenterId) : "—"}</TableCell>
                        <TableCell>{formatMoney(line.annualAmount)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {isEmptyPhasing(line.periodPhasing) ? "—" : JSON.stringify(line.periodPhasing)}
                        </TableCell>
                        {editable && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <EditBudgetLineDialog budgetId={budget.id} line={line} />
                              <DeleteBudgetLineDialog budgetId={budget.id} line={line} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">{tDetail("totalLabel")}</span>
                <span className="font-medium text-foreground">{formatMoney(total)}</span>
              </div>
            </div>
          );
        }}
      </QueryBoundary>

      {editable && (
        <div>
          <AddBudgetLineDialog budgetId={budget.id} />
        </div>
      )}
    </div>
  );
}

function AddBudgetLineDialog({ budgetId }: { budgetId: string }) {
  const t = useTranslations("accounting.budgets.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState("");
  const [costCenterId, setCostCenterId] = React.useState("");
  const [annualAmount, setAnnualAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const accountsQuery = useAccounts({ isActive: true });
  const costCentersQuery = useCostCenters(true);
  const addMutation = useAddBudgetLine();

  const accountItems = React.useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );
  const costCenterItems = React.useMemo(
    () => (costCentersQuery.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCentersQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAccountId("");
      setCostCenterId("");
      setAnnualAmount("");
      setError(null);
    }
  }

  const canSubmit = !!accountId && normalizeMoneyInput(annualAmount) !== null && !addMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await addMutation.mutateAsync({
        budgetId,
        dto: {
          accountId,
          ...(costCenterId ? { costCenterId } : {}),
          periodPhasing: {},
          annualAmount: normalizeMoneyInput(annualAmount) ?? "0",
        },
      });
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
            <Label required>{t("account")}</Label>
            <Combobox
              items={accountItems}
              value={accountId}
              onChange={setAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccount")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("costCenter")}</Label>
            <Combobox
              items={costCenterItems}
              value={costCenterId}
              onChange={setCostCenterId}
              placeholder={t("noCostCenter")}
              searchPlaceholder={t("searchCostCenters")}
              emptyText={t("noCostCentersFound")}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("annualAmountLabel")}</Label>
            <MoneyInput value={annualAmount} onValueChange={(v) => setAnnualAmount(v ?? "")} />
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

function EditBudgetLineDialog({ budgetId, line }: { budgetId: string; line: BudgetLineResponseDto }) {
  const t = useTranslations("accounting.budgets.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [annualAmount, setAnnualAmount] = React.useState(line.annualAmount);
  const [phasingText, setPhasingText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateBudgetLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAnnualAmount(line.annualAmount);
      setPhasingText(isEmptyPhasing(line.periodPhasing) ? "" : JSON.stringify(line.periodPhasing, null, 2));
      setError(null);
    }
  }

  const parsedPhasing = parsePeriodPhasingInput(phasingText);
  const canSubmit = normalizeMoneyInput(annualAmount) !== null && parsedPhasing !== undefined && !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || parsedPhasing === undefined) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        budgetId,
        lineId: line.id,
        dto: { annualAmount: normalizeMoneyInput(annualAmount) ?? "0", periodPhasing: parsedPhasing },
      });
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
          <DialogDescription>{t("editDialogDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("annualAmountLabel")}</Label>
            <MoneyInput value={annualAmount} onValueChange={(v) => setAnnualAmount(v ?? "")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("periodPhasingLabel")}</Label>
            <Textarea value={phasingText} onChange={(e) => setPhasingText(e.target.value)} placeholder="{}" rows={4} />
            <p className="text-xs text-muted-foreground">{t("periodPhasingHint")}</p>
            {parsedPhasing === undefined && <p className="text-xs text-destructive">{t("periodPhasingInvalid")}</p>}
          </div>
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

function DeleteBudgetLineDialog({ budgetId, line }: { budgetId: string; line: BudgetLineResponseDto }) {
  const t = useTranslations("accounting.budgets.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteBudgetLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync({ budgetId, lineId: line.id });
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
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
