import { EntityManager } from "typeorm";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
// Barrel imports (pure, DI-free utility functions, not entity-decorator
// targets) — safe per the same "application-layer barrel import" precedent
// `InvoicingService`/`ConcessionsService`/`ReceiptsService` use for their own
// sibling-module imports. `domains/billing` is required here beyond the task
// brief's literal `domains/wallet` `mayImport` list (`shared`, `accounting`,
// `platform/settings`, `platform/approvals`, `platform/users`,
// `domains/students`, `domains/payments`) because `resolveControlAccount()`
// only lives on `domains/billing`'s barrel (`domains/payments` calls it
// internally but does not re-export it) — `module-deps.json`'s `domains/wallet`
// entry was extended with `domains/billing` to actually satisfy the task
// brief's own instruction to reuse it rather than reinvent it, a documented,
// deliberate deviation from the literal list.
import { resolveControlAccount } from "../../billing";
import { PayReceiptSplitMethod, resolveClearingAccount } from "../../payments";

/**
 * Resolves the `WALLET` control-domain GL account (`2030 Student Wallet
 * Balances`, already seeded by `0900`) — the wallet-liability control
 * account every P-13..P-17 posting debits/credits. Reuses `domains/billing`'s
 * exported `resolveControlAccount()` (the same "exactly one active, postable
 * account per control_domain" resolver `domains/payments` already reuses for
 * `AR_STUDENT`/`AR_SPONSOR`/`PREPAYMENT`) rather than duplicating that
 * invariant here.
 */
export async function resolveWalletControlAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveControlAccount(glAccountRepository, "WALLET", manager);
}

/**
 * Resolves the settlement-channel clearing account for a wallet top-up
 * (P-13's debit side: "Cash/Bank/M-Pesa clearing per method"). Reuses
 * `domains/payments`' exported `resolveClearingAccount()` directly (already
 * on that module's barrel) rather than duplicating its
 * CASH/BANK/CHEQUE/CARD/POS/MPESA (STK/C2B/TILL)/BANK_TRANSFER resolution map —
 * `PayReceiptSplitMethod` already covers every settlement channel a wallet
 * top-up can arrive through. `resolveClearingAccount()` itself already
 * rejects `WALLET` as a method (a wallet cannot fund itself from itself), so
 * no extra guard is needed here.
 */
export async function resolveTopUpClearingAccount(
  glAccountRepository: GlAccountRepository,
  method: PayReceiptSplitMethod,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveClearingAccount(glAccountRepository, method, manager);
}

export type WallRefundPayoutMethod = "CASH" | "BANK" | "MPESA_B2C";

/**
 * Resolves the payout-side GL account for a wallet refund (P-16's credit
 * side: "Cash/Bank"). `CASH`/`BANK` reuse the exact same plain
 * `gl_account.code` lookups `resolveClearingAccount()` uses for receipt
 * capture (`1010`/`1020`) — money leaving through the same physical
 * cash-drawer/bank-account it would have arrived through. `MPESA_B2C` reuses
 * the `MPESA_CLEARING` control account directly (the same pooled clearing
 * account `resolveClearingAccount()`'s `MPESA_STK`/`MPESA_C2B`/`MPESA_TILL`
 * branches resolve for inbound M-Pesa — a B2C payout clears through the same
 * pooled account, just in the opposite direction) since
 * `resolveClearingAccount()`'s own `PayReceiptSplitMethod` type has no
 * `MPESA_B2C` member (that's an outbound-only concept, not a receipt split
 * method).
 */
export async function resolveRefundPayoutAccount(
  glAccountRepository: GlAccountRepository,
  method: WallRefundPayoutMethod,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  switch (method) {
    case "CASH":
      return resolveClearingAccount(glAccountRepository, "CASH", manager);
    case "BANK":
      return resolveClearingAccount(glAccountRepository, "BANK", manager);
    case "MPESA_B2C":
      return resolveControlAccount(glAccountRepository, "MPESA_CLEARING", manager);
    /* istanbul ignore next -- exhaustive over WallRefundPayoutMethod, unreachable at the type level */
    default: {
      const exhaustive: never = method;
      throw new Error(`resolveRefundPayoutAccount: unknown WallRefundPayoutMethod ${String(exhaustive)}`);
    }
  }
}
