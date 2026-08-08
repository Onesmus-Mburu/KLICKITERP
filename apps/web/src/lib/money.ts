/**
 * Frontend counterpart to `packages/server/src/shared/money/money.ts`'s
 * `Money` value object. The backend serializes every monetary amount as a
 * decimal STRING at 4dp (e.g. `"1234.5600"`) — never a float — and this
 * file follows the same discipline on the way back: every function here
 * operates on the string via BigInt arithmetic, and `parseFloat`/`Number()`
 * is never used on a money value anywhere in this app (grep-checkable).
 *
 * TODO(currency): hardcoded to "KES" — no settings-driven currency source
 * exists yet anywhere in this codebase (flagged decision #4, Phase 6 Slice
 * 1). Whenever a real per-tenant currency setting is added on the backend,
 * this is the one place that should start reading it instead.
 */

export const DEFAULT_CURRENCY = "KES";

const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

const CURRENCY_SYMBOLS: Record<string, string> = {
  KES: "KSh",
};

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats a `Money.toDecimalString()`-shaped value (any scale) for display,
 * rounded HALF_UP to `fractionDigits` (default 2, the conventional display
 * precision — the underlying ledger value stays 4dp, this is presentation
 * only) using BigInt arithmetic throughout, never `parseFloat`.
 */
export function formatMoney(decimalString: string, options: { currency?: string; fractionDigits?: number } = {}): string {
  const { currency = DEFAULT_CURRENCY, fractionDigits = 2 } = options;
  if (!isValidDecimalString(decimalString)) {
    return decimalString;
  }

  const trimmed = decimalString.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";
  const sourceScale = fracPartRaw.length;
  const scaled = BigInt(intPart) * 10n ** BigInt(sourceScale) + (fracPartRaw ? BigInt(fracPartRaw) : 0n);

  let displayScaled: bigint;
  if (sourceScale <= fractionDigits) {
    displayScaled = scaled * 10n ** BigInt(fractionDigits - sourceScale);
  } else {
    const drop = sourceScale - fractionDigits;
    const divisor = 10n ** BigInt(drop);
    const quotient = scaled / divisor;
    const remainder = scaled % divisor;
    displayScaled = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }

  const factor = 10n ** BigInt(fractionDigits);
  const displayIntPart = displayScaled / factor;
  const displayFracPart = (displayScaled % factor).toString().padStart(fractionDigits, "0");
  const numberPart = fractionDigits > 0 ? `${groupThousands(displayIntPart.toString())}.${displayFracPart}` : groupThousands(displayIntPart.toString());
  const sign = negative && displayScaled !== 0n ? "-" : "";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;

  return `${sign}${symbol} ${numberPart}`;
}

export function isValidDecimalString(value: string): boolean {
  return DECIMAL_STRING_PATTERN.test(value.trim());
}

/**
 * Normalizes free-typed `<MoneyInput>` text (which may contain thousands
 * separators/whitespace) into a plain decimal string the API accepts, or
 * `null` if the input isn't a valid decimal at all. Never rounds/truncates —
 * that's the backend `Money`/DB `NUMERIC(18,4)` column's job.
 */
export function normalizeMoneyInput(raw: string): string | null {
  const stripped = raw.replace(/,/g, "").trim();
  if (stripped === "" || stripped === "-") return null;
  return isValidDecimalString(stripped) ? stripped : null;
}

/**
 * Phase 6 Slice 4 (Payments) — the one genuinely cross-cutting money helper
 * this slice adds to the SHARED `lib/money.ts` (not a payments-local file):
 * sums a list of `Money.toDecimalString()`-shaped decimal strings via BigInt
 * scaled arithmetic, mirroring `formatMoney()`'s own scale-normalization
 * technique above — never `parseFloat`/`Number()`. Every value is scaled up
 * to the widest fractional precision seen across the inputs (floored at 4dp,
 * matching the backend's own `NUMERIC(18,4)`/`Money` ledger scale), summed
 * as integers, then formatted back down to a decimal string at that same
 * scale — exact, no rounding (this is pure addition, not a display-rounding
 * operation the way `formatMoney()`'s 2dp default is).
 *
 * Invalid/unparseable entries are silently skipped (treated as contributing
 * nothing to the sum) rather than throwing — callers building a LIVE running
 * total from partially-typed form state (e.g. a split row whose amount field
 * is still empty or mid-edit) want a best-effort running total on every
 * keystroke, not a hard failure the moment one row isn't valid yet. Returns
 * `"0.0000"` for an empty or all-invalid input list.
 */
export function sumMoneyStrings(values: string[]): string {
  const DEFAULT_SCALE = 4;
  let scale = DEFAULT_SCALE;
  for (const v of values) {
    if (!isValidDecimalString(v)) continue;
    const fracLen = (v.trim().split(".")[1] ?? "").length;
    if (fracLen > scale) scale = fracLen;
  }

  const factor = 10n ** BigInt(scale);
  let total = 0n;
  for (const v of values) {
    if (!isValidDecimalString(v)) continue;
    const trimmed = v.trim();
    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
    const intPart = intPartRaw || "0";
    const fracPadded = fracPartRaw.padEnd(scale, "0");
    const scaled = BigInt(intPart) * factor + BigInt(fracPadded || "0");
    total += negative ? -scaled : scaled;
  }

  const negative = total < 0n;
  const abs = negative ? -total : total;
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(scale, "0");
  const sign = negative && abs !== 0n ? "-" : "";
  return scale > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}
