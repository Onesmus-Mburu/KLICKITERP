/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — display-only
 * formatters for Inventory's TWO decimal precisions, both genuinely new to
 * this codebase and NEITHER `Money`-typed (unlike every other module's
 * amount fields, which are all scale-4 `Money`):
 *  - **Quantity** fields (`inv_item.reorder_level`/`.reorder_qty`,
 *    `inv_stock_balance.qty`, movement quantities, …) — `NUMERIC(14,4)`,
 *    plain decimal strings, `formatQty()` below (4dp).
 *  - **Cost** fields (`inv_item.avg_cost`, `inv_stock_balance` value-per-unit,
 *    …) — `NUMERIC(18,6)`, plain decimal strings, `formatCost()` below (6dp),
 *    FINER than the scale-4 `Money` type `lib/money.ts` formats. `avgCost` in
 *    particular is always server-computed — this app never renders an input
 *    for it, only ever this display formatter.
 *
 * Only `inv_item.salePrice` is genuinely `Money`-typed (scale 4) and uses the
 * existing `lib/money.ts` helpers (`formatMoney`/`sumMoneyStrings`) instead —
 * it is NOT formatted by either function in this file.
 *
 * Same string-only discipline `lib/money.ts`'s own doc comment establishes:
 * `parseFloat`/`Number()` is never used on a qty/cost value anywhere in this
 * file (a 6dp value, in particular, already exceeds `Number`'s safe-integer
 * round-trip guarantees for large quantities) — these are FORMAT-ONLY
 * helpers, string-in/string-out via plain string padding/slicing, never a
 * round trip through a numeric type, and never used to round-trip a value
 * back into a form for editing/storage (this codebase never client-side sums
 * or otherwise computes on cost fields at all — `avgCost` is always
 * server-computed, never client-set or client-summed, per this slice's own
 * scope). Values that already carry MORE fractional digits than the target
 * scale are TRUNCATED (never rounded) for display — this should not happen
 * in practice (the backend always emits exactly-scaled decimal strings), but
 * truncating rather than guessing at a rounding rule is the safer default
 * for a display-only helper that must never be mistaken for a real
 * arithmetic operation.
 */

const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDecimalString(value: string, scale: number): string {
  const trimmed = value.trim();
  if (!DECIMAL_STRING_PATTERN.test(trimmed)) return value;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";
  const fracPart = fracPartRaw.length >= scale ? fracPartRaw.slice(0, scale) : fracPartRaw.padEnd(scale, "0");

  const isZero = /^0*$/.test(intPart) && /^0*$/.test(fracPart);
  const sign = negative && !isZero ? "-" : "";
  const groupedInt = groupThousands(intPart);

  return scale > 0 ? `${sign}${groupedInt}.${fracPart}` : `${sign}${groupedInt}`;
}

/** Formats a quantity decimal string (`NUMERIC(14,4)`) for display at its real, full 4dp scale — never rounded down to 2dp the way `formatMoney()`'s display default does. */
export function formatQty(value: string): string {
  return formatDecimalString(value, 4);
}

/** Formats a cost decimal string (`NUMERIC(18,6)`, e.g. `inv_item.avgCost`) for display at its real, full 6dp scale. */
export function formatCost(value: string): string {
  return formatDecimalString(value, 6);
}
