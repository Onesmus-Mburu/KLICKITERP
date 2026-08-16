/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — decimal-string percent
 * <-> fraction conversion for `StructureComponentLineDto.rate` (a decimal
 * FRACTION, e.g. `"0.15"` for 15%, per `salary-structures.service.ts`'s own
 * documented contract) versus what a user actually types into a percentage
 * field (e.g. `"15"`).
 *
 * Both directions are an EXACT decimal-point shift by 2 places (multiplying
 * or dividing by 100 = 10^2 is always an exact base-10 operation) —
 * implemented as pure string manipulation, never `parseFloat`/`Number()` /
 * `x * 100` / `x / 100`. This deliberately avoids the classic binary-float
 * round-trip drift (`0.29 * 100 === 29.000000000000004` in JS) — the exact
 * same class of bug `lib/money.ts`'s own `formatMoney()`/`sumMoneyStrings()`
 * (BigInt-scaled arithmetic) exist to avoid for monetary amounts, applied
 * here to a rate instead of a KES amount.
 */

const DECIMAL_STRING = /^(-?)(\d+)(?:\.(\d+))?$/;

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

function stripTrailingZeros(digits: string): string {
  return digits.replace(/0+$/, "");
}

/** Shifts a decimal string's point RIGHT by `places` (positive) or LEFT (negative) — exact, no rounding. Returns `null` for anything that doesn't match `DECIMAL_PATTERN`-shaped input. */
function shiftDecimalPoint(raw: string, places: number): string | null {
  const match = DECIMAL_STRING.exec(raw.trim());
  if (!match) return null;
  const [, sign, intPart, fracPart = ""] = match;

  let digits = intPart + fracPart;
  let pointPos = intPart.length + places;

  if (pointPos < 1) {
    digits = "0".repeat(1 - pointPos) + digits;
    pointPos = 1;
  }
  if (pointPos > digits.length) {
    digits = digits + "0".repeat(pointPos - digits.length);
  }

  const newIntPart = stripLeadingZeros(digits.slice(0, pointPos));
  const newFracPart = stripTrailingZeros(digits.slice(pointPos));
  const magnitude = newFracPart ? `${newIntPart}.${newFracPart}` : newIntPart;
  return sign === "-" && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

/** `"0.15"` -> `"15"` (a fraction, as stored in `rate`, to the percentage a user reads/types). `null` if `rate` isn't a valid decimal string. */
export function fractionToPercent(rate: string): string | null {
  return shiftDecimalPoint(rate, 2);
}

/** `"15"` -> `"0.15"` (a percentage a user typed, to the fraction `rate` expects). `null` if `percent` isn't a valid decimal string. */
export function percentToFraction(percent: string): string | null {
  return shiftDecimalPoint(percent, -2);
}
