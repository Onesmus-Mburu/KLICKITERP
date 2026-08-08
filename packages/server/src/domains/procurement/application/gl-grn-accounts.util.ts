import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { GlAccountControlDomain, GlAccountEntity, GlAccountRepository } from "../../../accounting";

/**
 * GL account resolution for `GrnService.post()`'s P-18/P-19 posting map
 * (docs/phase-2/01-functional-requirements.md FR-PROC-006.1; docs/phase-5
 * Module 12 PASS A task brief). Two of the three accounts these resolvers
 * need are NOT yet part of the seeded Chart of Accounts (Module 7's
 * `0900-seed-permissions-and-roles.ts` `COA_TEMPLATE`) — this pass is
 * explicitly forbidden from touching the `0900` seed, so both are resolved
 * by a documented GL account `code` constant that **Pass B's seed extension
 * must add**, exactly the same "note it needs adding in Pass B's seed"
 * escape hatch the task brief itself offered:
 *
 *  - `resolveInventoryControlAccount()` — P-18 (stock items, `item_id` set).
 *    Reuses the ALREADY-seeded `control_domain='INVENTORY'` account (`1200
 *    Inventory` in `COA_TEMPLATE`) via the exact same
 *    `findByControlDomain()`-based resolution
 *    `domains/billing/application/gl-control-accounts.util.ts`'s
 *    `resolveControlAccount()` established — duplicated locally (not
 *    imported) because `domains/procurement`'s `mayImport` list
 *    (`packages/config/eslint/module-deps.json`) does not include
 *    `domains/billing`, and reaching into a sibling domain module for a
 *    generic accounting-core concern would be backwards regardless.
 *    **Currently unreachable in practice**: every `proc_po_line.item_id` in
 *    this codebase is NULL until Module 13 (Inventory) exists and populates
 *    it (the foundation pass's own documented gap) — `GrnService.post()`'s
 *    `if (poLine.itemId)` branch calling this resolver is therefore dead
 *    code today, kept correct and ready per the task brief's explicit
 *    instruction to build it anyway.
 *  - `resolveGrnAccrualAccount()` — the credit side of BOTH P-18 and P-19: a
 *    liability account distinct from `AP_SUPPLIER` (`2010` in
 *    `COA_TEMPLATE`) — "goods received, not yet supplier-invoiced" is a
 *    different obligation than "invoiced, not yet paid" (`AP_SUPPLIER`'s
 *    actual role per Pass B's future 3-way match), so it is deliberately NOT
 *    resolved via `AP_SUPPLIER`'s `control_domain`. No `GRN_ACCRUAL`-shaped
 *    `control_domain` value exists in `gl_account`'s CHECK constraint
 *    (`ck_gl_account_control_domain`, migration `0060`) — adding one would
 *    mean altering that constraint via a new migration, out of scope for an
 *    application-layer-only pass — so this resolves by a fixed account
 *    `code` instead, exactly like `resolveProcurementExpenseAccount()`
 *    below.
 *  - `resolveProcurementExpenseAccount()` — P-19's debit side (`item_id`
 *    NULL, the only branch actually exercised today, since every
 *    `proc_po_line.item_id` is currently NULL). The task brief invited
 *    resolving this via `proc_requisition_line.budget_line_id ->
 *    gl_budget_line.account_id` if that gives "a natural per-line expense
 *    account" — checked, and it does NOT: `proc_po_line` (what `GrnService`
 *    actually has in hand at GRN-posting time) carries no
 *    `requisition_line_id` column at all (see `proc-po-line.entity.ts` —
 *    only `po_id`/`line_no`/`item_id`/`description`/`qty`/`unit_price`/
 *    `received_qty`), so there is no persisted path from a PO line — let
 *    alone a GRN line — back to the specific requisition line whose
 *    `budget_line_id` would apply. Re-deriving that linkage would mean
 *    adding a new column to `proc_po_line`/`proc_grn_line` (a
 *    foundation-layer schema change, out of scope for "build on top of the
 *    foundation, don't redefine it"). This pass therefore resolves a single
 *    documented default account instead — a generic "Procurement Expense /
 *    Asset WIP" leaf — for every P-19 line, regardless of which
 *    requisition/budget line originated the PO.
 *
 * Both fixed-`code` lookups throw `NotFoundException` (never silently fall
 * back to some other account) if the account hasn't been seeded yet, and
 * `ConflictException` if it exists but isn't active+postable — the same
 * fail-loud posture `resolveControlAccount()` established for billing/
 * wallet's own control-account resolution.
 */
export const GRN_ACCRUAL_ACCOUNT_CODE = "2015";
export const PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE = "5050";

export async function resolveInventoryControlAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveByControlDomain(glAccountRepository, "INVENTORY", manager);
}

export async function resolveGrnAccrualAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveByCode(
    glAccountRepository,
    GRN_ACCRUAL_ACCOUNT_CODE,
    '"GRN Accrual" liability account — not yet in COA_TEMPLATE; Pass B\'s 0900 seed extension must add it (see this file\'s doc comment)',
    manager,
  );
}

export async function resolveProcurementExpenseAccount(
  glAccountRepository: GlAccountRepository,
  manager?: EntityManager,
): Promise<GlAccountEntity> {
  return resolveByCode(
    glAccountRepository,
    PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE,
    '"Procurement Expense / Asset WIP" account — not yet in COA_TEMPLATE; Pass B\'s 0900 seed extension must add it (see this file\'s doc comment)',
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
