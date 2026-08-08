import { EntityManager } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
import { resolveControlAccount } from "../../billing";

/**
 * GL account resolution for `StockTakesService.post()`'s P-24 posting map
 * (docs/phase-2/01-functional-requirements.md; `docs/phase-5` Module 13 task
 * brief). Two resolvers:
 *
 *  - `resolveInventoryControlAccount()` — the `INVENTORY` control-domain
 *    account (`1200 Inventory` in `COA_TEMPLATE`, already seeded by Module 7).
 *    Reuses `domains/billing`'s exported `resolveControlAccount()` (via its
 *    barrel `index.ts`, never `domains/billing`'s application internals) per
 *    the task brief's own explicit instruction ("reused from domains/billing's
 *    barrel exactly as every other domain module already does" —
 *    `domains/wallet`'s `wallet-control-accounts.util.ts` established this
 *    exact precedent for `resolveWalletControlAccount()`). This is the SAME
 *    account `domains/procurement`'s `gl-grn-accounts.util.ts` duplicates a
 *    local copy of (`resolveInventoryControlAccount()`, there, because
 *    `domains/procurement`'s `mayImport` list does not include
 *    `domains/billing`) — `domains/inventory` DOES have `domains/billing` in
 *    its `mayImport` list (added by this pass, see `module-deps.json`), so
 *    reuse rather than a second local duplicate is the right call here.
 *  - `resolveStockLossExpenseAccount()` — P-24's expense-side account for a
 *    NET stock-take loss (debited) or credited back for a NET gain (see
 *    `StockTakesService.post()`'s own doc comment for the sign handling).
 *    Not one of the DDL's nine `control_domain` values (no `STOCK_LOSS`-shaped
 *    member exists in `gl_account`'s CHECK constraint), so — same treatment
 *    `WalletTransactionsService.resolveAdjustmentContraAccount()`/`gl-grn-
 *    accounts.util.ts`'s two fixed-code resolvers already established —
 *    resolved by a documented fixed `gl_account.code` instead. Seeded by this
 *    pass's own `0900` extension as a new `5xxx` expense leaf (`5070`, the
 *    next free code after Procurement's `5060 Purchase Price Variance` and
 *    before Wallet's `5090 Wallet Adjustment Contra`).
 *
 * Both throw `NotFoundException` (never silently fall back) if the account
 * hasn't been seeded, and `ConflictException` if it exists but isn't
 * active+postable — the same fail-loud posture every other domain module's
 * account resolvers established.
 */
export const STOCK_LOSS_EXPENSE_ACCOUNT_CODE = "5070";

export async function resolveInventoryControlAccount(
  glAccountRepository: GlAccountRepository,
  em?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveControlAccount(glAccountRepository, "INVENTORY", em);
}

export async function resolveStockLossExpenseAccount(
  glAccountRepository: GlAccountRepository,
  em?: EntityManager,
): Promise<GlAccountEntity> {
  const account = await glAccountRepository.findByCode(STOCK_LOSS_EXPENSE_ACCOUNT_CODE, em);
  if (!account) {
    throw new NotFoundException(
      "GlAccount(code)",
      `${STOCK_LOSS_EXPENSE_ACCOUNT_CODE} — "Stock Loss Expense" account; seed the Chart of Accounts (see this file's doc comment)`,
    );
  }
  if (!account.isActive || !account.isPostable) {
    throw new ConflictException(`GL account ${STOCK_LOSS_EXPENSE_ACCOUNT_CODE} exists but is not active+postable`);
  }
  return account;
}
