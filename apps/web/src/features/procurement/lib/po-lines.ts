import { normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — client-side line-row
 * state for `<PoLineEditor>`, mirroring `features/accounting/lib/journal-lines.ts`'s
 * own `JournalLineFormRow`/`updateJournalLineRow()` shape (Part 3's own read
 * of that file, per the task brief's explicit instruction to skim it first).
 *
 * **One row shape, reused for BOTH quotation lines and PO lines** —
 * `CreateQuotationLineDto` and `PurchaseOrderLineDto` are structurally
 * IDENTICAL (`{itemId?, description, qty, unitPrice}`, confirmed by reading
 * `quotation.dto.ts`/`purchase-order.dto.ts` directly), so
 * `create-quotation-dialog.tsx` imports this same file and
 * `<PoLineEditor>` component rather than a hand-duplicated
 * `QuotationLineEditor` — the same "shared by both create/edit dialogs"
 * reasoning `category-tags-input.tsx` (Part 1) already established for a
 * smaller case. No `itemId` field exists in this row shape at all — same
 * pragmatic choice `requisition-line-editor.tsx` (Part 2) already made and
 * documented: no `inv_item` picker exists anywhere in this codebase yet.
 *
 * **Line totals shown here are display-only, never sent to the server** —
 * `lib/money.ts` only exports addition-shaped decimal-string helpers
 * (`formatMoney`/`sumMoneyStrings`/`normalizeMoneyInput` — confirmed by
 * reading it directly, no multiply helper exists, the same gap
 * `requisition-line-editor.tsx`'s own doc comment already found). Unlike that
 * component (which reads the total off an ALREADY-EXISTING requisition's own
 * server-recomputed `totalEstimate` after each individual line mutation),
 * quotation/PO lines are captured ALL AT ONCE at creation — there is no
 * server round trip to read a running total back from while the user is
 * still composing the line list. `multiplyDecimalStrings()`/`poLineRowsSubtotal()`
 * below are a small, local, BigInt-scaled (never `parseFloat`) multiply
 * implementation for exactly this composition-time display need — the real,
 * authoritative `subtotal`/`taxAmount`/`total` are always server-computed on
 * the actual create/revise response, never trusted from this client-side
 * arithmetic.
 */
export interface PoLineFormRow {
  /** Client-only stable React key — never sent to the server. */
  key: string;
  description: string;
  qty: string;
  unitPrice: string;
}

export function emptyPoLineRow(): PoLineFormRow {
  return { key: crypto.randomUUID(), description: "", qty: "1", unitPrice: "" };
}

export function updatePoLineRow(rows: PoLineFormRow[], key: string, patch: Partial<PoLineFormRow>): PoLineFormRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

export function isPoLineRowComplete(row: PoLineFormRow): boolean {
  return row.description.trim().length > 0 && normalizeMoneyInput(row.qty) !== null && normalizeMoneyInput(row.unitPrice) !== null;
}

/** Converts committed form rows into the wire shape (`CreateQuotationLineDto[]`/`PurchaseOrderLineDto[]` — structurally identical, see this file's own doc comment). `normalizeMoneyInput` guards defense-in-depth, same as `journalLineRowsToDto()`. */
export function poLineRowsToDto(rows: PoLineFormRow[]): { description: string; qty: string; unitPrice: string }[] {
  return rows.map((row) => ({
    description: row.description.trim(),
    qty: normalizeMoneyInput(row.qty) ?? "0",
    unitPrice: normalizeMoneyInput(row.unitPrice) ?? "0",
  }));
}

function parseSignedDecimal(value: string): { negative: boolean; digits: bigint; scale: number } {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";
  return { negative, digits: BigInt(intPart + fracPartRaw || "0"), scale: fracPartRaw.length };
}

/** Display-only decimal multiply via BigInt-scaled arithmetic — see this file's own doc comment for why no shared `lib/money.ts` helper exists for this yet. */
export function multiplyDecimalStrings(a: string, b: string): string {
  const pa = parseSignedDecimal(normalizeMoneyInput(a) ?? "0");
  const pb = parseSignedDecimal(normalizeMoneyInput(b) ?? "0");
  const productDigits = pa.digits * pb.digits;
  const scale = pa.scale + pb.scale;
  const negative = pa.negative !== pb.negative && productDigits !== 0n;
  const digitsStr = productDigits.toString().padStart(scale + 1, "0");
  const intPart = digitsStr.slice(0, digitsStr.length - scale) || "0";
  const fracPart = scale > 0 ? digitsStr.slice(digitsStr.length - scale) : "";
  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/** Σ(qty × unitPrice) across every row — the composition-time "estimated subtotal" `<PoLineEditor>`'s footer shows, never the authoritative total (see this file's own doc comment). */
export function poLineRowsSubtotal(rows: PoLineFormRow[]): string {
  return sumMoneyStrings(rows.map((row) => multiplyDecimalStrings(row.qty || "0", row.unitPrice || "0")));
}
