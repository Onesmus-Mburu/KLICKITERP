"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { ItemResponseDto, UpdateItemDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCategories } from "../hooks/use-categories";
import { useUpdateItem } from "../hooks/use-items";

const NAME_MAX_LENGTH = 120; // inv_item.name is varchar(120) — inv-item.entity.ts.
const UOM_MAX_LENGTH = 20; // inv_item.uom is varchar(20) — inv-item.entity.ts.
const BARCODE_MAX_LENGTH = 60; // inv_item.barcode is varchar(60) — inv-item.entity.ts.

const ITEM_TYPES = ["STOCK", "CONSUMABLE", "SERVICE", "RESALE"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — a two-way diff
 * over every editable field EXCEPT `code` (`UpdateItemDto` has no `code`
 * field at all, confirmed by reading both the real class-validator DTO and
 * the generated type — locked post-creation, same "define once" precedent
 * `edit-account-dialog.tsx` establishes for `gl_account.code`) and
 * `isActive` (this dialog's own scope is the descriptive/policy fields; the
 * activate/deactivate toggle lives on the list/detail pages instead, the
 * same separation-of-concerns `edit-store-dialog.tsx`'s own doc comment
 * documents).
 *
 * **BR-INV-04, enforced client-side here too (`update` "re-checks" it
 * server-side per the controller's own summary)** — same hide-not-just-
 * optional treatment `create-item-dialog.tsx` establishes: the
 * `glIncomeAccountId`/`salePrice` fields only render when the (possibly
 * just-changed) `itemType === "RESALE"`. Switching AWAY from RESALE does
 * NOT attempt to null-clear either field — the backend only rejects a
 * RESALE item that's missing them, a non-RESALE item that still happens to
 * carry old values for either is explicitly fine (confirmed by reading
 * `ItemsService.assertResaleRequirements()` directly: the guard only fires
 * `if (itemType === "RESALE" && (...))`).
 *
 * **Honest gap: `preferredSupplierIds` has NO editor here, deliberately**
 * (unlike `create-item-dialog.tsx`'s own multi-select) — `ItemResponseDto`
 * does not expose the item's current preferred-supplier list at all
 * (confirmed by reading `item.dto.ts`'s own `ItemResponseDto` directly: no
 * such field), so this dialog has no way to pre-populate a diffable starting
 * state. Rendering the picker starting from an empty selection and sending
 * whatever the user picks would silently REPLACE (not merge into) the
 * item's real, already-set preferred suppliers the moment the dialog is
 * opened and saved even once with nothing touched — a real data-loss risk,
 * not a cosmetic gap — so this field is simply never touched by `UpdateItemDto`
 * here at all rather than shipping that risk. Fixing this properly would
 * need either a backend response-shape change (out of this frontend-only
 * part's scope) or a dedicated "current preferred suppliers" read path this
 * part doesn't have; flagged here rather than silently worked around.
 *
 * **Honest gap: `barcode` is not null-clearable from this dialog either** —
 * blanking the input back to empty simply OMITS the field from the PATCH
 * body (leaving the server-side value unchanged), it does not send `null`.
 * Same class of gap `edit-supplier-dialog.tsx`'s own `tradingName`/`kraPin`
 * doc comment already documents: `@klickit/contracts`'s zod-inferred
 * `UpdateItemDto.barcode` types as `string | undefined` (no `null`), so
 * `dto.barcode = null` is a genuine `tsc` error against that real type, not
 * a style choice — confirmed by a real `tsc --noEmit` failure caught while
 * writing this file.
 */
export function EditItemDialog({ item }: { item: ItemResponseDto }) {
  const t = useTranslations("inventory.items.editDialog");
  const tItemTypes = useTranslations("inventory.items.itemTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(item.name);
  const [categoryId, setCategoryId] = React.useState(item.categoryId);
  const [uom, setUom] = React.useState(item.uom);
  const [barcode, setBarcode] = React.useState(item.barcode ?? "");
  const [itemType, setItemType] = React.useState<ItemType>(item.itemType as ItemType);
  const [reorderLevel, setReorderLevel] = React.useState(item.reorderLevel ?? "");
  const [reorderQty, setReorderQty] = React.useState(item.reorderQty ?? "");
  const [glAssetAccountId, setGlAssetAccountId] = React.useState(item.glAssetAccountId);
  const [glExpenseAccountId, setGlExpenseAccountId] = React.useState(item.glExpenseAccountId);
  const [glIncomeAccountId, setGlIncomeAccountId] = React.useState(item.glIncomeAccountId ?? "");
  const [salePrice, setSalePrice] = React.useState(item.salePrice ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateItem();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts({ isActive: true });

  const isResale = itemType === "RESALE";

  function resetFromItem() {
    setName(item.name);
    setCategoryId(item.categoryId);
    setUom(item.uom);
    setBarcode(item.barcode ?? "");
    setItemType(item.itemType as ItemType);
    setReorderLevel(item.reorderLevel ?? "");
    setReorderQty(item.reorderQty ?? "");
    setGlAssetAccountId(item.glAssetAccountId);
    setGlExpenseAccountId(item.glExpenseAccountId);
    setGlIncomeAccountId(item.glIncomeAccountId ?? "");
    setSalePrice(item.salePrice ?? "");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetFromItem();
  }

  function handleItemTypeChange(next: ItemType) {
    setItemType(next);
  }

  const categoryItems = React.useMemo(() => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })), [categoriesQuery.data]);
  const postableAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );

  const reorderLevelValid = reorderLevel.trim() === "" || normalizeMoneyInput(reorderLevel) !== null;
  const reorderQtyValid = reorderQty.trim() === "" || normalizeMoneyInput(reorderQty) !== null;
  const resaleFieldsValid = !isResale || (normalizeMoneyInput(salePrice) !== null && !!glIncomeAccountId);
  const canSubmit =
    name.trim().length > 0 &&
    !!categoryId &&
    uom.trim().length > 0 &&
    !!glAssetAccountId &&
    !!glExpenseAccountId &&
    reorderLevelValid &&
    reorderQtyValid &&
    resaleFieldsValid &&
    !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateItemDto = {};
    if (name.trim() !== item.name) dto.name = name.trim();
    if (categoryId !== item.categoryId) dto.categoryId = categoryId;
    if (uom.trim() !== item.uom) dto.uom = uom.trim();
    if (itemType !== item.itemType) dto.itemType = itemType;
    if (glAssetAccountId !== item.glAssetAccountId) dto.glAssetAccountId = glAssetAccountId;
    if (glExpenseAccountId !== item.glExpenseAccountId) dto.glExpenseAccountId = glExpenseAccountId;

    const normalizedReorderLevel = normalizeMoneyInput(reorderLevel);
    if ((normalizedReorderLevel ?? "") !== (item.reorderLevel ?? "")) dto.reorderLevel = normalizedReorderLevel ?? undefined;
    const normalizedReorderQty = normalizeMoneyInput(reorderQty);
    if ((normalizedReorderQty ?? "") !== (item.reorderQty ?? "")) dto.reorderQty = normalizedReorderQty ?? undefined;

    // Honest gap, matching `edit-supplier-dialog.tsx`'s own documented
    // `tradingName`/`kraPin` precedent: `@klickit/contracts`'s zod-inferred
    // `UpdateItemDto.barcode` types as `string | undefined` (no `null` in
    // the union — the zod mirror didn't carry over the real class's
    // `nullable: true`), so blanking this field back to empty OMITS the key
    // entirely (leaving the server-side value unchanged) rather than
    // sending an explicit `null` to clear it — a real, minor, honest
    // limitation, not a `tsc`-forcing reason to add a cast-based
    // request-body workaround for this one field.
    if (barcode.trim() !== "" && barcode.trim() !== (item.barcode ?? "")) dto.barcode = barcode.trim();

    if (isResale) {
      if (glIncomeAccountId !== (item.glIncomeAccountId ?? "")) dto.glIncomeAccountId = glIncomeAccountId;
      const normalizedSalePrice = normalizeMoneyInput(salePrice);
      if ((normalizedSalePrice ?? "") !== (item.salePrice ?? "")) dto.salePrice = normalizedSalePrice ?? undefined;
    }

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: item.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { name: item.name })}</DialogTitle>
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
              <Label>{t("codeLabel")}</Label>
              <Input value={item.code} disabled />
              <p className="text-xs text-muted-foreground">{t("codeLockedHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("itemTypeLabel")}</Label>
              <Select value={itemType} onValueChange={(v) => handleItemTypeChange(v as ItemType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((it) => (
                    <SelectItem key={it} value={it}>
                      {tItemTypes(it)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("categoryLabel")}</Label>
              <Combobox
                items={categoryItems}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("categoryPlaceholder")}
                searchPlaceholder={t("categorySearchPlaceholder")}
                emptyText={t("categoryEmptyText")}
                disabled={categoriesQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("uomLabel")}</Label>
              <Input value={uom} maxLength={UOM_MAX_LENGTH} onChange={(e) => setUom(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("barcodeLabel")}</Label>
            <Input value={barcode} maxLength={BARCODE_MAX_LENGTH} onChange={(e) => setBarcode(e.target.value)} placeholder={t("barcodePlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("reorderLevelLabel")}</Label>
              <Input inputMode="decimal" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="0.0000" />
              {!reorderLevelValid && <p className="text-xs text-destructive">{t("invalidDecimal")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t("reorderQtyLabel")}</Label>
              <Input inputMode="decimal" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="0.0000" />
              {!reorderQtyValid && <p className="text-xs text-destructive">{t("invalidDecimal")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("glAssetAccountLabel")}</Label>
              <Combobox
                items={postableAccountItems}
                value={glAssetAccountId}
                onChange={setGlAssetAccountId}
                placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
                searchPlaceholder={t("searchAccounts")}
                emptyText={t("noAccountsFound")}
                disabled={accountsQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("glExpenseAccountLabel")}</Label>
              <Combobox
                items={postableAccountItems}
                value={glExpenseAccountId}
                onChange={setGlExpenseAccountId}
                placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
                searchPlaceholder={t("searchAccounts")}
                emptyText={t("noAccountsFound")}
                disabled={accountsQuery.isLoading}
              />
            </div>
          </div>

          {isResale && (
            <div className="space-y-3 rounded-lg border border-warning/30 bg-tint-warning p-3">
              <p className="text-xs font-medium text-foreground">{t("resaleFieldsHeading")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label required>{t("glIncomeAccountLabel")}</Label>
                  <Combobox
                    items={postableAccountItems}
                    value={glIncomeAccountId}
                    onChange={setGlIncomeAccountId}
                    placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
                    searchPlaceholder={t("searchAccounts")}
                    emptyText={t("noAccountsFound")}
                    disabled={accountsQuery.isLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>{t("salePriceLabel")}</Label>
                  <MoneyInput value={salePrice} onValueChange={(v) => setSalePrice(v ?? "")} />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("avgCostLabel")}</p>
            <p className="text-sm text-foreground">{item.avgCost}</p>
            <p className="text-xs text-muted-foreground">{t("avgCostHint")}</p>
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
