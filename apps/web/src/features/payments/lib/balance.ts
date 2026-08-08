import { sumMoneyStrings } from "@/lib/money";

/** Negates a `Money`-shaped decimal string by flipping its leading sign — a tiny, receipt-capture-local helper built on top of `sumMoneyStrings` (`lib/money.ts`) rather than a second shared money function, since "subtract" here is only ever used for this one live-balance check (BR-PAY-01). */
function negateDecimalString(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

/**
 * `total - Σsplits`, computed via `sumMoneyStrings`'s own BigInt-scale
 * technique (never `parseFloat`) — the LIVE client-side mirror of BR-PAY-01
 * (`Σsplits === total`), reacting on every keystroke to drive the capture
 * form's running-total indicator and its submit-disabled state. The server
 * independently re-validates this exactly (`ReceiptsService.captureReceipt()`'s
 * own check, mirroring the DB's deferred `trg_pay_splits_sum` constraint) —
 * this client-side check is real UX, never trusted as the sole enforcement.
 */
export function computeRemaining(total: string, splitAmounts: string[]): string {
  return sumMoneyStrings([total || "0", negateDecimalString(sumMoneyStrings(splitAmounts))]);
}

/** `sumMoneyStrings`/`computeRemaining` always emit a `0`/`-0`-prefixed decimal string for a genuine zero regardless of scale (`"0"`, `"0.0000"`, never a sign on true zero) — this checks for that shape without `parseFloat`. */
export function isZeroAmount(decimalString: string): boolean {
  return /^-?0+(\.0+)?$/.test(decimalString.trim());
}
