import { Money } from "../../../shared/money/money";

/**
 * Fixed-point decimal helpers for the two non-`Money` precisions this module
 * works with — physical quantity (`NUMERIC(14,4)`, scale 4, e.g. `inv_item.qty`/
 * `inv_movement.qty`/`inv_stock_balance.qty`) and weighted-average cost
 * (`NUMERIC(18,6)`, scale 6, e.g. `inv_item.avg_cost`/`inv_movement.unit_cost`).
 * Neither column is routed through `MoneyTransformer` at the entity layer
 * (see `InvItemEntity`'s doc comment) — `Money`'s hard-coded `SCALE = 4`
 * would silently truncate the cost columns' own deliberate extra decimal
 * digit, and using `Money` for physical quantities would be a category
 * error regardless (a quantity is not currency). This file is `StockMovementsService`/
 * `TransfersService`/`StockTakesService`'s shared arithmetic layer so none of
 * them hand-roll their own BigInt scaling — mirrors `shared/money/money.ts`'s
 * own internal `parseDecimalToScaled`/`divideWithRounding` shape exactly
 * (duplicated locally, not imported, since those are private to `Money` and
 * operate at a hard-coded scale of 4, not the scale-6 this module's cost
 * columns need for `computeWeightedAverageCost()`/`qtyTimesCostToMoney()`).
 */

const QTY_SCALE = 4;
const COST_SCALE = 6;
const COST_FACTOR = 10n ** BigInt(COST_SCALE);
const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

function parseScaled(input: string, scale: number): bigint {
  const trimmed = input.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(`decimal-qty.util: invalid decimal string "${input}"`);
  }
  const [, sign, intPart, fracPartRaw = ""] = match;
  const factor = 10n ** BigInt(scale);

  let fracDigits = fracPartRaw;
  let roundUp = false;
  if (fracDigits.length > scale) {
    const keep = fracDigits.slice(0, scale);
    const nextDigit = fracDigits.charCodeAt(scale) - 48;
    roundUp = nextDigit >= 5;
    fracDigits = keep;
  } else {
    fracDigits = fracDigits.padEnd(scale, "0");
  }

  let magnitude = BigInt(intPart) * factor + (fracDigits ? BigInt(fracDigits) : 0n);
  if (roundUp) magnitude += 1n;
  return sign === "-" && magnitude !== 0n ? -magnitude : magnitude;
}

function formatScaled(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const factor = 10n ** BigInt(scale);
  const intPart = abs / factor;
  const fracPart = abs % factor;
  const fracStr = fracPart.toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${intPart.toString()}.${fracStr}`;
}

/** HALF_UP rounding — same policy `Money`'s own default uses (NFR-INT-004). */
function roundDivHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError("decimal-qty.util: division by zero");
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const roundedAbs = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative && roundedAbs !== 0n ? -roundedAbs : roundedAbs;
}

// ---- Quantity (scale 4) -----------------------------------------------

export function qtyToScaled(qty: string): bigint {
  return parseScaled(qty, QTY_SCALE);
}

export function qtyFromScaled(scaled: bigint): string {
  return formatScaled(scaled, QTY_SCALE);
}

export function qtyAdd(a: string, b: string): string {
  return qtyFromScaled(qtyToScaled(a) + qtyToScaled(b));
}

export function qtySubtract(a: string, b: string): string {
  return qtyFromScaled(qtyToScaled(a) - qtyToScaled(b));
}

export function qtyNegate(a: string): string {
  return qtyFromScaled(-qtyToScaled(a));
}

export function qtyCompare(a: string, b: string): -1 | 0 | 1 {
  const x = qtyToScaled(a);
  const y = qtyToScaled(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

export function qtyIsZero(a: string): boolean {
  return qtyToScaled(a) === 0n;
}

export function qtyIsPositive(a: string): boolean {
  return qtyToScaled(a) > 0n;
}

export function qtyIsNegative(a: string): boolean {
  return qtyToScaled(a) < 0n;
}

// ---- Cost (scale 6) ------------------------------------------------------

export function costToScaled(cost: string): bigint {
  return parseScaled(cost, COST_SCALE);
}

export function costFromScaled(scaled: bigint): string {
  return formatScaled(scaled, COST_SCALE);
}

/**
 * `qty` (scale-4) * `unitCost` (scale-6) -> `Money` (scale-4), HALF_UP
 * rounded. The load-bearing valuation primitive every movement uses to turn
 * a physical quantity + a weighted-average cost into a ledger `value`.
 */
export function qtyTimesCostToMoney(qty: string, unitCost: string): Money {
  const qtyScaled = qtyToScaled(qty);
  const costScaled = costToScaled(unitCost);
  const productScaled10 = qtyScaled * costScaled; // implicit *10^10 (10^4 * 10^6)
  const valueScaled4 = roundDivHalfUp(productScaled10, COST_FACTOR); // /10^6 -> Money's own scale-4
  return Money.fromScaled(valueScaled4);
}

/**
 * Inverse of `qtyTimesCostToMoney()` — `value / qty` at scale-6, HALF_UP
 * rounded. `StockTakesService.post()` uses this to recover the per-unit cost
 * that reproduces a stock-take line's ALREADY-COMPUTED `variance_value`
 * (frozen at `submitForApproval()`/"review" time) exactly, so
 * `StockMovementsService.recordAdjustment()` — whose API shape is qty +
 * unitCost, matching every other movement type — books the identical value
 * the approval instance's `amount` was based on, rather than silently
 * re-deriving a possibly-drifted `avg_cost` at post() time.
 */
export function moneyDividedByQtyToCost(value: Money, qty: string): string {
  const valueScaled4 = value.toScaled();
  const qtyScaled4 = qtyToScaled(qty);
  if (qtyScaled4 === 0n) {
    throw new RangeError("moneyDividedByQtyToCost: qty is zero — cannot compute a per-unit cost");
  }
  const costScaled6 = roundDivHalfUp(valueScaled4 * COST_FACTOR, qtyScaled4);
  return costFromScaled(costScaled6);
}

/**
 * FR-INV-006.1 — `new_avg = (on_hand_value + receipt_value) / (on_hand_qty +
 * receipt_qty)`, returned as a scale-6 decimal string matching
 * `inv_item.avg_cost`/`inv_movement.unit_cost`'s own precision. Both value
 * arguments are `Money` (scale-4); both qty arguments are scale-4 decimal
 * strings — the ratio's implicit 10^4 factors cancel, so multiplying the
 * combined scale-4 value by 10^6 before dividing by the combined scale-4 qty
 * yields an exact scale-6 result with a single HALF_UP rounding step.
 */
export function computeWeightedAverageCost(
  onHandQty: string,
  onHandValue: Money,
  receiptQty: string,
  receiptValue: Money,
): string {
  const totalValueScaled4 = onHandValue.toScaled() + receiptValue.toScaled();
  const totalQtyScaled4 = qtyToScaled(onHandQty) + qtyToScaled(receiptQty);
  if (totalQtyScaled4 === 0n) {
    throw new RangeError(
      "computeWeightedAverageCost: combined on-hand + receipt quantity is zero — cannot compute an average cost",
    );
  }
  const avgScaled6 = roundDivHalfUp(totalValueScaled4 * COST_FACTOR, totalQtyScaled4);
  return costFromScaled(avgScaled6);
}
