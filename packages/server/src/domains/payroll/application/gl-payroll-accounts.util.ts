import { EntityManager } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
// Barrel import (a pure, DI-free utility, not an entity-decorator target) —
// same "application-layer barrel import" precedent `domains/payments`'/
// `domains/wallet`'s own clearing-/control-account utils use for
// `domains/billing`'s `resolveControlAccount()`. See `module-deps.json`'s
// `domains/payroll` entry (`domains/billing` added in PASS B specifically
// for this reuse).
import { resolveControlAccount } from "../../billing";
import { PyrlRunLinePaidVia } from "../domain/pyrl-run-line.entity";

/**
 * P-27/P-28 GL account map (docs/phase-2/01-functional-requirements.md,
 * task brief's own posting table). `0900-seed-permissions-and-roles.ts`
 * seeds every one of these codes into `COA_TEMPLATE` — see that migration's
 * own doc comment for the exact code choices (next free slot in each `1xxx`/
 * `2xxx`/`5xxx` range, checked against every prior module's own additions to
 * avoid collisions).
 *
 * `NET_PAY_PAYABLE` and the P-28 M-Pesa B2C clearing leg are resolved via
 * `resolveControlAccount()` against `gl_account.control_domain` (`PAYROLL`/
 * `MPESA_CLEARING` respectively — both already exist in the DDL's CHECK
 * constraint and were seeded by Module 7's foundation pass), exactly one
 * active+postable account expected per domain (that function's own
 * documented invariant). Every OTHER payroll-specific account below has no
 * dedicated `control_domain` value in the DDL (same situation
 * `1010`/`1020`/`1030`/`1040`/`2015`/`5050`/`5060`/`5070`/`5090` are already
 * in — see `0900`'s own `COA_TEMPLATE` doc comment), so those are plain
 * `gl_account.code` lookups.
 */
export const PAYROLL_EXPENSE_ACCOUNT_CODE = "5010"; // reuses the already-seeded "Salaries and Wages Expense"
export const EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE = "5080";
export const PAYE_PAYABLE_ACCOUNT_CODE = "2050";
export const NSSF_PAYABLE_ACCOUNT_CODE = "2060";
export const SHIF_PAYABLE_ACCOUNT_CODE = "2070";
export const AHL_PAYABLE_ACCOUNT_CODE = "2080";
export const OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE = "2090";
export const STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE = "1600";

/**
 * Plain `gl_account.code` lookup, active+postable-checked — the same
 * defense-in-depth `resolveClearingAccount()` (`domains/payments`) applies
 * to its own `METHOD_GL_CODE` map lookups, replicated here since
 * `PostingService.post()` itself re-validates postability/activity anyway
 * but a named, early `NotFoundException`/`ValidationException` here is a
 * much clearer failure than letting an unresolved account silently reach
 * `post()`'s own generic account-validation step.
 */
export async function resolvePayrollAccountByCode(
  glAccountRepository: GlAccountRepository,
  code: string,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  const account = await glAccountRepository.findByCode(code, manager);
  if (!account) {
    throw new NotFoundException(
      "GlAccount(code)",
      `${code} — no gl_account seeded for this payroll posting leg (see gl-payroll-accounts.util.ts); extend the Chart of Accounts seed (0900) to add it`,
    );
  }
  if (!account.isActive || !account.isPostable) {
    throw new ValidationException(`resolvePayrollAccountByCode: gl_account ${code} is not active/postable`);
  }
  return account;
}

/** P-27/P-28's Net Pay Payable — the already-seeded `2020 Payroll Liabilities` control-domain=`PAYROLL` account (Module 7's foundation CoA), reused per the task brief's explicit instruction rather than minting a new liability account. */
export async function resolveNetPayPayableAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveControlAccount(glAccountRepository, "PAYROLL", manager);
}

/**
 * P-28's debit-side "Bank" leg — resolved per disbursement method, mirroring
 * `domains/payments`' own `resolveClearingAccount()` PATTERN (that file
 * itself is not imported — `domains/payments` is not in `domains/payroll`'s
 * `mayImport` list, so this is a narrow, deliberately-duplicated local
 * equivalent, same judgement call `domains/procurement`'s/`domains/expenses`'
 * own clearing-account utils already made for the identical reason).
 * `BANK` -> plain `gl_account.code` lookup (`1020 Bank - Operating Account`,
 * already seeded). `CASH` -> plain `gl_account.code` lookup (`1010 Petty
 * Cash`, already seeded — a school paying a small cash payroll run through
 * the till is a real scenario). `MPESA_B2C` -> `control_domain=MPESA_CLEARING`
 * (`1400`, already seeded) via `resolveControlAccount()`, since Safaricom's
 * B2C payout clears through the same pooled clearing account every other
 * M-Pesa-settled flow in this codebase uses.
 *
 * **Documented forward gap** (task brief, "Banking should be aware..."):
 * this is an interim stand-in — once Module 16 (Banking) exists with real
 * `bank_account` entities, P-28 should resolve a REAL selected bank account
 * rather than this fixed CoA-code map, the same interim-clearing-account
 * pattern every module facing this exact forward gap has documented
 * (`domains/payments`' own `payment-clearing-accounts.util.ts` doc comment
 * names the identical `bank_account_id -> bank_account` gap).
 */
export async function resolveBankDisbursementAccount(
  glAccountRepository: GlAccountRepository,
  method: PyrlRunLinePaidVia,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  switch (method) {
    case "MPESA_B2C":
      return resolveControlAccount(glAccountRepository, "MPESA_CLEARING", manager);
    case "BANK":
      return resolvePayrollAccountByCode(glAccountRepository, "1020", manager);
    case "CASH":
      return resolvePayrollAccountByCode(glAccountRepository, "1010", manager);
    /* istanbul ignore next -- exhaustive over PyrlRunLinePaidVia, unreachable at the type level */
    default: {
      const exhaustive: never = method;
      throw new ValidationException(`resolveBankDisbursementAccount: unknown PyrlRunLinePaidVia ${String(exhaustive)}`);
    }
  }
}
