import type { JournalLineInputDto } from "@klickit/contracts";
import { normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — client-side line-row state
 * and balance math for `<JournalLineEditor>`. Built on `lib/money.ts`'s
 * existing `sumMoneyStrings` (BigInt-scaled decimal-string arithmetic, never
 * `parseFloat`) — the same shared utility `features/payments/components/
 * collect-fees-flow.tsx` already uses for its own running-total indicator —
 * rather than a new money utility, per this slice's own plan instruction to
 * check for one first.
 *
 * `negateDecimalString`/the zero-check regex mirror
 * `features/payments/lib/balance.ts`'s own `computeRemaining`/`isZeroAmount`
 * exactly, duplicated locally (a 2-line helper) rather than imported
 * cross-feature — `features/accounting` doesn't import from
 * `features/payments` anywhere else in this codebase, and a 2-line helper
 * isn't worth promoting to `lib/money.ts` on its own for this one pass.
 */
export interface JournalLineFormRow {
  /** Client-only stable React key — never sent to the server. */
  key: string;
  accountId: string;
  costCenterId: string;
  /** Decimal string or `""` — exactly one of debit/credit may be non-empty per row, enforced by `updateJournalLineRow()` below. */
  debit: string;
  credit: string;
  memo: string;
}

export function emptyJournalLineRow(): JournalLineFormRow {
  return { key: crypto.randomUUID(), accountId: "", costCenterId: "", debit: "", credit: "", memo: "" };
}

function isZeroOrEmptyDecimal(value: string): boolean {
  if (value.trim() === "") return true;
  return /^-?0+(\.0+)?$/.test(value.trim());
}

/**
 * Applies a partial change to one row, then enforces "exactly one of
 * debit/credit is non-zero" — entering a real (non-zero) debit clears
 * credit on that same row and vice versa, matching the plan's own explicit
 * instruction. Non-mutating — returns a new array.
 */
export function updateJournalLineRow(rows: JournalLineFormRow[], key: string, patch: Partial<JournalLineFormRow>): JournalLineFormRow[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    if (patch.debit !== undefined && !isZeroOrEmptyDecimal(patch.debit)) next.credit = "";
    if (patch.credit !== undefined && !isZeroOrEmptyDecimal(patch.credit)) next.debit = "";
    return next;
  });
}

function negateDecimalString(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

/** `Σdebit - Σcredit` across every row, via `sumMoneyStrings`'s BigInt-scale technique — `"0"`-shaped (never `parseFloat`-derived) regardless of scale. */
export function journalLinesDifference(rows: JournalLineFormRow[]): string {
  const totalDebit = sumMoneyStrings(rows.map((r) => r.debit || "0"));
  const totalCredit = sumMoneyStrings(rows.map((r) => r.credit || "0"));
  return sumMoneyStrings([totalDebit, negateDecimalString(totalCredit)]);
}

export function journalLinesTotals(rows: JournalLineFormRow[]): { totalDebit: string; totalCredit: string; difference: string; balanced: boolean } {
  const totalDebit = sumMoneyStrings(rows.map((r) => r.debit || "0"));
  const totalCredit = sumMoneyStrings(rows.map((r) => r.credit || "0"));
  const difference = sumMoneyStrings([totalDebit, negateDecimalString(totalCredit)]);
  return { totalDebit, totalCredit, difference, balanced: isZeroOrEmptyDecimal(difference) && rows.some((r) => !isZeroOrEmptyDecimal(r.debit) || !isZeroOrEmptyDecimal(r.credit)) };
}

/** True once every row has an account picked and a real, non-zero debit or credit — the per-row completeness gate `canSubmit` also requires, alongside `journalLinesTotals().balanced`. */
export function isJournalLineRowComplete(row: JournalLineFormRow): boolean {
  if (!row.accountId) return false;
  const hasDebit = !isZeroOrEmptyDecimal(row.debit);
  const hasCredit = !isZeroOrEmptyDecimal(row.credit);
  return hasDebit !== hasCredit; // exactly one, not both, not neither
}

/** Converts committed form rows into the wire DTO shape — `normalizeMoneyInput` guards against a row whose debit/credit somehow isn't a clean decimal string reaching the request body (defense-in-depth; `isJournalLineRowComplete`/the balance check already gate submission before this runs). */
export function journalLineRowsToDto(rows: JournalLineFormRow[]): JournalLineInputDto[] {
  return rows.map((row) => ({
    accountId: row.accountId,
    ...(row.costCenterId ? { costCenterId: row.costCenterId } : {}),
    debit: normalizeMoneyInput(row.debit) ?? "0",
    credit: normalizeMoneyInput(row.credit) ?? "0",
    ...(row.memo.trim() ? { memo: row.memo.trim() } : {}),
  }));
}
