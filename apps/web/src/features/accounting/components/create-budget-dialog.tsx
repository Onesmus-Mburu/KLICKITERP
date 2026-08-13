"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { CreateBudgetDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "../hooks/use-accounts";
import { useCostCenters } from "../hooks/use-cost-centers";
import { useCreateBudget } from "../hooks/use-budgets";
import {
  budgetLineRowsToDto,
  budgetLineRowsTotal,
  emptyBudgetLineRow,
  isBudgetLineRowComplete,
  type BudgetLineFormRow,
} from "../lib/budget-lines";

const NAME_MAX_LENGTH = 80; // gl_budget.name — create-budget.dto.ts's own @MaxLength(80).
const VERSION_LABEL_MAX_LENGTH = 20; // gl_budget.version_label — create-budget.dto.ts's own @MaxLength(20).

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — the budget create form: name
 * + version label + a repeatable line-row table (account, optional cost
 * center, annual amount), in the spirit of `journal-line-editor.tsx` but
 * genuinely simpler — no debit/credit split, `periodPhasing` is deliberately
 * omitted entirely from this form and sent as a plain `{}` on every row (see
 * `lib/budget-lines.ts`'s own doc comment for why, and `budget-line-editor.tsx`
 * for where `periodPhasing` DOES become editable, after the budget exists).
 *
 * **`fiscalYearId` is a required prop, not a picker inside this dialog** —
 * the budgets list page (`app/(erp)/accounting/budgets/page.tsx`) is already
 * fiscal-year-scoped (`GET /accounting/budgets?fiscalYearId=` requires one),
 * so the dialog trigger itself is only rendered once a fiscal year is
 * selected there; re-asking inside the dialog would be redundant.
 *
 * **Stays a `<Dialog>`, unlike Journals' own "dialog vs. dedicated page"
 * deviation** — a judgment call: a budget line row (account + cost center +
 * one amount, 3 columns) is far narrower than a journal line row (6 columns
 * including a live debit/credit balance indicator), so it comfortably fits a
 * dialog's max-width content without the cramped-table problem that pushed
 * `journal-entry-form.tsx` out to a full page.
 */
export function CreateBudgetDialog({ fiscalYearId }: { fiscalYearId: string }) {
  const t = useTranslations("accounting.budgets.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [versionLabel, setVersionLabel] = React.useState("");
  const [rows, setRows] = React.useState<BudgetLineFormRow[]>(() => [emptyBudgetLineRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateBudget();
  const accountsQuery = useAccounts({ isActive: true });
  const costCentersQuery = useCostCenters(true);

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
      setName("");
      setVersionLabel("");
      setRows([emptyBudgetLineRow()]);
      setError(null);
    }
  }

  function patchRow(key: string, patch: Partial<BudgetLineFormRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyBudgetLineRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  const linesComplete = rows.length > 0 && rows.every(isBudgetLineRowComplete);
  const canSubmit = name.trim().length > 0 && versionLabel.trim().length > 0 && linesComplete && !createMutation.isPending;
  const total = budgetLineRowsTotal(rows);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateBudgetDto = {
      fiscalYearId,
      name: name.trim(),
      versionLabel: versionLabel.trim(),
      lines: budgetLineRowsToDto(rows),
    };
    try {
      const budget = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/accounting/budgets/${budget.id}`);
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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("nameLabel")}</Label>
              <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("versionLabelLabel")}</Label>
              <Input
                value={versionLabel}
                maxLength={VERSION_LABEL_MAX_LENGTH}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder={t("versionLabelPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("linesTitle")}</Label>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("account")}</TableHead>
                    <TableHead>{t("costCenter")}</TableHead>
                    <TableHead>{t("annualAmount")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="min-w-[200px]">
                        <Combobox
                          items={accountItems}
                          value={row.accountId}
                          onChange={(v) => patchRow(row.key, { accountId: v })}
                          placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccount")}
                          searchPlaceholder={t("searchAccounts")}
                          emptyText={t("noAccountsFound")}
                          disabled={accountsQuery.isLoading}
                        />
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <Combobox
                          items={costCenterItems}
                          value={row.costCenterId}
                          onChange={(v) => patchRow(row.key, { costCenterId: v })}
                          placeholder={t("noCostCenter")}
                          searchPlaceholder={t("searchCostCenters")}
                          emptyText={t("noCostCentersFound")}
                        />
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <MoneyInput value={row.annualAmount} onValueChange={(v) => patchRow(row.key, { annualAmount: v ?? "" })} />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length <= 1}
                          aria-label={t("removeLine")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              {t("addLine")}
            </Button>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t("totalLabel")}</span>
              <span className="font-medium text-foreground">{formatMoney(total)}</span>
            </div>
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
