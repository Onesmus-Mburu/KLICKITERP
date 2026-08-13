import type { BudgetLineInputDto } from "@klickit/contracts";
import { normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — client-side line-row state
 * for `<CreateBudgetDialog>`'s repeatable "initial lines" table, in the same
 * spirit as `journal-lines.ts`'s `JournalLineFormRow` but genuinely simpler:
 * no debit/credit split (`BudgetLineInputDto` is a single `annualAmount`
 * decimal string per line, not a double-entry pair), so there's no
 * balance-math equivalent to `journalLinesTotals().balanced` here — just a
 * plain sum for the "total annual amount" display.
 *
 * **`periodPhasing` is deliberately NOT part of this row shape** — per the
 * plan's own explicit instruction ("month-by-month/term-by-term spread...
 * opaque to this pass... don't over-build a phasing UI"), every line created
 * through this file's `budgetLineRowsToDto()` sends a plain `{}`.
 * `BudgetLineInputDto.periodPhasing` is still genuinely reachable after
 * creation — `budget-line-editor.tsx`'s own edit-line dialog exposes it as a
 * free-form JSON textarea (the OTHER half of the plan's "textarea, or just
 * send `{}`" instruction), just not on this initial-creation path, where
 * asking for JSON before a budget even exists would be premature.
 */
export interface BudgetLineFormRow {
  /** Client-only stable React key — never sent to the server. */
  key: string;
  accountId: string;
  costCenterId: string;
  /** Decimal string or `""`. */
  annualAmount: string;
}

export function emptyBudgetLineRow(): BudgetLineFormRow {
  return { key: crypto.randomUUID(), accountId: "", costCenterId: "", annualAmount: "" };
}

/** True once a row has an account picked and a real, valid decimal amount — `canSubmit` also requires every row in the set to pass this. */
export function isBudgetLineRowComplete(row: BudgetLineFormRow): boolean {
  return !!row.accountId && normalizeMoneyInput(row.annualAmount) !== null;
}

/** `Σ annualAmount` across every row, via `sumMoneyStrings`'s BigInt-scale technique — never `parseFloat`. */
export function budgetLineRowsTotal(rows: BudgetLineFormRow[]): string {
  return sumMoneyStrings(rows.map((r) => r.annualAmount || "0"));
}

/** Converts committed form rows into `CreateBudgetDto.lines`' wire shape — `periodPhasing: {}` on every row, see this file's own doc comment above for why. */
export function budgetLineRowsToDto(rows: BudgetLineFormRow[]): BudgetLineInputDto[] {
  return rows.map((row) => ({
    accountId: row.accountId,
    ...(row.costCenterId ? { costCenterId: row.costCenterId } : {}),
    periodPhasing: {},
    annualAmount: normalizeMoneyInput(row.annualAmount) ?? "0",
  }));
}
