"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateItemDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { useCategories } from "../hooks/use-categories";
import { useCreateItem } from "../hooks/use-items";

const CODE_MAX_LENGTH = 30; // inv_item.code is varchar(30) — inv-item.entity.ts.
const NAME_MAX_LENGTH = 120; // inv_item.name is varchar(120) — inv-item.entity.ts.
const UOM_MAX_LENGTH = 20; // inv_item.uom is varchar(20) — inv-item.entity.ts.
const BARCODE_MAX_LENGTH = 60; // inv_item.barcode is varchar(60) — inv-item.entity.ts.

const ITEM_TYPES = ["STOCK", "CONSUMABLE", "SERVICE", "RESALE"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — the item
 * create form: `code`/`name`/`uom` (plain text, `uom` has no controlled
 * vocabulary — a free string per this part's own brief), a required category
 * picker, an item-type select, optional `reorderLevel`/`reorderQty` (plain
 * qty-scale-4 decimal text inputs — NOT `<MoneyInput>`, these are physical
 * quantities per `inv-item.entity.ts`'s own doc comment, not currency),
 * optional barcode, an optional preferred-suppliers multi-select
 * (`@/components/ui/select`'s existing `MultiSelect`, reusing
 * `listSuppliers()` from `features/procurement/api/suppliers.api.ts`
 * directly per this part's own explicit instruction — no new supplier
 * wrapper), required `glAssetAccountId`/`glExpenseAccountId` pickers (reusing
 * `features/accounting/hooks/use-accounts.ts` from Slice 17, filtered
 * client-side to `isPostable && isActive`, the exact same filter
 * `journal-line-editor.tsx` already established for the identical "a
 * header/inactive account can never receive a posting" reasoning), and —
 * **BR-INV-04, enforced client-side, not just left server-rejectable** — a
 * `glIncomeAccountId` picker + `<MoneyInput salePrice>` that are ENTIRELY
 * HIDDEN (not merely optional-looking) unless `itemType === "RESALE"`, at
 * which point both become required for submit. `uomConversions` has no UI
 * anywhere in this dialog — explicitly out of this part's scope (arbitrary
 * jsonb, per the brief).
 *
 * `avgCost` never appears anywhere in this dialog — it doesn't exist yet at
 * creation time (`ItemsService.create()` always seeds it to `"0"`
 * server-side) and is never client-set.
 */
export function CreateItemDialog() {
  const t = useTranslations("inventory.items.createDialog");
  const tItemTypes = useTranslations("inventory.items.itemTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [uom, setUom] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [itemType, setItemType] = React.useState<ItemType>("STOCK");
  const [reorderLevel, setReorderLevel] = React.useState("");
  const [reorderQty, setReorderQty] = React.useState("");
  const [preferredSupplierIds, setPreferredSupplierIds] = React.useState<string[]>([]);
  const [glAssetAccountId, setGlAssetAccountId] = React.useState("");
  const [glExpenseAccountId, setGlExpenseAccountId] = React.useState("");
  const [glIncomeAccountId, setGlIncomeAccountId] = React.useState("");
  const [salePrice, setSalePrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateItem();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts({ isActive: true });
  const suppliersQuery = useSuppliers("ACTIVE");

  const isResale = itemType === "RESALE";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCode("");
      setName("");
      setCategoryId("");
      setUom("");
      setBarcode("");
      setItemType("STOCK");
      setReorderLevel("");
      setReorderQty("");
      setPreferredSupplierIds([]);
      setGlAssetAccountId("");
      setGlExpenseAccountId("");
      setGlIncomeAccountId("");
      setSalePrice("");
      setError(null);
    }
  }

  function handleItemTypeChange(next: ItemType) {
    setItemType(next);
    if (next !== "RESALE") {
      setGlIncomeAccountId("");
      setSalePrice("");
    }
  }

  const categoryItems = React.useMemo(() => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })), [categoriesQuery.data]);
  const postableAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );
  const supplierOptions = React.useMemo(
    () => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliersQuery.data],
  );

  const reorderLevelValid = reorderLevel.trim() === "" || normalizeMoneyInput(reorderLevel) !== null;
  const reorderQtyValid = reorderQty.trim() === "" || normalizeMoneyInput(reorderQty) !== null;
  const resaleFieldsValid = !isResale || (normalizeMoneyInput(salePrice) !== null && !!glIncomeAccountId);
  const canSubmit =
    code.trim().length > 0 &&
    name.trim().length > 0 &&
    !!categoryId &&
    uom.trim().length > 0 &&
    !!glAssetAccountId &&
    !!glExpenseAccountId &&
    reorderLevelValid &&
    reorderQtyValid &&
    resaleFieldsValid &&
    !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const normalizedReorderLevel = normalizeMoneyInput(reorderLevel);
    const normalizedReorderQty = normalizeMoneyInput(reorderQty);
    const dto: CreateItemDto = {
      code: code.trim(),
      name: name.trim(),
      categoryId,
      uom: uom.trim(),
      itemType,
      glAssetAccountId,
      glExpenseAccountId,
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      ...(normalizedReorderLevel !== null ? { reorderLevel: normalizedReorderLevel } : {}),
      ...(normalizedReorderQty !== null ? { reorderQty: normalizedReorderQty } : {}),
      ...(preferredSupplierIds.length > 0 ? { preferredSupplierIds } : {}),
      ...(isResale ? { glIncomeAccountId, salePrice: normalizeMoneyInput(salePrice) ?? "" } : {}),
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
              <Label required>{t("codeLabel")}</Label>
              <Input value={code} maxLength={CODE_MAX_LENGTH} onChange={(e) => setCode(e.target.value)} placeholder={t("codePlaceholder")} />
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
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
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
              <Input value={uom} maxLength={UOM_MAX_LENGTH} onChange={(e) => setUom(e.target.value)} placeholder={t("uomPlaceholder")} />
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

          <div className="space-y-1.5">
            <Label>{t("preferredSuppliersLabel")}</Label>
            <MultiSelect
              options={supplierOptions}
              selected={preferredSupplierIds}
              onChange={setPreferredSupplierIds}
              placeholder={suppliersQuery.isLoading ? t("loadingSuppliers") : t("preferredSuppliersPlaceholder")}
              disabled={suppliersQuery.isLoading}
            />
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
