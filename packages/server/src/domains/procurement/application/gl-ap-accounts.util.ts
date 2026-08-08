import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { GlAccountControlDomain, GlAccountEntity, GlAccountRepository } from "../../../accounting";

/**
 * GL account resolution for Pass B's P-20 (`SupplierInvoicesService.post()`)
 * and P-21 (`PaymentVouchersService.execute()`) posting maps — the AP
 * control account and the "Purchase Price Variance" leaf. Deliberately its
 * own small util file, separate from `gl-grn-accounts.util.ts` (Pass A) —
 * that file resolves the P-18/P-19 GRN-time accounts (`GRN_ACCRUAL`/
 * `PROCUREMENT_EXPENSE_WIP`); this one resolves the two accounts that only
 * come into play once an invoice/payment (not a GRN) is being posted, kept
 * separate for the same reason `domains/billing` split its own control-
 * account util from any GRN-shaped concern — no overlap in when each is
 * called.
 *
 * `resolveApSupplierControlAccount()` reuses `AP_SUPPLIER` — the SAME
 * `control_domain` `2010 Accounts Payable - Suppliers` `COA_TEMPLATE` leaf
 * `domains/billing` already seeded (`0900-seed-permissions-and-roles.ts`), via
 * the identical `findByControlDomain()`-based exactly-one-active-postable-
 * account resolution `domains/billing/application/gl-control-accounts.util.ts`'s
 * `resolveControlAccount()` established — duplicated locally rather than
 * imported for the same `mayImport` reason `gl-grn-accounts.util.ts`'s own
 * doc comment gives (`domains/procurement`'s `mayImport` list,
 * `packages/config/eslint/module-deps.json`, does not include
 * `domains/billing`). No new GL account needs seeding for this one — `2010`
 * already exists.
 *
 * `resolvePriceVarianceAccount()` — P-20's variance leaf (`5060 Purchase
 * Price Variance`), a plain fixed-`code` lookup exactly like
 * `gl-grn-accounts.util.ts`'s own `resolveGrnAccrualAccount()`/
 * `resolveProcurementExpenseAccount()` — not seeded in `COA_TEMPLATE` yet;
 * this pass's `0900` seed extension adds it.
 */
export const PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE = "5060";

export async function resolveApSupplierControlAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveByControlDomain(glAccountRepository, "AP_SUPPLIER", manager);
}

export async function resolvePriceVarianceAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveByCode(
    glAccountRepository,
    PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE,
    '"Purchase Price Variance" account — not yet in COA_TEMPLATE; this pass\'s 0900 seed extension must add it (see this file\'s doc comment)',
    manager,
  );
}

async function resolveByControlDomain(
  glAccountRepository: GlAccountRepository,
  domain: GlAccountControlDomain,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  const candidates = await glAccountRepository.findByControlDomain(domain, manager);
  const eligible = candidates.filter((account) => account.isActive && account.isPostable);
  if (eligible.length === 0) {
    throw new NotFoundException(
      "GlAccount(control_domain)",
      `${domain} — no active, postable gl_account is tagged with this control_domain; seed/configure the Chart of Accounts`,
    );
  }
  if (eligible.length > 1) {
    throw new ConflictException(
      `GL configuration error: ${eligible.length} active, postable gl_account rows are tagged control_domain=${domain} ` +
        `(expected exactly one) — ids: ${eligible.map((a) => a.id).join(", ")}`,
    );
  }
  return eligible[0];
}

async function resolveByCode(
  glAccountRepository: GlAccountRepository,
  code: string,
  notFoundHint: string,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  const account = await glAccountRepository.findByCode(code, manager);
  if (!account) {
    throw new NotFoundException("GlAccount(code)", `${code} — ${notFoundHint}`);
  }
  if (!account.isActive || !account.isPostable) {
    throw new ConflictException(`GL account ${code} exists but is not active+postable`);
  }
  return account;
}
