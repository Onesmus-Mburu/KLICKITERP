import { normalizeMoneyInput } from "@/lib/money";
import type { SplitRowState } from "./capture-form-state";

function isPositiveDecimalString(value: string): boolean {
  return !value.trim().startsWith("-") && /[1-9]/.test(value);
}

/**
 * "Looks complete" — used by BOTH the F4 hotkey's own decision (append a new
 * row vs. focus the existing last one, per the plan's exact spec) AND the
 * capture form's overall submit-disabled check. Mirrors
 * `ReceiptsService.validateSplitReferences()`'s REAL server-side
 * per-method requirements exactly (confirmed by reading it, not guessed):
 * CHEQUE needs bankName+chequeNo+chequeDate+drawer; BANK/BANK_TRANSFER needs
 * bankAccountId+externalRef; CARD/POS needs externalRef; CASH/MPESA_* need
 * nothing extra beyond method+a positive amount.
 */
export function isSplitRowComplete(row: SplitRowState): boolean {
  if (!row.method) return false;
  const amount = normalizeMoneyInput(row.amount);
  if (!amount || !isPositiveDecimalString(amount)) return false;
  switch (row.method) {
    case "CHEQUE":
      return Boolean(row.chequeBankName.trim() && row.chequeNo.trim() && row.chequeDate && row.chequeDrawer.trim());
    case "BANK":
    case "BANK_TRANSFER":
      return Boolean(row.bankAccountId.trim() && row.externalRef.trim());
    case "CARD":
    case "POS":
      return Boolean(row.externalRef.trim());
    default:
      return true;
  }
}
