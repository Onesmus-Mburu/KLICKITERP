import { EntityManager } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
// Barrel import (a pure, DI-free utility function, not an entity-decorator
// target) — safe per the same "application-layer barrel import" precedent
// `InvoicingService`/`ConcessionsService` use for `domains/students`' own
// barrel. See `module-deps.json`'s `domains/payments` entry (`domains/billing`
// is in `mayImport`).
import { resolveControlAccount } from "../../billing";
import { PayReceiptSplitMethod } from "../domain/pay-receipt-split.entity";

/**
 * Per-method "clearing account" resolution for the P-08/P-09 debit side
 * (task brief "Control-account resolution" — the genuinely ambiguous part
 * the DDL leaves open). `gl_account.control_domain`'s CHECK list
 * (`accounting/domain/gl-account.entity.ts`) has exactly one member per
 * "electronic settlement channel that clears through a pooled account"
 * (`MPESA_CLEARING`, `TRANSFER_CLEARING`) but **no** dedicated
 * `control_domain` for CASH/BANK/CHEQUE/CARD/POS — those are ordinary
 * `gl_account.code` lookups against the seeded Chart of Accounts, the same
 * way any plain ledger account is referenced outside the control-account
 * mechanism.
 *
 * Resolution map, by `PayReceiptSplitMethod`:
 *  - `MPESA_STK` / `MPESA_C2B` / `MPESA_TILL` -> `control_domain = MPESA_CLEARING`
 *    (`resolveControlAccount`, same exactly-one-active-postable-account
 *    invariant `domains/billing` established for `AR_STUDENT`/`AR_SPONSOR`).
 *  - `BANK_TRANSFER` -> `control_domain = TRANSFER_CLEARING`.
 *  - `CASH` / `BANK` / `CHEQUE` / `CARD` / `POS` -> plain `gl_account.code`
 *    lookup via `METHOD_GL_CODE` below. **Pragmatic, hardcoded-for-now
 *    choice** (task brief explicitly leaves this open as a judgement call):
 *    `CASH` -> `1010` ("Petty Cash") and `BANK` -> `1020` ("Bank - Operating
 *    Account") both already exist in the seeded CoA
 *    (`0900-seed-permissions-and-roles.ts`). `CHEQUE` -> `1030` and
 *    `CARD`/`POS` -> `1040` do **not** exist in the seed yet — this pass
 *    deliberately does not touch `0900` (out of scope per the task brief), so
 *    a real cheque/card/POS receipt will throw `NotFoundException` here
 *    until a future pass (Pass B's seed extension, or a dedicated Settings-
 *    driven mapping) adds "Cheques Undeposited" (1030) and "Card/POS
 *    Clearing" (1040) to the Chart of Accounts. Unit tests mock
 *    `GlAccountRepository` so this gap does not block Pass A's test suite;
 *    it is a documented, honest forward gap for whoever extends the seed
 *    next, not a silent one. A future pass could also make this map
 *    Settings-configurable (mirroring `payments.session_variance_tolerance`)
 *    instead of hardcoded — noted here rather than done now, to keep this
 *    pass's scope to services + unit tests only.
 */
const METHOD_GL_CODE: Partial<Record<PayReceiptSplitMethod, string>> = {
  CASH: "1010",
  BANK: "1020",
  CHEQUE: "1030",
  CARD: "1040",
  POS: "1040",
};

export async function resolveClearingAccount(
  glAccountRepository: GlAccountRepository,
  method: PayReceiptSplitMethod,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  switch (method) {
    case "MPESA_STK":
    case "MPESA_C2B":
    case "MPESA_TILL":
      return resolveControlAccount(glAccountRepository, "MPESA_CLEARING", manager);
    case "BANK_TRANSFER":
      return resolveControlAccount(glAccountRepository, "TRANSFER_CLEARING", manager);
    case "WALLET":
      // Defense-in-depth only — `ReceiptsService.captureReceipt()` rejects
      // WALLET splits up front (Module 11/Wallet is not built yet), so this
      // branch should be unreachable in practice.
      throw new ValidationException(
        "resolveClearingAccount: WALLET is not a supported clearing-account method in this pass (Module 11/Wallet pending)",
      );
    case "CREDIT_BALANCE":
      // Phase 6 Slice 12 (Part D) — defense-in-depth only, same shape as
      // WALLET above: `ReceiptsService.captureReceipt()`'s
      // `validateSplitReferences()` rejects a manually-submitted
      // CREDIT_BALANCE split up front, so this branch should be unreachable
      // in practice. `applyStudentCreditToInvoices()` (the ONLY real
      // producer of a CREDIT_BALANCE split) never calls
      // `resolveClearingAccount()` at all — it resolves `PREPAYMENT`/
      // `AR_STUDENT` directly via `resolveControlAccount()` for its own P-10
      // posting, the debit side of THAT journal is the credit balance
      // itself, not a clearing account.
      throw new ValidationException(
        "resolveClearingAccount: CREDIT_BALANCE is not a supported clearing-account method — " +
          "applyStudentCreditToInvoices() posts its own P-10 journal directly, never through this resolver",
      );
    case "CASH":
    case "BANK":
    case "CHEQUE":
    case "CARD":
    case "POS": {
      const code = METHOD_GL_CODE[method];
      /* istanbul ignore next -- every CASH/BANK/CHEQUE/CARD/POS key is populated above */
      if (!code) {
        throw new NotFoundException("GlAccount(clearing-account-map)", method);
      }
      const account = await glAccountRepository.findByCode(code, manager);
      if (!account) {
        throw new NotFoundException(
          "GlAccount(code)",
          `${code} — no gl_account seeded for payment method ${method}'s clearing account ` +
            "(see payment-clearing-accounts.util.ts's METHOD_GL_CODE map); extend the Chart of Accounts seed to add it",
        );
      }
      if (!account.isActive || !account.isPostable) {
        throw new ValidationException(
          `resolveClearingAccount: gl_account ${code} (method ${method} clearing) is not active/postable`,
        );
      }
      return account;
    }
    /* istanbul ignore next -- exhaustive over PayReceiptSplitMethod, unreachable at the type level */
    default: {
      const exhaustive: never = method;
      throw new ValidationException(`resolveClearingAccount: unknown PayReceiptSplitMethod ${String(exhaustive)}`);
    }
  }
}
