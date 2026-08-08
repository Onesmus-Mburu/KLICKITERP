import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
import { ExpVoucherMethod } from "../domain/exp-voucher.entity";

/**
 * `1015` — "Petty Cash Float" — a new asset leaf this pass adds to the
 * `0900` seed's `COA_TEMPLATE` (confirmed non-colliding with any existing
 * code: `1010`/`1020`/`1030`/`1040` are already taken by Payments/Wallet,
 * `1100`-`1500` are control accounts, so `1015` is the next free slot in the
 * `10xx` asset range, right after `1010 Petty Cash`). This is the P-26
 * REPLENISHMENT debit account and the `PETTY_CASH` method's resolved
 * "clearing account" below — distinct from `1010 Petty Cash` (a plain
 * till/cashbox account `payment-clearing-accounts.util.ts`'s `CASH` method
 * already resolves), since this module's petty cash is a *float* with its
 * own DDL-level ceiling/balance tracking, not the same account as an
 * ordinary cash receipt.
 */
export const PETTY_CASH_FLOAT_ACCOUNT_CODE = "1015";

/**
 * Per-`ExpVoucherMethod` clearing-account resolution for P-25's credit side
 * (task brief: "resolves the credit-side account for `exp_voucher.method`
 * ... reuse `domains/payments`' clearing-account resolution logic, imported
 * from its barrel if exported, else replicate the small mapping and
 * document why").
 *
 * **Why replicated, not imported**: `domains/payments` DOES export
 * `resolveClearingAccount()` from its barrel, but `domains/expenses`'
 * `mayImport` list (`packages/config/eslint/module-deps.json`) is
 * `["shared", "accounting", "platform/settings", "platform/approvals",
 * "platform/users", "platform/files"]` — `domains/payments` is not in it,
 * and the task brief's own instruction was explicit not to widen
 * `module-deps.json` beyond a genuine gap (this isn't one — expenses and
 * payments are siblings with no legitimate coupling, same reasoning
 * `ExpVoucherEntity`'s own doc comment gives for not taking a real FK to
 * `proc_supplier`). Beyond the import-boundary problem, `ExpVoucherMethod`
 * (`CASH|BANK|PETTY_CASH|MPESA|CHEQUE`) is also a materially different enum
 * from `PayReceiptSplitMethod` (`MPESA_STK|MPESA_C2B|MPESA_TILL|
 * BANK_TRANSFER|WALLET|CASH|BANK|CHEQUE|CARD|POS`) — `MPESA` has no exact
 * counterpart (payments splits M-Pesa three ways) and `PETTY_CASH` doesn't
 * exist on the payments side at all — so even with the import allowed, a
 * type-compatible pass-through isn't possible; a small local mapping is the
 * honest choice, kept in lock-step with payments' own account-code choices
 * for the three methods both enums share (`CASH`->`1010`, `BANK`->`1020`,
 * `CHEQUE`->`1030` — the exact codes `payment-clearing-accounts.util.ts`'s
 * `METHOD_GL_CODE` map already uses, confirmed against that file and the
 * `0900` seed's `COA_TEMPLATE`).
 */
const METHOD_GL_CODE: Partial<Record<ExpVoucherMethod, string>> = {
  CASH: "1010",
  BANK: "1020",
  CHEQUE: "1030",
  PETTY_CASH: PETTY_CASH_FLOAT_ACCOUNT_CODE,
};

export async function resolveExpenseClearingAccount(
  glAccountRepository: GlAccountRepository,
  method: ExpVoucherMethod,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  switch (method) {
    case "MPESA":
      return resolveMpesaClearingAccount(glAccountRepository, manager);
    case "CASH":
    case "BANK":
    case "CHEQUE":
    case "PETTY_CASH": {
      const code = METHOD_GL_CODE[method];
      /* istanbul ignore next -- every CASH/BANK/CHEQUE/PETTY_CASH key is populated above */
      if (!code) {
        throw new NotFoundException("GlAccount(clearing-account-map)", method);
      }
      const account = await glAccountRepository.findByCode(code, manager);
      if (!account) {
        throw new NotFoundException(
          "GlAccount(code)",
          `${code} — no gl_account seeded for expense method ${method}'s clearing account ` +
            "(see expense-clearing-accounts.util.ts's METHOD_GL_CODE map); extend the Chart of Accounts seed to add it",
        );
      }
      if (!account.isActive || !account.isPostable) {
        throw new ValidationException(
          `resolveExpenseClearingAccount: gl_account ${code} (method ${method} clearing) is not active/postable`,
        );
      }
      return account;
    }
    /* istanbul ignore next -- exhaustive over ExpVoucherMethod, unreachable at the type level */
    default: {
      const exhaustive: never = method;
      throw new ValidationException(`resolveExpenseClearingAccount: unknown ExpVoucherMethod ${String(exhaustive)}`);
    }
  }
}

/**
 * `MPESA` resolves via `control_domain='MPESA_CLEARING'` (the same account
 * `domains/payments`' `resolveClearingAccount()` resolves for its own
 * `MPESA_STK`/`MPESA_C2B`/`MPESA_TILL` methods, and `domains/billing`'s
 * `resolveControlAccount()` implements generically) — replicated locally
 * (rather than imported from `domains/billing`, also not in this module's
 * `mayImport` list) since `accounting`'s own `GlAccountRepository` already
 * exposes `findByControlDomain()`, so the exactly-one-active-postable-match
 * invariant is a ~15-line local helper, not a real dependency.
 */
async function resolveMpesaClearingAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  const candidates = await glAccountRepository.findByControlDomain("MPESA_CLEARING", manager);
  const eligible = candidates.filter((account) => account.isActive && account.isPostable);
  if (eligible.length === 0) {
    throw new NotFoundException(
      "GlAccount(control_domain)",
      "MPESA_CLEARING — no active, postable gl_account is tagged with this control_domain; seed/configure the Chart of Accounts",
    );
  }
  if (eligible.length > 1) {
    throw new ConflictException(
      `GL configuration error: ${eligible.length} active, postable gl_account rows are tagged control_domain=MPESA_CLEARING ` +
        `(expected exactly one) — ids: ${eligible.map((a) => a.id).join(", ")}`,
    );
  }
  return eligible[0];
}
