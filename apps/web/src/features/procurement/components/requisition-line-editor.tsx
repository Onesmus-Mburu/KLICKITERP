"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RequisitionLineResponseDto, RequisitionResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { ItemCombobox, type SelectedInventoryItem } from "@/features/inventory/components/item-combobox";
import { useAddRequisitionLine, useDeleteRequisitionLine, useRequisitionLines, useUpdateRequisitionLine } from "../hooks/use-requisitions";

const FREE_TEXT_MAX_LENGTH = 200; // CreateRequisitionLineDto.freeText's own @MaxLength(200).
const DEFAULT_QTY = "1";

/** Loose client-side sanity check only, not real validation — this codebase has no shared frontend UUID-format helper to reuse for this one optional field (grep-confirmed), and the server's own `@IsUUID()` is the real gate regardless (an invalid value here still surfaces as a real 400, caught the same way every other mutation error is). */
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 6 Slice 18 Part 2 (Requisitions, Procurement) — add/edit/delete
 * lines on an EXISTING requisition, each a real, individual API call
 * (`POST .../lines`, `PATCH .../lines/{lineId}`, `DELETE .../lines/{lineId}`)
 * — mirrors `budget-line-editor.tsx`'s own shape closely: same DRAFT-only
 * server-side guard (`RequisitionsService.requireDraft()`), same
 * read-only-once-not-DRAFT rendering (every mutating control hidden once
 * `requisition.status !== "DRAFT"`, rather than exposing controls that would
 * just 422).
 *
 * **Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) retrofit —
 * `itemId` now HAS a real picker**: `<ItemCombobox>` (an additional,
 * OPTIONAL field in both the add/edit line dialogs below) lets a user
 * attach a real `inv_item` to a line, now that Module 13's frontend exists.
 * Selecting an item sets that dialog's own local `itemId` state and
 * convenience-prefills `freeText` with the item's name IF `freeText` is
 * still empty (never overwrites text already typed — a genuinely optional
 * autofill). Leaving the combobox untouched preserves the EXACT prior
 * behavior this file originally shipped with: `itemId` stays unset,
 * `freeText` stays free text, `CreateRequisitionLineDto`'s real "at least
 * one of itemId/freeText" server-side rule
 * (`ck_proc_requisition_line_item_or_free_text`) is still satisfied by the
 * always-required non-empty `freeText` regardless of whether `itemId` is
 * also set — this retrofit is purely additive, not a replacement for the
 * free-text path. A line whose `itemId` was set through a DIFFERENT path
 * (impossible before this pass, still not this editor's own concern) still
 * displays it as a fallback in the description column, unchanged.
 *
 * **`budgetLineId` is a plain optional uuid text input, not a real picker**
 * — cross-referencing every ACTIVE budget's lines (`GET
 * .../budgets/{id}/lines`) to build a proper combobox is a nice-to-have the
 * plan explicitly scoped OUT of this pass. `UUID_LIKE_PATTERN` above is a
 * light sanity check only.
 *
 * **The running total shown here is `requisition.totalEstimate` (server
 * truth), not a client-side sum** — unlike `budget-line-editor.tsx`'s own
 * footer (a plain `sumMoneyStrings` over each line's `annualAmount`, no
 * multiplication needed since each budget line IS an amount already), a
 * requisition line's contribution to the total is `qty × estPrice`, and this
 * codebase's `lib/money.ts` only exports addition-shaped decimal-string
 * helpers (`formatMoney`/`sumMoneyStrings`/`normalizeMoneyInput` — confirmed
 * by reading it directly, no multiply helper exists). Rather than invent a
 * new BigInt decimal-multiplication utility for this single display, this
 * component reads the already-correct, already-recomputed total straight off
 * the `requisition` prop
 * (`RequisitionsService.recomputeTotalEstimate()` runs server-side after
 * every add/update/delete) — every mutation below invalidates the
 * requisition DETAIL query alongside the lines query, so the parent's
 * `requisition` prop refreshes in lockstep with this table.
 */
export function RequisitionLineEditor({ requisition }: { requisition: RequisitionResponseDto }) {
  const t = useTranslations("procurement.requisitions.lineEditor");
  const tDetail = useTranslations("procurement.requisitions.detail");
  const linesQuery = useRequisitionLines(requisition.id);
  const editable = requisition.status === "DRAFT";

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
                    <TableHead>{t("qtyLabel")}</TableHead>
                    <TableHead>{t("estPriceLabel")}</TableHead>
                    <TableHead>{t("budgetLineLabel")}</TableHead>
                    {editable && <TableHead className="w-20">{tDetail("columns.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.freeText ?? line.itemId ?? "—"}</TableCell>
                      <TableCell>{line.qty}</TableCell>
                      <TableCell>{formatMoney(line.estPrice)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{line.budgetLineId ?? "—"}</TableCell>
                      {editable && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <EditRequisitionLineDialog requisitionId={requisition.id} line={line} />
                            <DeleteRequisitionLineDialog requisitionId={requisition.id} line={line} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">{tDetail("totalEstimateLabel")}</span>
              <span className="font-medium text-foreground">{formatMoney(requisition.totalEstimate)}</span>
            </div>
          </div>
        )}
      </QueryBoundary>

      {editable && (
        <div>
          <AddRequisitionLineDialog requisitionId={requisition.id} />
        </div>
      )}
    </div>
  );
}

function AddRequisitionLineDialog({ requisitionId }: { requisitionId: string }) {
  const t = useTranslations("procurement.requisitions.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [itemId, setItemId] = React.useState("");
  const [itemLabel, setItemLabel] = React.useState<string | undefined>(undefined);
  const [freeText, setFreeText] = React.useState("");
  const [qty, setQty] = React.useState(DEFAULT_QTY);
  const [estPrice, setEstPrice] = React.useState("");
  const [budgetLineId, setBudgetLineId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addMutation = useAddRequisitionLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setItemId("");
      setItemLabel(undefined);
      setFreeText("");
      setQty(DEFAULT_QTY);
      setEstPrice("");
      setBudgetLineId("");
      setError(null);
    }
  }

  function handleItemSelect(item: SelectedInventoryItem | null) {
    if (!item) {
      setItemId("");
      setItemLabel(undefined);
      return;
    }
    setItemId(item.id);
    setItemLabel(`${item.code} — ${item.name}`);
    if (freeText.trim() === "") setFreeText(item.name.slice(0, FREE_TEXT_MAX_LENGTH));
  }

  const budgetLineIdValid = budgetLineId.trim() === "" || UUID_LIKE_PATTERN.test(budgetLineId.trim());
  const canSubmit =
    freeText.trim().length > 0 &&
    normalizeMoneyInput(qty) !== null &&
    normalizeMoneyInput(estPrice) !== null &&
    budgetLineIdValid &&
    !addMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await addMutation.mutateAsync({
        requisitionId,
        dto: {
          ...(itemId ? { itemId } : {}),
          freeText: freeText.trim(),
          qty: normalizeMoneyInput(qty) ?? "0",
          estPrice: normalizeMoneyInput(estPrice) ?? "0",
          ...(budgetLineId.trim() ? { budgetLineId: budgetLineId.trim() } : {}),
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
            <Label>{t("itemLabel")}</Label>
            <ItemCombobox value={itemId} valueLabel={itemLabel} onSelect={handleItemSelect} />
            <p className="text-xs text-muted-foreground">{t("itemHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("description")}</Label>
            <Input
              value={freeText}
              maxLength={FREE_TEXT_MAX_LENGTH}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("qtyLabel")}</Label>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("estPriceLabel")}</Label>
              <MoneyInput value={estPrice} onValueChange={(v) => setEstPrice(v ?? "")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("budgetLineLabel")}</Label>
            <Input value={budgetLineId} onChange={(e) => setBudgetLineId(e.target.value)} placeholder={t("budgetLineIdPlaceholder")} />
            {!budgetLineIdValid && <p className="text-xs text-destructive">{t("budgetLineIdInvalid")}</p>}
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

function EditRequisitionLineDialog({ requisitionId, line }: { requisitionId: string; line: RequisitionLineResponseDto }) {
  const t = useTranslations("procurement.requisitions.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [itemId, setItemId] = React.useState(line.itemId ?? "");
  const [itemLabel, setItemLabel] = React.useState<string | undefined>(undefined);
  const [freeText, setFreeText] = React.useState(line.freeText ?? "");
  const [qty, setQty] = React.useState(line.qty);
  const [estPrice, setEstPrice] = React.useState(line.estPrice);
  const [budgetLineId, setBudgetLineId] = React.useState(line.budgetLineId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateRequisitionLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setItemId(line.itemId ?? "");
      setItemLabel(undefined);
      setFreeText(line.freeText ?? "");
      setQty(line.qty);
      setEstPrice(line.estPrice);
      setBudgetLineId(line.budgetLineId ?? "");
      setError(null);
    }
  }

  function handleItemSelect(item: SelectedInventoryItem | null) {
    if (!item) {
      setItemId("");
      setItemLabel(undefined);
      return;
    }
    setItemId(item.id);
    setItemLabel(`${item.code} — ${item.name}`);
    if (freeText.trim() === "") setFreeText(item.name.slice(0, FREE_TEXT_MAX_LENGTH));
  }

  const budgetLineIdValid = budgetLineId.trim() === "" || UUID_LIKE_PATTERN.test(budgetLineId.trim());
  const canSubmit =
    freeText.trim().length > 0 &&
    normalizeMoneyInput(qty) !== null &&
    normalizeMoneyInput(estPrice) !== null &&
    budgetLineIdValid &&
    !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        requisitionId,
        lineId: line.id,
        dto: {
          ...(itemId ? { itemId } : {}),
          freeText: freeText.trim(),
          qty: normalizeMoneyInput(qty) ?? "0",
          estPrice: normalizeMoneyInput(estPrice) ?? "0",
          ...(budgetLineId.trim() ? { budgetLineId: budgetLineId.trim() } : {}),
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
            <Label>{t("itemLabel")}</Label>
            <ItemCombobox value={itemId} valueLabel={itemLabel} onSelect={handleItemSelect} />
            <p className="text-xs text-muted-foreground">{t("itemHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("description")}</Label>
            <Input value={freeText} maxLength={FREE_TEXT_MAX_LENGTH} onChange={(e) => setFreeText(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("qtyLabel")}</Label>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("estPriceLabel")}</Label>
              <MoneyInput value={estPrice} onValueChange={(v) => setEstPrice(v ?? "")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("budgetLineLabel")}</Label>
            <Input value={budgetLineId} onChange={(e) => setBudgetLineId(e.target.value)} placeholder={t("budgetLineIdPlaceholder")} />
            {!budgetLineIdValid && <p className="text-xs text-destructive">{t("budgetLineIdInvalid")}</p>}
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

function DeleteRequisitionLineDialog({ requisitionId, line }: { requisitionId: string; line: RequisitionLineResponseDto }) {
  const t = useTranslations("procurement.requisitions.lineEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteRequisitionLine();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync({ requisitionId, lineId: line.id });
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
