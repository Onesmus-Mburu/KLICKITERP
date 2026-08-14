"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ClaimLineResponseDto, ClaimResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useCategories } from "../hooks/use-categories";
import { useAddClaimLine, useClaimLines, useDeleteClaimLine, useUpdateClaimLine } from "../hooks/use-claims";

const DESCRIPTION_MAX_LENGTH = 200; // AddClaimLineDto/UpdateClaimLineDto.description's own @MaxLength(200).

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — add/edit/delete lines
 * on an EXISTING claim, each a real, individual API call (`POST .../lines`,
 * `PATCH .../lines/{lineId}`, `DELETE .../lines/{lineId}`) — mirrors
 * `requisition-line-editor.tsx`'s (Procurement, Slice 18 Part 2) own shape
 * closely: same DRAFT-only server-side guard, same read-only-once-not-DRAFT
 * rendering (every mutating control hidden once `claim.status !== "DRAFT"`,
 * rather than exposing controls that would just 422).
 *
 * `categoryId` reuses THIS SAME part's own `useCategories()` (Expenses'
 * categories, the same categories Vouchers/Petty Cash already reuse),
 * filtered client-side to `isActive` — the identical treatment
 * `create-voucher-dialog.tsx`/`spend-dialog.tsx` already give their own
 * category pickers. `receiptFileId` is skipped entirely — no file-upload UI
 * exists anywhere in this codebase yet, the same documented gap every prior
 * Expenses part flags. `expenseDate` is a plain `<Input type="date">`
 * defaulting to today, the same convention `capture-supplier-invoice-dialog.tsx`
 * (Procurement) already established — no dedicated date-picker component
 * exists in this codebase (grep-confirmed).
 *
 * **The running total shown here is `claim.total` (server truth), not a
 * client-side sum** — every add/edit/delete mutation below invalidates BOTH
 * the lines query AND the claim DETAIL query (`use-claims.ts`'s own
 * `useAddClaimLine()`/`useUpdateClaimLine()`/`useDeleteClaimLine()` doc
 * comments), so the parent's `claim` prop refreshes in lockstep with this
 * table — the exact same "read the already-recomputed total off the prop,
 * never recompute client-side" precedent `requisition-line-editor.tsx`'s own
 * doc comment documents for `requisition.totalEstimate`.
 */
export function ClaimLineEditor({ claim }: { claim: ClaimResponseDto }) {
  const t = useTranslations("expenses.claims.lineEditor");
  const tDetail = useTranslations("expenses.claims.detail");
  const linesQuery = useClaimLines(claim.id);
  const editable = claim.status === "DRAFT";

  return (
    <div className="space-y-3">
      <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
        {(lines) => (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("description")}</TableHead>
                    <TableHead>{t("categoryLabel")}</TableHead>
                    <TableHead>{t("expenseDateLabel")}</TableHead>
                    <TableHead>{t("amountLabel")}</TableHead>
                    {editable && <TableHead className="w-20">{tDetail("columns.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <ClaimLineRow key={line.id} claim={claim} line={line} editable={editable} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">{tDetail("totalLabel")}</span>
              <span className="font-medium text-foreground">{formatMoney(claim.total)}</span>
            </div>
          </div>
        )}
      </QueryBoundary>

      {editable && (
        <div>
          <AddClaimLineDialog claimId={claim.id} />
        </div>
      )}
    </div>
  );
}

function ClaimLineRow({ claim, line, editable }: { claim: ClaimResponseDto; line: ClaimLineResponseDto; editable: boolean }) {
  const categoriesQuery = useCategories();
  const categoryName = React.useMemo(
    () => (categoriesQuery.data ?? []).find((c) => c.id === line.categoryId)?.name ?? line.categoryId,
    [categoriesQuery.data, line.categoryId],
  );

  return (
    <TableRow>
      <TableCell>{line.description}</TableCell>
      <TableCell>{categoryName}</TableCell>
      <TableCell>{line.expenseDate}</TableCell>
      <TableCell>{formatMoney(line.amount)}</TableCell>
      {editable && (
        <TableCell>
          <div className="flex items-center gap-1">
            <EditClaimLineDialog claimId={claim.id} line={line} />
            <DeleteClaimLineDialog claimId={claim.id} line={line} />
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function AddClaimLineDialog({ claimId }: { claimId: string }) {
  const t = useTranslations("expenses.claims.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [expenseDate, setExpenseDate] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const addMutation = useAddClaimLine();
  const categoriesQuery = useCategories();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCategoryId("");
      setDescription("");
      setAmount(null);
      setExpenseDate(todayIsoDate());
      setError(null);
    }
  }

  const categoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );

  const canSubmit =
    !!categoryId && description.trim().length > 0 && normalizeMoneyInput(amount ?? "") !== null && !!expenseDate && !addMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    try {
      await addMutation.mutateAsync({
        claimId,
        dto: { categoryId, description: description.trim(), amount, expenseDate },
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
            <Label required>{t("categoryLabel")}</Label>
            <Combobox
              items={categoryItems}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("selectCategoryPlaceholder")}
              searchPlaceholder={t("searchCategories")}
              emptyText={t("noCategoriesFound")}
              disabled={categoriesQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("description")}</Label>
            <Input
              value={description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("amountLabel")}</Label>
              <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("expenseDateLabel")}</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
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

function EditClaimLineDialog({ claimId, line }: { claimId: string; line: ClaimLineResponseDto }) {
  const t = useTranslations("expenses.claims.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState(line.categoryId);
  const [description, setDescription] = React.useState(line.description);
  const [amount, setAmount] = React.useState<string | null>(line.amount);
  const [expenseDate, setExpenseDate] = React.useState(line.expenseDate);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateClaimLine();
  const categoriesQuery = useCategories();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCategoryId(line.categoryId);
      setDescription(line.description);
      setAmount(line.amount);
      setExpenseDate(line.expenseDate);
      setError(null);
    }
  }

  const categoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );

  const canSubmit =
    !!categoryId && description.trim().length > 0 && normalizeMoneyInput(amount ?? "") !== null && !!expenseDate && !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        claimId,
        lineId: line.id,
        dto: { categoryId, description: description.trim(), amount, expenseDate },
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
            <Label required>{t("categoryLabel")}</Label>
            <Combobox
              items={categoryItems}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("selectCategoryPlaceholder")}
              searchPlaceholder={t("searchCategories")}
              emptyText={t("noCategoriesFound")}
              disabled={categoriesQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("description")}</Label>
            <Input value={description} maxLength={DESCRIPTION_MAX_LENGTH} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("amountLabel")}</Label>
              <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("expenseDateLabel")}</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
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

function DeleteClaimLineDialog({ claimId, line }: { claimId: string; line: ClaimLineResponseDto }) {
  const t = useTranslations("expenses.claims.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteClaimLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync({ claimId, lineId: line.id });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-tint-destructive hover:text-destructive"
          aria-label={tCommon("delete")}
        >
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
