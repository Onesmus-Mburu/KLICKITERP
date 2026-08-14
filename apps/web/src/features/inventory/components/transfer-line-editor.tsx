"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { emptyTransferLineRow, updateTransferLineRow, type TransferLineFormRow } from "../lib/transfer-lines";
import { ItemCombobox, type SelectedInventoryItem } from "./item-combobox";

const MIN_ROWS = 1; // IssueTransferDto.lines is @ArrayNotEmpty() — at least one line is required.

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — a
 * repeatable item/qty/unitCost row editor for `IssueTransferDto.lines`,
 * shaped after `features/procurement/components/po-line-editor.tsx` (this
 * part's own explicit precedent to follow) but simpler, per the task brief's
 * own line shape: no description field, no debit/credit split — just
 * `<ItemCombobox>` + two plain decimal inputs per row. `qty`/`unitCost` are
 * both plain `<Input inputMode="decimal">` fields, NOT `<MoneyInput>` — qty
 * is a physical quantity (scale 4) and unitCost is a cost basis (scale 6),
 * neither is `Money`-typed (this module's own established
 * `lib/decimal-qty.ts` precision split), matching `create-item-dialog.tsx`'s
 * own `reorderLevel`/`reorderQty` treatment.
 *
 * No computed line-value/subtotal column — see `lib/transfer-lines.ts`'s own
 * doc comment for why.
 */
export function TransferLineEditor({ rows, onChange }: { rows: TransferLineFormRow[]; onChange: (rows: TransferLineFormRow[]) => void }) {
  const t = useTranslations("inventory.transfers.lineEditor");

  function patchRow(key: string, patch: Partial<TransferLineFormRow>) {
    onChange(updateTransferLineRow(rows, key, patch));
  }

  function handleItemSelect(row: TransferLineFormRow, item: SelectedInventoryItem | null) {
    patchRow(row.key, item ? { itemId: item.id, itemLabel: `${item.code} — ${item.name}` } : { itemId: undefined, itemLabel: undefined });
  }

  function addRow() {
    onChange([...rows, emptyTransferLineRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">{t("item")}</TableHead>
              <TableHead className="w-32">{t("qty")}</TableHead>
              <TableHead className="w-36">{t("unitCost")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="min-w-[220px]">
                  <ItemCombobox value={row.itemId ?? ""} valueLabel={row.itemLabel} onSelect={(item) => handleItemSelect(row, item)} />
                </TableCell>
                <TableCell>
                  <Input inputMode="decimal" value={row.qty} onChange={(e) => patchRow(row.key, { qty: e.target.value })} placeholder="0.0000" />
                </TableCell>
                <TableCell>
                  <Input inputMode="decimal" value={row.unitCost} onChange={(e) => patchRow(row.key, { unitCost: e.target.value })} placeholder="0.000000" />
                </TableCell>
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

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" />
        {t("addLine")}
      </Button>
    </div>
  );
}
