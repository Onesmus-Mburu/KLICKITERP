import { EntityManager } from "typeorm";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
// Barrel import (a pure, DI-free utility function, not an entity-decorator
// target) — safe per the same "application-layer barrel import" precedent
// `domains/wallet`/`domains/inventory`/`domains/payroll`'s own
// `*-control-accounts.util.ts`/`gl-*-accounts.util.ts` files established for
// reusing `domains/billing`'s exported `resolveControlAccount()` rather than
// duplicating a local copy the way `domains/procurement`/`domains/expenses`
// had to (neither of those two modules' `mayImport` lists include
// `domains/billing`). `domains/banking`'s own `mayImport` list
// (module-deps.json) was extended with `domains/billing` for this.
import { resolveControlAccount } from "../../billing";

/**
 * GL account resolution for Module 16 (Banking)'s posting map (P-32/P-33
 * and the deposit/withdrawal "Undeposited Funds" design decision — see
 * `deposits.service.ts`'s own doc comment for the full rationale).
 *
 * `TRANSFER_CLEARING` (BR-BANK-01/P-32) is one of the DDL's own nine
 * `gl_account.control_domain` CHECK values — already seeded as `1500 Inter-
 * Account Transfer Clearing` by Module 7's own `COA_TEMPLATE` (0900 seed),
 * resolved here via `resolveControlAccount()` exactly like every other
 * control-domain lookup in this codebase (billing's AR_STUDENT/AR_SPONSOR,
 * wallet's WALLET, payroll's PAYROLL, ...).
 *
 * `UNDEPOSITED_FUNDS_ACCOUNT_CODE`/`BANK_CHARGES_EXPENSE_ACCOUNT_CODE`/
 * `INTEREST_INCOME_ACCOUNT_CODE` are NOT `control_domain` values (the DDL's
 * nine-member CHECK constraint has no dedicated slot for any of the three —
 * same treatment `1010`/`1020`/`1030`/`1040`/`2015`/`5050`/`5060`/`5070`/
 * `5090` already got in every prior module's own gap-closing seed
 * extension), so all three are plain `gl_account.code` lookups against this
 * pass's own `0900` seed extension. Next free slots: `1700` (asset, right
 * after Payroll's `1600 Staff Loans Receivable`), `5100` (expense, right
 * after Payroll's `5080 Employer Statutory Contributions Expense`), `4040`
 * (income, right after Billing's `4030 Other Income`).
 */
export const UNDEPOSITED_FUNDS_ACCOUNT_CODE = "1700";
export const BANK_CHARGES_EXPENSE_ACCOUNT_CODE = "5100";
export const INTEREST_INCOME_ACCOUNT_CODE = "4040";

export async function resolveTransferClearingAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveControlAccount(glAccountRepository, "TRANSFER_CLEARING", manager);
}

export async function resolveUndepositedFundsAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return glAccountRepository.findByCodeOrFail(UNDEPOSITED_FUNDS_ACCOUNT_CODE, manager);
}

export async function resolveBankChargesExpenseAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return glAccountRepository.findByCodeOrFail(BANK_CHARGES_EXPENSE_ACCOUNT_CODE, manager);
}

export async function resolveInterestIncomeAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return glAccountRepository.findByCodeOrFail(INTEREST_INCOME_ACCOUNT_CODE, manager);
}
