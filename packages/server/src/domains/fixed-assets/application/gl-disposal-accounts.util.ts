import { EntityManager } from "typeorm";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";

/**
 * P-31 disposal wizard's GL account resolution for the two accounts NOT
 * already carried on `fa_category` (cost/accum-dep/dep-expense ARE on the
 * category, resolved directly by the caller from `category.glCostAccountId`/
 * `.glAccumDepAccountId` — these two are the ones that aren't). Plain
 * `gl_account.code` lookups — neither is one of the DDL's nine
 * `control_domain` CHECK values, the same "hardcoded code, not a control
 * domain" treatment every prior module's own gap-account util established
 * (e.g. `domains/inventory`'s `gl-inventory-accounts.util.ts`'s
 * `STOCK_LOSS_EXPENSE_ACCOUNT_CODE`).
 *
 * **`DISPOSAL_PROCEEDS_ACCOUNT_CODE`** — the task brief's own suggested
 * escape hatch ("resolve via domains/payments' clearing-account-style
 * resolution, or a simple documented default"). `domains/fixed-assets`'
 * `module-deps.json` `mayImport` entry does not list `domains/payments` (nor
 * `domains/banking`), so reaching for a cashier-session-aware or bank-account
 * -aware clearing resolver would mean widening this module's cross-module
 * dependency surface for a single account lookup — out of this pass's scope.
 * Disposal proceeds are booked straight to the already-seeded `1020 Bank -
 * Operating Account` leaf instead; a school that actually banked the proceeds
 * elsewhere can correct this with a follow-up bank transfer, same as any
 * other misbooked cash receipt.
 */
export const DISPOSAL_PROCEEDS_ACCOUNT_CODE = "1020";
export const GAIN_ON_DISPOSAL_ACCOUNT_CODE = "4050";
export const LOSS_ON_DISPOSAL_ACCOUNT_CODE = "5110";

export async function resolveDisposalProceedsAccount(
  repo: GlAccountRepository,
  em: EntityManager,
): Promise<GlAccountEntity> {
  return repo.findByCodeOrFail(DISPOSAL_PROCEEDS_ACCOUNT_CODE, em);
}

export async function resolveGainOnDisposalAccount(repo: GlAccountRepository, em: EntityManager): Promise<GlAccountEntity> {
  return repo.findByCodeOrFail(GAIN_ON_DISPOSAL_ACCOUNT_CODE, em);
}

export async function resolveLossOnDisposalAccount(repo: GlAccountRepository, em: EntityManager): Promise<GlAccountEntity> {
  return repo.findByCodeOrFail(LOSS_ON_DISPOSAL_ACCOUNT_CODE, em);
}
