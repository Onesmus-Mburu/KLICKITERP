import { EntityManager } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
import { ProcPaymentVoucherMethod } from "../domain/proc-payment-voucher.entity";

/**
 * Per-method "clearing account" resolution for P-21's credit side
 * (`PaymentVouchersService.execute()`), the same shape/purpose
 * `domains/payments/application/payment-clearing-accounts.util.ts`'s
 * `resolveClearingAccount()` established for receipt splits. That function is
 * exported from `domains/payments`' public barrel (`resolveClearingAccount`)
 * — the task brief invited importing it directly — but `domains/procurement`'s
 * `mayImport` list (`packages/config/eslint/module-deps.json`) does not
 * include `domains/payments` (only `shared`/`accounting`/`platform/settings`/
 * `platform/approvals`/`platform/users`/`platform/files`, unchanged from the
 * foundation pass), and a sibling-domain-to-sibling-domain import would be a
 * new, unprecedented edge in the dependency graph this pass has no mandate to
 * open. So this file replicates the same small per-method mapping locally,
 * exactly the same "duplicate rather than reach across `mayImport`" call
 * `gl-grn-accounts.util.ts` already made for `resolveControlAccount()`.
 *
 * Unlike Payments' own version, every code this map needs is ALREADY seeded:
 * `BANK` -> `1020` ("Bank - Operating Account"), `CASH` -> `1010` ("Petty
 * Cash"), `CHEQUE` -> `1030` ("Cheques in Transit") were all added to
 * `COA_TEMPLATE` by Payments' own PASS B seed extension, and `MPESA` resolves
 * via the pre-existing `MPESA_CLEARING` control domain (`1400 M-Pesa
 * Clearing`) — this pass's `0900` seed extension needs to add ZERO new rows
 * for payment-voucher clearing accounts (a genuine benefit of landing after
 * Payments PASS B).
 */
const METHOD_GL_CODE: Partial<Record<ProcPaymentVoucherMethod, string>> = {
  CASH: "1010",
  BANK: "1020",
  CHEQUE: "1030",
};

export async function resolveProcPaymentClearingAccount(
  glAccountRepository: GlAccountRepository,
  method: ProcPaymentVoucherMethod,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  switch (method) {
    case "MPESA": {
      const candidates = await glAccountRepository.findByControlDomain("MPESA_CLEARING", manager);
      const eligible = candidates.filter((account) => account.isActive && account.isPostable);
      if (eligible.length === 0) {
        throw new NotFoundException(
          "GlAccount(control_domain)",
          "MPESA_CLEARING — no active, postable gl_account is tagged with this control_domain; seed/configure the Chart of Accounts",
        );
      }
      if (eligible.length > 1) {
        throw new ValidationException(
          `GL configuration error: ${eligible.length} active, postable gl_account rows are tagged control_domain=MPESA_CLEARING (expected exactly one)`,
        );
      }
      return eligible[0];
    }
    case "CASH":
    case "BANK":
    case "CHEQUE": {
      const code = METHOD_GL_CODE[method];
      /* istanbul ignore next -- every CASH/BANK/CHEQUE key is populated above */
      if (!code) {
        throw new NotFoundException("GlAccount(clearing-account-map)", method);
      }
      const account = await glAccountRepository.findByCode(code, manager);
      if (!account) {
        throw new NotFoundException(
          "GlAccount(code)",
          `${code} — no gl_account seeded for payment voucher method ${method}'s clearing account`,
        );
      }
      if (!account.isActive || !account.isPostable) {
        throw new ValidationException(
          `resolveProcPaymentClearingAccount: gl_account ${code} (method ${method} clearing) is not active/postable`,
        );
      }
      return account;
    }
    /* istanbul ignore next -- exhaustive over ProcPaymentVoucherMethod, unreachable at the type level */
    default: {
      const exhaustive: never = method;
      throw new ValidationException(`resolveProcPaymentClearingAccount: unknown ProcPaymentVoucherMethod ${String(exhaustive)}`);
    }
  }
}
