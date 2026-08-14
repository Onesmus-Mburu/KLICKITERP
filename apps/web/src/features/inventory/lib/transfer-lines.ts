import { isValidDecimalString } from "@/lib/money";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) —
 * client-side line-row state for `<TransferLineEditor>`, mirroring
 * `features/procurement/lib/po-lines.ts`'s own `PoLineFormRow`/
 * `updatePoLineRow()` shape (that file's own precedent, per this part's own
 * instruction to follow it). Deliberately simpler than `po-lines.ts`, per the
 * task brief's own explicit line shape: item + qty + unitCost only, no
 * description field, no debit/credit split — `IssueTransferLineDto`'s real
 * shape has no `description` field at all (confirmed by reading
 * `transfer.dto.ts` directly), so unlike `PoLineFormRow` there is no
 * free-text fallback for an unselected item — **`itemId` is required, not
 * optional, on this row shape** (Transfers has no "no item picker existed
 * yet" legacy state to stay backward-compatible with, since `<ItemCombobox>`
 * already existed when this part started).
 *
 * No computed line-value/subtotal column is shown by `<TransferLineEditor>`
 * (unlike `<PoLineEditor>`'s own `formatMoney(qty × unitPrice)` footer) — a
 * deliberate scope decision: `qty` is scale-4 and `unitCost` is scale-6, so
 * their product is a genuinely new scale-10 decimal shape with no existing
 * formatter (`lib/decimal-qty.ts`'s `formatCost()` truncates to 6dp,
 * `lib/money.ts`'s helpers are all scale-4/Money-typed) — inventing a new
 * truncation/rounding convention for a display-only preview number that
 * isn't part of `IssueTransferDto`'s own wire shape anyway wasn't judged
 * worth the risk of a subtle formatting bug in a rarely-exercised corner;
 * the task brief's own line-shape description ("no debit/credit split, just
 * item+qty+unitCost per row") doesn't call for one either.
 */
export interface TransferLineFormRow {
  /** Client-only stable React key — never sent to the server. */
  key: string;
  /** Set via `<ItemCombobox>` — required for a row to be submittable (`isTransferLineRowComplete()`), but starts unset on a fresh row. */
  itemId?: string;
  /** Client-only display cache for `<ItemCombobox>`'s own trigger label (`"${code} — ${name}"`) — never sent to the server. */
  itemLabel?: string;
  /** Decimal string, scale 4 — must be POSITIVE (`IssueTransferLineDto.qty`'s own `@ApiProperty` description, and `TransfersService.issue()`'s real `qtyIsPositive()` check), enforced client-side by `isTransferLineRowComplete()` below, not just left for the server's own 422. */
  qty: string;
  /** Decimal string, scale <=6 — the cost basis this line moves stock at. No positivity check on this one: `TransfersService.issue()`/`IssueTransferLineDto` place no such constraint on `unitCost` (confirmed by reading both directly) — a zero cost basis is a real, valid input (e.g. a free/donated item), so this file doesn't invent a stricter rule than the server actually enforces. */
  unitCost: string;
}

export function emptyTransferLineRow(): TransferLineFormRow {
  return { key: crypto.randomUUID(), qty: "", unitCost: "" };
}

export function updateTransferLineRow(rows: TransferLineFormRow[], key: string, patch: Partial<TransferLineFormRow>): TransferLineFormRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

/** Positive (never zero/negative), decimal-string check — never `parseFloat`/`Number()`, mirrors `lib/money.ts`'s own no-float discipline: a valid decimal string with at least one non-zero digit and no leading `-`. */
function isPositiveDecimalString(value: string): boolean {
  const trimmed = value.trim();
  if (!isValidDecimalString(trimmed) || trimmed.startsWith("-")) return false;
  return /[1-9]/.test(trimmed);
}

export function isTransferLineRowComplete(row: TransferLineFormRow): boolean {
  return !!row.itemId && isPositiveDecimalString(row.qty) && isValidDecimalString(row.unitCost);
}

/** Converts committed form rows into `IssueTransferDto["lines"]`'s real wire shape. Callers (`<TransferForm>`) only invoke this once every row has already passed `isTransferLineRowComplete()`, so `itemId` is guaranteed set here — the non-null assertion mirrors that same invariant `journal-lines.ts`'s own `journalLineRowsToDto()` relies on for its own pre-validated rows. */
export function transferLineRowsToDto(rows: TransferLineFormRow[]): { itemId: string; qty: string; unitCost: string }[] {
  return rows.map((row) => ({ itemId: row.itemId as string, qty: row.qty.trim(), unitCost: row.unitCost.trim() }));
}
