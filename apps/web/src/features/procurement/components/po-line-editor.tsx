"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { formatMoney } from "@/lib/money";
import { ItemCombobox, type SelectedInventoryItem } from "@/features/inventory/components/item-combobox";
import { emptyPoLineRow, multiplyDecimalStrings, poLineRowsSubtotal, updatePoLineRow, type PoLineFormRow } from "../lib/po-lines";

const DESCRIPTION_MAX_LENGTH = 200; // PurchaseOrderLineDto.description / CreateQuotationLineDto.description's own @MaxLength(200).
const MIN_ROWS = 1; // both CreateQuotationDto.lines and CreatePurchaseOrderDto.lines are @ArrayNotEmpty() — at least one line is required either way.

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — a repeatable
 * description/qty/unit-price row editor, shared by BOTH
 * `create-quotation-dialog.tsx` and `create-po-dialog.tsx`/`revise-po-dialog.tsx`
 * (see `../lib/po-lines.ts`'s own doc comment for why one shape covers both
 * DTOs). Named `po-line-editor.tsx` per the task brief's own component list —
 * kept as that one file rather than a duplicate `quotation-line-editor.tsx`
 * since the two DTOs are structurally identical and a second copy would just
 * be a hand-duplicated fork of this same table.
 *
 * Deliberately simpler than `journal-line-editor.tsx` (Slice 17 Part 2, the
 * precedent this was asked to skim): no account/cost-center pickers, no
 * debit/credit clearing logic — just description/qty/unit price, matching
 * `CreateQuotationLineDto`/`PurchaseOrderLineDto`'s own real shape.
 *
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — an ADDITIONAL,
 * OPTIONAL `<ItemCombobox>` column, per this part's own explicit retrofit
 * scope: selecting an item sets that row's `itemId` (`../lib/po-lines.ts`'s
 * new optional field — previously always `undefined`/unset, since no
 * `inv_item` picker existed anywhere in this codebase before this part) and
 * convenience-prefills `description` with the item's own name IF
 * `description` is still empty (never overwrites text the user already
 * typed — a genuinely optional autofill, not a forced sync). Leaving this
 * column untouched preserves the EXACT prior behavior: `itemId` stays
 * `undefined`, `description` stays free text, `poLineRowsToDto()` omits the
 * key entirely — this is additive only, no existing behavior removed or
 * restructured.
 */
export function PoLineEditor({ rows, onChange }: { rows: PoLineFormRow[]; onChange: (rows: PoLineFormRow[]) => void }) {
  const t = useTranslations("procurement.lineEditor");

  function patchRow(key: string, patch: Partial<PoLineFormRow>) {
    onChange(updatePoLineRow(rows, key, patch));
  }

  function handleItemSelect(row: PoLineFormRow, item: SelectedInventoryItem | null) {
    if (!item) {
      patchRow(row.key, { itemId: undefined, itemLabel: undefined });
      return;
    }
    patchRow(row.key, {
      itemId: item.id,
      itemLabel: `${item.code} — ${item.name}`,
      ...(row.description.trim() === "" ? { description: item.name.slice(0, DESCRIPTION_MAX_LENGTH) } : {}),
    });
  }

  function addRow() {
    onChange([...rows, emptyPoLineRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  const subtotal = poLineRowsSubtotal(rows);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">{t("item")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead className="w-28">{t("qty")}</TableHead>
              <TableHead className="w-36">{t("unitPrice")}</TableHead>
              <TableHead className="w-32">{t("lineTotal")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="min-w-[200px]">
                  <ItemCombobox value={row.itemId ?? ""} valueLabel={row.itemLabel} onSelect={(item) => handleItemSelect(row, item)} />
                </TableCell>
                <TableCell className="min-w-[220px]">
                  <Input
                    value={row.description}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    onChange={(e) => patchRow(row.key, { description: e.target.value })}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </TableCell>
                <TableCell>
                  <Input inputMode="decimal" value={row.qty} onChange={(e) => patchRow(row.key, { qty: e.target.value })} />
                </TableCell>
                <TableCell>
                  <MoneyInput value={row.unitPrice} onValueChange={(v) => patchRow(row.key, { unitPrice: v ?? "" })} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatMoney(multiplyDecimalStrings(row.qty || "0", row.unitPrice || "0"))}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length <= MIN_ROWS}
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

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          {t("addLine")}
        </Button>
        <div className="text-sm">
          <span className="text-muted-foreground">{t("estimatedSubtotal")}: </span>
          <span className="font-medium text-foreground">{formatMoney(subtotal)}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("subtotalHint")}</p>
    </div>
  );
}
