import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";
import {
  INFONEY_DEFAULT_DOCUMENT_CONFIG,
  INFONEY_DEFAULT_LOGIN_CONFIG,
  INFONEY_DEFAULT_THEME_NAME,
  INFONEY_DEFAULT_THEME_TOKENS,
} from "../platform/branding/application/infoney-default-theme";
import { LATE_FEE_INCOME_CATEGORY_NAME, BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE } from "../domains/billing/application/late-fee-batches.service";
import { GL_BUDGET_APPROVAL_DOMAIN_CODE } from "../accounting/application/budgets.service";
import { BILLING_CONCESSION_APPROVAL_DOMAIN_CODE } from "../domains/billing/application/concessions.service";
import { BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE } from "../domains/billing/application/credit-notes.service";
import { REFUNDS_APPROVAL_DOMAIN_CODE } from "../domains/billing/application/refund-vouchers.service";
import { PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE } from "../domains/payments/application/receipts.service";
import { BOUNCE_FEE_CATEGORY_NAME } from "../domains/payments/application/cheques.service";
import {
  WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
  WALLET_REFUND_APPROVAL_DOMAIN_CODE,
  WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
} from "../domains/wallet/application/wallet-transactions.service";
import { PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE } from "../domains/procurement/application/requisitions.service";
import { PROCUREMENT_PO_APPROVAL_DOMAIN_CODE } from "../domains/procurement/application/purchase-orders.service";
import { SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE } from "../domains/procurement/application/payment-vouchers.service";
import { STOCK_ADJUSTMENTS_APPROVAL_DOMAIN_CODE } from "../domains/inventory/application/stock-takes.service";
import { STOCK_LOSS_EXPENSE_ACCOUNT_CODE } from "../domains/inventory/application/gl-inventory-accounts.util";
import { EXPENSES_APPROVAL_DOMAIN_CODE } from "../domains/expenses/application/vouchers.service";
import { PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE } from "../domains/expenses/application/petty-cash.service";
import { EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE } from "../domains/expenses/application/claims.service";
import { PETTY_CASH_FLOAT_ACCOUNT_CODE } from "../domains/expenses/application/expense-clearing-accounts.util";
import { STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE } from "../domains/expenses/application/claims.service";
import { PAYROLL_LOANS_APPROVAL_DOMAIN_CODE } from "../domains/payroll/application/loans.service";
import {
  AHL_COMPONENT_CODE,
  BASIC_COMPONENT_CODE,
  LOAN_RECOVERY_COMPONENT_CODE,
  NSSF_COMPONENT_CODE,
  PAYE_COMPONENT_CODE,
  PAYROLL_RUN_APPROVAL_DOMAIN_CODE,
  SHIF_COMPONENT_CODE,
} from "../domains/payroll/application/payroll-runs.service";
import {
  AHL_PAYABLE_ACCOUNT_CODE,
  EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE,
  NSSF_PAYABLE_ACCOUNT_CODE,
  OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE,
  PAYE_PAYABLE_ACCOUNT_CODE,
  SHIF_PAYABLE_ACCOUNT_CODE,
  STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE,
} from "../domains/payroll/application/gl-payroll-accounts.util";
import { BANK_TRANSFERS_APPROVAL_DOMAIN_CODE } from "../domains/banking/application/bank-transfers.service";
import { BANK_DEPOSITS_APPROVAL_DOMAIN_CODE } from "../domains/banking/application/deposits.service";
import { BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE } from "../domains/banking/application/withdrawals.service";
import {
  BANK_CHARGES_EXPENSE_ACCOUNT_CODE,
  INTEREST_INCOME_ACCOUNT_CODE,
  UNDEPOSITED_FUNDS_ACCOUNT_CODE,
} from "../domains/banking/application/gl-banking-accounts.util";
import { DEPRECIATION_APPROVAL_DOMAIN_CODE } from "../domains/fixed-assets/application/depreciation-runs.service";
import { ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE } from "../domains/fixed-assets/application/disposal.service";
import { ASSET_VERIFICATION_APPROVAL_DOMAIN_CODE } from "../domains/fixed-assets/application/verification.service";
import {
  GAIN_ON_DISPOSAL_ACCOUNT_CODE,
  LOSS_ON_DISPOSAL_ACCOUNT_CODE,
} from "../domains/fixed-assets/application/gl-disposal-accounts.util";

const SYSTEM_ADMIN_ROLE = "System Admin";
const AUDITOR_ROLE = "Auditor";

/**
 * Module 9 (Billing) PASS B — every `appr_workflow_def.domain_code` a domain
 * module has registered a single-level, ROLE-based (System Admin, SEQUENTIAL,
 * quorum=1) approval workflow for, closing the "no appr_workflow_def
 * registered" bootstrapping gap `ApprovalEngineService.submit()` otherwise
 * hits at runtime (see Module 6/7's design notes and Module 9 PASS A's own
 * `ConcessionsService` doc comment). `GL_BUDGET_APPROVAL_DOMAIN_CODE` closes
 * Module 7's own deliberately-deferred gap (`BudgetsService.submitForApproval()`);
 * the other four are Module 9's own services
 * (`ConcessionsService` from PASS A, `CreditNotesService`/`RefundVouchersService`/
 * `LateFeeBatchesService` from PASS B). Every domain code is imported from its
 * owning service's own exported constant (not re-typed as a literal here) so
 * this seed and the services that call `ApprovalEngineService.submit()` can
 * never drift apart — same "shared source of truth" convention as
 * `INFONEY_DEFAULT_THEME_NAME`/`LATE_FEE_INCOME_CATEGORY_NAME` above. No
 * `appr_routing_rule` rows are seeded for any of these —
 * `ApprovalEngineService`'s documented fallback applies ALL of a version's
 * levels when no routing rule matches, which for a single-level workflow is
 * exactly the one level defined below.
 */
const SINGLE_LEVEL_WORKFLOW_SEEDS: readonly { domainCode: string; name: string }[] = [
  { domainCode: GL_BUDGET_APPROVAL_DOMAIN_CODE, name: "Budget Approval" },
  { domainCode: BILLING_CONCESSION_APPROVAL_DOMAIN_CODE, name: "Fee Concession Approval" },
  { domainCode: BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE, name: "Credit Note Approval" },
  { domainCode: REFUNDS_APPROVAL_DOMAIN_CODE, name: "Refund Voucher Approval" },
  { domainCode: BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE, name: "Late Fee Batch Approval" },
  // Module 10 (Payments) PASS B — BR-PAY-08 receipt reversals and BR-PAY-07
  // suspense-item refunds both attach to this one workflow (see
  // `ReceiptsController`/`SuspenseController`'s own doc comments for why a
  // single PAYMENT_REVERSALS domain code covers both entity types).
  { domainCode: PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE, name: "Payment Reversal Approval" },
  // Module 11 (Wallet) — FR-WALL-013.1/BR-WALL-05: wallet-to-fees/wallet-to-wallet
  // transfers above the threshold, refunds (always), and adjustments (always)
  // each attach to their own single-level workflow (three distinct domain
  // codes, unlike Payments' one-workflow-covers-two-entity-types shape,
  // because these three are genuinely different operations with different
  // entity types — see `wallet-transactions.service.ts`'s own doc comment).
  { domainCode: WALLET_TRANSFER_APPROVAL_DOMAIN_CODE, name: "Wallet Transfer Approval" },
  { domainCode: WALLET_REFUND_APPROVAL_DOMAIN_CODE, name: "Wallet Refund Approval" },
  { domainCode: WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE, name: "Wallet Adjustment Approval" },
  // Module 12 (Procurement) PASS B — closes PASS A's own documented
  // bootstrapping gap (`RequisitionsService`/`PurchaseOrdersService` already
  // called `ApprovalEngineService.submit()` under these two domain codes) and
  // adds the new `SUPPLIER_PAYMENTS` chain `PaymentVouchersService` needs —
  // FR-PROC-008.1 calls it "amount-tiered", but real amount-tiered routing
  // needs school-specific approver roles this codebase's seed doesn't have
  // yet, so this is the same single-level System-Admin workflow every other
  // domain code in this list gets (see `PaymentVouchersService`'s own doc
  // comment).
  { domainCode: PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE, name: "Procurement Requisition Approval" },
  { domainCode: PROCUREMENT_PO_APPROVAL_DOMAIN_CODE, name: "Procurement PO Approval" },
  { domainCode: SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE, name: "Supplier Payment Approval" },
  // Module 13 (Inventory) — FR-INV-009.1: a stock-take's counted variance
  // always needs an approved STOCK_ADJUSTMENTS instance before
  // `StockTakesService.post()` will realize P-24, closing this module's own
  // bootstrapping gap the same way every other domain module's first pass
  // does (see `StockTakesService.submitForApproval()`'s own doc comment).
  { domainCode: STOCK_ADJUSTMENTS_APPROVAL_DOMAIN_CODE, name: "Stock Adjustment Approval" },
  // Module 14 (Expenses) — three distinct domain codes for three distinct
  // entity types (`exp_voucher`/`exp_replenishment`/`exp_claim`), same
  // "one workflow per genuinely different operation" shape Wallet's three
  // codes established, rather than Payments' one-workflow-covers-two-types
  // shape (these three have nothing in common beyond all belonging to this
  // module). FR-EXP-002.1 calls the EXPENSES chain "amount-tiered" — same
  // "single-level System-Admin workflow for now, real tiers are future
  // work" treatment every other amount-tiered chain in this codebase has
  // gotten (e.g. `SUPPLIER_PAYMENTS`).
  { domainCode: EXPENSES_APPROVAL_DOMAIN_CODE, name: "Expense Voucher Approval" },
  { domainCode: PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE, name: "Petty Cash Replenishment Approval" },
  { domainCode: EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE, name: "Expense Claim Approval" },
  // Module 15 (Payroll) PASS B — closes PASS A's own documented bootstrapping
  // gap (`LoansService.create()` already called `ApprovalEngineService.submit()`
  // under `PAYROLL_LOANS_APPROVAL_DOMAIN_CODE`) and adds the new
  // `PAYROLL_RUN` chain `PayrollRunsService.submitForApproval()` needs
  // (BR-PYRL-05) — same single-level System-Admin workflow every other
  // domain code in this list gets; real amount-tiered/role-specific payroll
  // approval routing is documented future work, not attempted here.
  { domainCode: PAYROLL_LOANS_APPROVAL_DOMAIN_CODE, name: "Staff Loan Approval" },
  { domainCode: PAYROLL_RUN_APPROVAL_DOMAIN_CODE, name: "Payroll Run Approval" },
  // Module 16 (Banking) — three distinct domain codes for three distinct
  // entity types (`bank_transfer`/`bank_deposit`/`bank_withdrawal`), same
  // "one workflow per genuinely different operation" shape Wallet's/
  // Expenses' own three-code groups established. Same single-level
  // System-Admin workflow every other domain code in this list gets — real
  // amount-tiered routing is documented future work, not attempted here.
  { domainCode: BANK_TRANSFERS_APPROVAL_DOMAIN_CODE, name: "Bank Transfer Approval" },
  { domainCode: BANK_DEPOSITS_APPROVAL_DOMAIN_CODE, name: "Bank Deposit Approval" },
  { domainCode: BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE, name: "Bank Withdrawal Approval" },
  // Module 17 (Fixed Assets) — three distinct domain codes for three
  // distinct entity types (`fa_depreciation_run`/`fa_disposal`/
  // `fa_verification`), same "one workflow per genuinely different
  // operation" shape Wallet's/Expenses'/Banking's own three-code groups
  // established. `ASSET_VERIFICATION` is a NEW domain code this pass
  // introduces (documented judgement call in `VerificationService`'s own doc
  // comment — `STOCK_ADJUSTMENTS` didn't conceptually fit a physical asset
  // count). Same single-level System-Admin workflow every other domain code
  // in this list gets.
  { domainCode: DEPRECIATION_APPROVAL_DOMAIN_CODE, name: "Depreciation Run Approval" },
  { domainCode: ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE, name: "Asset Disposal Approval" },
  { domainCode: ASSET_VERIFICATION_APPROVAL_DOMAIN_CODE, name: "Asset Verification Approval" },
];

/** Module 7 (Accounting Core) — the current-calendar-year default fiscal year's monthly periods count. */
const DEFAULT_FISCAL_YEAR_PERIOD_COUNT = 12;
/** Module 7 — the one default cost center, per the task brief's seed requirements. */
const DEFAULT_COST_CENTER_CODE = "MAIN";

/**
 * Module 8 (Students) — a small, generic starter class ladder (Grade 1-8,
 * a typical primary-school run — the task brief left the exact ladder to
 * this pass's judgement, "keep it small"). `level` doubles as both the
 * ladder's sort order and a human-readable grade number.
 */
const STD_CLASS_SEED: readonly { name: string; level: number }[] = [
  { name: "Grade 1", level: 1 },
  { name: "Grade 2", level: 2 },
  { name: "Grade 3", level: 3 },
  { name: "Grade 4", level: 4 },
  { name: "Grade 5", level: 5 },
  { name: "Grade 6", level: 6 },
  { name: "Grade 7", level: 7 },
  { name: "Grade 8", level: 8 },
];

type CoaAccountClass = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

interface CoaAccountDef {
  code: string;
  name: string;
  class: CoaAccountClass;
  parentCode: string | null;
  isPostable: boolean;
  isControl: boolean;
  controlDomain: string | null;
}

/**
 * Basic Chart of Accounts template (Module 7 task brief): five class header
 * accounts (roots, `is_postable=false`), then enough postable leaf accounts
 * to realize every `control_domain` in the DDL's CHECK constraint
 * (`AR_STUDENT`, `AR_SPONSOR`, `AP_SUPPLIER`, `WALLET`, `INVENTORY`,
 * `PAYROLL`, `PREPAYMENT`, `MPESA_CLEARING`, `TRANSFER_CLEARING` — all nine
 * appear exactly once below), plus a handful of ordinary income/expense
 * leaves. `WALLET` (student prepaid balances the school owes back in
 * services/refunds) and `PAYROLL` (net-pay/statutory withholdings not yet
 * disbursed) are modeled as LIABILITY control accounts, not ASSET — a
 * judgement call consistent with how a prepaid/gift-card-style balance and
 * unpaid wages are conventionally carried. Ordered headers-before-children
 * so `seedChartOfAccounts()` can resolve `parent_id` by code as it goes.
 */
const COA_TEMPLATE: readonly CoaAccountDef[] = [
  { code: "1000", name: "Assets", class: "ASSET", parentCode: null, isPostable: false, isControl: false, controlDomain: null },
  { code: "2000", name: "Liabilities", class: "LIABILITY", parentCode: null, isPostable: false, isControl: false, controlDomain: null },
  { code: "3000", name: "Equity", class: "EQUITY", parentCode: null, isPostable: false, isControl: false, controlDomain: null },
  { code: "4000", name: "Income", class: "INCOME", parentCode: null, isPostable: false, isControl: false, controlDomain: null },
  { code: "5000", name: "Expenses", class: "EXPENSE", parentCode: null, isPostable: false, isControl: false, controlDomain: null },

  { code: "1010", name: "Petty Cash", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1020", name: "Bank - Operating Account", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },

  // Module 14 (Expenses) — `expense-clearing-accounts.util.ts`'s
  // `PETTY_CASH_FLOAT_ACCOUNT_CODE = "1015"` (P-26's debit side and the
  // `PETTY_CASH` method's own resolved clearing account) — distinct from
  // `1010 Petty Cash` (an ordinary till/cashbox account), see that util's
  // own doc comment for why. Next free `10xx` slot right after `1010`, no
  // dedicated `control_domain` (same treatment as `1010`/`1020`/`1030`/`1040`).
  { code: PETTY_CASH_FLOAT_ACCOUNT_CODE, name: "Petty Cash Float", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1100", name: "Accounts Receivable - Students", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "AR_STUDENT" },
  { code: "1110", name: "Accounts Receivable - Sponsors", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "AR_SPONSOR" },
  { code: "1200", name: "Inventory", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "INVENTORY" },
  { code: "1300", name: "Prepayments", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "PREPAYMENT" },
  { code: "1400", name: "M-Pesa Clearing", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "MPESA_CLEARING" },
  { code: "1500", name: "Inter-Account Transfer Clearing", class: "ASSET", parentCode: "1000", isPostable: true, isControl: true, controlDomain: "TRANSFER_CLEARING" },

  // Module 10 (Payments) PASS B — closes PASS A's own documented forward gap
  // (`payment-clearing-accounts.util.ts`'s `METHOD_GL_CODE` map already
  // hardcodes these exact codes for CHEQUE/CARD/POS receipt-split clearing;
  // `resolveClearingAccount()` throws `NotFoundException` at runtime until
  // these two rows exist). Ordinary (non-`control_domain`) postable leaves,
  // same treatment as `1010`/`1020` — CASH/BANK have no dedicated
  // `control_domain` in the DDL either, plain `gl_account.code` lookups.
  { code: "1030", name: "Cheques in Transit", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1040", name: "Card/POS Clearing", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },

  { code: "2010", name: "Accounts Payable - Suppliers", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: true, controlDomain: "AP_SUPPLIER" },
  { code: "2020", name: "Payroll Liabilities", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: true, controlDomain: "PAYROLL" },
  { code: "2030", name: "Student Wallet Balances", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: true, controlDomain: "WALLET" },

  // Module 14 (Expenses) — `ClaimsService.STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE
  // = "2040"` — `reimburse()`'s PAYROLL-branch accrual credit (the expense
  // is recognized now; Module 15/Payroll will eventually debit this same
  // account to settle the payable, a real forward-integration point — see
  // that service's own doc comment). Next free `20xx` code after `2030`.
  // Not one of the DDL's nine `control_domain` values, same treatment as
  // `2015`/`2100` below.
  { code: STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE, name: "Staff Reimbursements Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },

  { code: "2100", name: "VAT Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },

  // Module 12 (Procurement) PASS B — closes PASS A's own documented gap:
  // `gl-grn-accounts.util.ts`'s `resolveGrnAccrualAccount()` already hardcoded
  // this exact code/name pair (`GRN_ACCRUAL_ACCOUNT_CODE = "2015"`), and
  // `GrnService.post()`'s P-18/P-19 branch has been throwing `NotFoundException`
  // at runtime until this row exists. Distinct from `2010 AP - Suppliers` —
  // "goods received, not yet supplier-invoiced" is a different liability than
  // "invoiced, not yet paid" (see that util's own doc comment). No dedicated
  // `control_domain` value exists for it (the DDL's CHECK constraint has no
  // `GRN_ACCRUAL`-shaped member), so — same as `1010`/`1020`/`1030`/`1040`
  // above — a plain, non-`control_domain` postable leaf.
  { code: "2015", name: "GRN Accrual", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },

  { code: "3010", name: "Retained Earnings", class: "EQUITY", parentCode: "3000", isPostable: true, isControl: false, controlDomain: null },

  { code: "4010", name: "School Fees Income", class: "INCOME", parentCode: "4000", isPostable: true, isControl: false, controlDomain: null },
  { code: "4020", name: "Registration Fees Income", class: "INCOME", parentCode: "4000", isPostable: true, isControl: false, controlDomain: null },
  { code: "4030", name: "Other Income", class: "INCOME", parentCode: "4000", isPostable: true, isControl: false, controlDomain: null },

  { code: "5010", name: "Salaries and Wages Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  { code: "5020", name: "Utilities Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  { code: "5030", name: "Office Supplies Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  { code: "5040", name: "Repairs and Maintenance Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 12 (Procurement) PASS B — closes PASS A's own documented gap:
  // `gl-grn-accounts.util.ts`'s `resolveProcurementExpenseAccount()` already
  // hardcoded this exact code/name pair
  // (`PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE = "5050"`) for P-19's debit side
  // (today's only reachable GRN-posting branch, since no `proc_po_line.item_id`
  // is ever set until Module 13/Inventory exists).
  { code: "5050", name: "Procurement Expense / Asset WIP", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  // This pass's own new gap-closer: `gl-ap-accounts.util.ts`'s
  // `resolvePriceVarianceAccount()` (`PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE =
  // "5060"`) — `SupplierInvoicesService.post()`'s P-20 invoice-vs-GRN
  // variance line (debited when the invoice exceeds the GRN-valued amount,
  // credited when it's less).
  { code: "5060", name: "Purchase Price Variance", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 11 (Wallet) — BR-WALL-05's manual-adjustment contra account
  // (`WalletTransactionsService.resolveAdjustmentContraAccount()`'s own
  // documented judgement call: not one of the DDL's nine `control_domain`
  // values, so a plain `gl_account.code` lookup, same treatment as `1010`/
  // `1020`/`1030`/`1040` above).
  { code: "5090", name: "Wallet Adjustment Contra", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 13 (Inventory) — P-24's stock-take variance expense account
  // (`gl-inventory-accounts.util.ts`'s `resolveStockLossExpenseAccount()`,
  // `STOCK_LOSS_EXPENSE_ACCOUNT_CODE = "5070"` — the next free `5xxx` code
  // after Procurement's `5060 Purchase Price Variance` and before Wallet's
  // `5090 Wallet Adjustment Contra`). Not one of the DDL's nine
  // `control_domain` values, same treatment as `2015`/`5050`/`5060`/`5090`
  // above.
  { code: STOCK_LOSS_EXPENSE_ACCOUNT_CODE, name: "Stock Loss Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 15 (Payroll) PASS B — P-27/P-28's GL account map
  // (`gl-payroll-accounts.util.ts`'s own doc comment). Net Pay Payable
  // reuses the already-seeded `2020 Payroll Liabilities` (`control_domain=
  // 'PAYROLL'`) leaf, resolved via `resolveControlAccount()` — no new row
  // needed for it. `Payroll Expense (gross)` reuses the already-seeded
  // `5010 Salaries and Wages Expense` — no new row either. The seven NEW
  // leaves below: distinct payables per statutory type (schools remit PAYE/
  // NSSF/SHIF/AHL separately to KRA/NSSF/SHIF/AHL, so lumping them into one
  // account would break real-world reconciliation), an asset account for
  // staff loan recoveries (crediting it reduces what's owed to the school —
  // NOT a new payable), a generic "other deductions" payable, and the
  // employer-side NSSF+AHL contribution expense (a real employer COST,
  // distinct from what's withheld from the employee). Next free `1xxx`/
  // `2xxx`/`5xxx` codes after every prior module's own additions
  // (`1600` after Wallet/Payments/GRN's `1000`-`1500` range; `2050`-`2090`
  // after Expenses' `2040`; `5080` between Inventory's `5070` and Wallet's
  // `5090` — checked against every existing COA_TEMPLATE row above for
  // collisions).
  { code: STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE, name: "Staff Loans Receivable", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: PAYE_PAYABLE_ACCOUNT_CODE, name: "PAYE Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },
  { code: NSSF_PAYABLE_ACCOUNT_CODE, name: "NSSF Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },
  { code: SHIF_PAYABLE_ACCOUNT_CODE, name: "SHIF Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },
  { code: AHL_PAYABLE_ACCOUNT_CODE, name: "AHL Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },
  { code: OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE, name: "Other Payroll Deductions Payable", class: "LIABILITY", parentCode: "2000", isPostable: true, isControl: false, controlDomain: null },
  { code: EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE, name: "Employer Statutory Contributions Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 16 (Banking) — `gl-banking-accounts.util.ts`'s own doc comment:
  // `UNDEPOSITED_FUNDS_ACCOUNT_CODE = "1700"` (deposits.service.ts's/
  // withdrawals.service.ts's own "Undeposited Funds" clearing-account design
  // decision — the OTHER side of a deposit/withdrawal entry, since the DDL
  // gives `bank_deposit`/`bank_withdrawal` a single `account_id`, not a
  // from/to pair), `BANK_CHARGES_EXPENSE_ACCOUNT_CODE = "5100"` (P-33's
  // debit side), `INTEREST_INCOME_ACCOUNT_CODE = "4040"` (P-33's INTEREST
  // mirror's credit side). None are `control_domain` values — `1500 Inter-
  // Account Transfer Clearing` (already seeded above, `TRANSFER_CLEARING`)
  // is the only Banking-relevant control-domain leaf, resolved via
  // `resolveControlAccount()`, no new row needed for it.
  { code: UNDEPOSITED_FUNDS_ACCOUNT_CODE, name: "Undeposited Funds", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: INTEREST_INCOME_ACCOUNT_CODE, name: "Interest Income", class: "INCOME", parentCode: "4000", isPostable: true, isControl: false, controlDomain: null },
  { code: BANK_CHARGES_EXPENSE_ACCOUNT_CODE, name: "Bank Charges Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },

  // Module 17 (Fixed Assets) — `gl-disposal-accounts.util.ts`'s P-31 gain/
  // loss accounts (`GAIN_ON_DISPOSAL_ACCOUNT_CODE = "4050"`,
  // `LOSS_ON_DISPOSAL_ACCOUNT_CODE = "5110"` — next free `40xx`/`51xx` codes
  // after Banking's `4040 Interest Income`/`5100 Bank Charges Expense`).
  // Disposal proceeds reuse the already-seeded `1020 Bank - Operating
  // Account` leaf (`DISPOSAL_PROCEEDS_ACCOUNT_CODE`), no new row needed for
  // it. The two starter `fa_category` rows below (`FA_CATEGORY_SEED`) each
  // get their OWN dedicated cost/accum-dep/dep-expense leaf triple — next
  // free `18xx`/`51xx` codes (`1800`-`1805` and `1820`-`1825` for the two
  // categories' cost/accum-dep pairs, `5120`/`5130` for their dep-expense
  // leaves, checked against every existing COA_TEMPLATE row above for
  // collisions).
  { code: GAIN_ON_DISPOSAL_ACCOUNT_CODE, name: "Gain on Disposal", class: "INCOME", parentCode: "4000", isPostable: true, isControl: false, controlDomain: null },
  { code: LOSS_ON_DISPOSAL_ACCOUNT_CODE, name: "Loss on Disposal", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1800", name: "Furniture & Fittings - Cost", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1805", name: "Furniture & Fittings - Accum. Depreciation", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "5120", name: "Furniture & Fittings - Depreciation Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1820", name: "IT Equipment - Cost", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "1825", name: "IT Equipment - Accum. Depreciation", class: "ASSET", parentCode: "1000", isPostable: true, isControl: false, controlDomain: null },
  { code: "5130", name: "IT Equipment - Depreciation Expense", class: "EXPENSE", parentCode: "5000", isPostable: true, isControl: false, controlDomain: null },
];

/**
 * Module 17 (Fixed Assets) — two starter `fa_category` rows (task brief's
 * own examples), each with its own dedicated cost/accum-dep/dep-expense
 * account triple (`COA_TEMPLATE` above). Both `SL` (straight-line); no
 * `rate` needed (`RB`-only column). `residualPct` left at the DDL default
 * (0) — no scrap-value convention assumed for either starter category.
 * Idempotent upsert by `name` (`uq_fa_category_name`).
 */
interface FaCategorySeedRow {
  name: string;
  method: "SL" | "RB";
  lifeMonths: number;
  costAccountCode: string;
  accumDepAccountCode: string;
  depExpenseAccountCode: string;
}

const FA_CATEGORY_SEED: readonly FaCategorySeedRow[] = [
  { name: "Furniture & Fittings", method: "SL", lifeMonths: 60, costAccountCode: "1800", accumDepAccountCode: "1805", depExpenseAccountCode: "5120" },
  { name: "IT Equipment", method: "SL", lifeMonths: 36, costAccountCode: "1820", accumDepAccountCode: "1825", depExpenseAccountCode: "5130" },
];

/**
 * Module 16 (Banking) — starter `bank_account` rows linking to the
 * already-seeded `1020 Bank - Operating Account`/`1010 Petty Cash` GL
 * leaves (the task brief's own "1010 Cash/1020 Bank" naming, adjusted to
 * this seed's actual `COA_TEMPLATE` names). Idempotent upsert by `name`
 * (`uq_bank_account_name`) — `gl_account_id` is also real-UNIQUE
 * (`uq_bank_account_gl_account_id`), so each starter row's GL leaf must be
 * one no other `bank_account` row already claims; neither `1010` nor `1020`
 * is referenced by any other seeded `bank_account` anywhere in this
 * migration.
 */
const BANK_ACCOUNT_SEED: readonly { name: string; kind: string; glAccountCode: string }[] = [
  { name: "Main Operating Account", kind: "BANK", glAccountCode: "1020" },
  { name: "Petty Cash Till", kind: "CASH", glAccountCode: "1010" },
];

/** Module 13 (Inventory) — starter `inv_category`/`inv_store` rows (task brief: "a couple of starter rows"), idempotent upsert by their own unique `name`. */
const INV_CATEGORY_SEED_NAME = "General Supplies";
const INV_STORE_SEED_NAME = "Main Store";
const INV_STORE_SEED_LOCATION = "Main Campus";

/**
 * Module 11 (Wallet) — starter `wall_service_point` rows (task brief: "e.g.
 * School Shop/SHOP, Library/LIBRARY, Transport/TRANSPORT"), each pointing at
 * the already-seeded `4010 School Fees Income` leaf's sibling `4030 Other
 * Income` leaf as a shared, generic income account (no dedicated per-service-point
 * GL account exists yet — a documented simplification, same judgement call
 * `seedLateFeeIncomeCategory()`/`seedBounceFeeCategory()` made for their own
 * categories).
 */
const WALL_SERVICE_POINT_SEED: readonly { name: string; type: string }[] = [
  { name: "School Shop", type: "SHOP" },
  { name: "Library", type: "LIBRARY" },
  { name: "Transport", type: "TRANSPORT" },
];

/**
 * Module 14 (Expenses) — a couple of starter `exp_category` rows (task
 * brief: "e.g. Office Supplies, Utilities, Transport"), each linked to a
 * suitable EXISTING expense `gl_account` leaf — per the task brief's own
 * "existing" wording, no new GL account is minted for this seed. Two of the
 * three example names map cleanly onto already-seeded `5xxx` leaves
 * (`Office Supplies`->`5030`, `Utilities`->`5020`); no existing leaf fits
 * "Transport" (there is no `5xxx Transport Expense` account anywhere in
 * `COA_TEMPLATE`, and this pass deliberately does not add a third GL
 * account beyond the two the task brief explicitly asked for — `1015`/
 * `2040`), so the third starter category is `Repairs & Maintenance`
 * (`5040`) instead — a genuinely existing, suitable expense leaf, same
 * spirit as the task's own examples. Idempotent upsert by `name`
 * (`uq_exp_category_name`).
 */
const EXP_CATEGORY_SEED: readonly { name: string; glAccountCode: string }[] = [
  { name: "Office Supplies", glAccountCode: "5030" },
  { name: "Utilities", glAccountCode: "5020" },
  { name: "Repairs & Maintenance", glAccountCode: "5040" },
];

/**
 * Module 15 (Payroll) PASS B — the REAL Kenyan statutory rate seed
 * (FR-PYRL-003). `effective_from` is the first day of this seed's own
 * authoring month, a clearly-labeled anchor date (not a historical
 * gazette-notice date — the task brief's own instruction). Idempotent
 * upsert by `(kind, effective_from)` — `uq_pyrl_statutory_table_kind_effective_from`.
 *
 * **`params` shapes match `StatutoryCalculationService`'s own documented
 * per-kind interfaces WORD-FOR-WORD** (PASS A's contract, `statutory-calculation.service.ts`):
 * `PayeParams`/`NssfParams`/`ShifParams`/`AhlParams`.
 *
 * **`PYRL_STATUTORY_SEED_DISCLAIMER` — prominent, honest provenance note**:
 * these are best-effort figures reconstructed from PUBLIC KNOWLEDGE of the
 * Kenyan statutory payroll framework (KRA PAYE bands, the NSSF Act 2013's
 * two-tier structure, SHIF's contribution rate, the Affordable Housing
 * Levy), NOT pulled from a live, dated gazette notice. FR-PYRL-003
 * deliberately designed `pyrl_statutory_table` to be admin-editable via new
 * effective-dated rows with ZERO code change specifically so a school's
 * payroll administrator can correct/replace these figures once they verify
 * the CURRENT official KRA/NSSF/SHIF/AHL rates — getting the exact current
 * numbers right in THIS seed is therefore not safety-critical, but this
 * disclaimer, stored verbatim in every row's `source_note`, must stay
 * prominent and honest about that limitation.
 */
const PYRL_STATUTORY_SEED_EFFECTIVE_FROM = "2026-07-01";

const PYRL_STATUTORY_SEED_DISCLAIMER =
  "DISCLAIMER: This rate table is a BEST-EFFORT reconstruction from public knowledge of the Kenyan " +
  "statutory payroll framework as of this seed's authoring date — it is NOT sourced from a live, dated " +
  "KRA/NSSF/SHIF/AHL gazette notice. The school's payroll administrator MUST verify these figures against " +
  "the current official gazette notices before running any real payroll. Per FR-PYRL-003, this system is " +
  "explicitly designed so an admin can correct or replace these figures at any time by adding a new " +
  "effective-dated pyrl_statutory_table row — NO CODE CHANGE is ever required. Getting the exact current " +
  "figures right in this seed is therefore not safety-critical, but this disclaimer must remain prominent.";

interface PyrlStatutoryTableSeedRow {
  kind: "PAYE" | "NSSF" | "SHIF" | "AHL";
  params: Record<string, unknown>;
}

const PYRL_STATUTORY_TABLE_SEED: readonly PyrlStatutoryTableSeedRow[] = [
  {
    kind: "PAYE",
    params: {
      bands: [
        { min: 0, max: 24000, rate: 0.1 },
        { min: 24000, max: 32333, rate: 0.25 },
        { min: 32333, max: 500000, rate: 0.3 },
        { min: 500000, max: 800000, rate: 0.325 },
        { min: 800000, max: null, rate: 0.35 },
      ],
      personalReliefMonthly: 2400,
    },
  },
  {
    kind: "NSSF",
    params: {
      tier1: { upperLimit: 8000, rate: 0.06 },
      tier2: { lowerLimit: 8000, upperLimit: 72000, rate: 0.06 },
    },
  },
  {
    kind: "SHIF",
    params: { rate: 0.0275, minimumAmount: 300 },
  },
  {
    kind: "AHL",
    params: { employeeRate: 0.015, employerRate: 0.015 },
  },
];

/**
 * Module 15 (Payroll) PASS B — the starter `pyrl_component` catalogue
 * `PayrollRunsService.compute()` resolves by code
 * (`BASIC_COMPONENT_CODE`/`PAYE_COMPONENT_CODE`/etc, all imported from that
 * service's own exported constants so seed and engine can never drift
 * apart). `BASIC`/`HOUSE_ALLOWANCE` reuse the already-seeded `5010 Salaries
 * and Wages Expense` leaf (no dedicated earning-side GL account minted for
 * either); the four statutory deductions and `LOAN_RECOVERY` point at their
 * own dedicated PASS-B-seeded payable/receivable leaves; `OTHER_DEDUCTION`
 * is a generic catch-all an admin can attach an ad-hoc `pyrl_oneoff`
 * deduction to when no more specific component fits, pointing at the same
 * generic "Other Payroll Deductions Payable" leaf `compute()`'s own
 * adhoc-deduction aggregation credits at commit time. Idempotent upsert by
 * `code` (`uq_pyrl_component_code`).
 */
interface PyrlComponentSeedRow {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  isTaxable: boolean;
  isStatutory: boolean;
  glAccountCode: string;
}

const PYRL_COMPONENT_SEED: readonly PyrlComponentSeedRow[] = [
  { code: BASIC_COMPONENT_CODE, name: "Basic Pay", kind: "EARNING", isTaxable: true, isStatutory: false, glAccountCode: "5010" },
  { code: "HOUSE_ALLOWANCE", name: "House Allowance", kind: "EARNING", isTaxable: true, isStatutory: false, glAccountCode: "5010" },
  { code: PAYE_COMPONENT_CODE, name: "PAYE", kind: "DEDUCTION", isTaxable: false, isStatutory: true, glAccountCode: PAYE_PAYABLE_ACCOUNT_CODE },
  { code: NSSF_COMPONENT_CODE, name: "NSSF", kind: "DEDUCTION", isTaxable: false, isStatutory: true, glAccountCode: NSSF_PAYABLE_ACCOUNT_CODE },
  { code: SHIF_COMPONENT_CODE, name: "SHIF", kind: "DEDUCTION", isTaxable: false, isStatutory: true, glAccountCode: SHIF_PAYABLE_ACCOUNT_CODE },
  { code: AHL_COMPONENT_CODE, name: "Affordable Housing Levy", kind: "DEDUCTION", isTaxable: false, isStatutory: true, glAccountCode: AHL_PAYABLE_ACCOUNT_CODE },
  { code: LOAN_RECOVERY_COMPONENT_CODE, name: "Staff Loan Recovery", kind: "DEDUCTION", isTaxable: false, isStatutory: false, glAccountCode: STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE },
  { code: "OTHER_DEDUCTION", name: "Other Deduction", kind: "DEDUCTION", isTaxable: false, isStatutory: false, glAccountCode: OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE },
];

/**
 * Seed migration (M-3 stream 2 — idempotent, upsert by natural key):
 *  1. Every permission code in `PERMISSION_CATALOGUE` (the single-source
 *     catalogue — FR-USER-001.1, `platform/users/domain/permission-catalogue.ts`)
 *     upserted into `usr_permission`. Every module appends its own codes to
 *     that same array (see its "settings:*" entries, added by Module 2) —
 *     this migration's loop is generic over the whole array, so extending
 *     the catalogue is enough; no per-module changes are needed here.
 *  2. System role `System Admin` — every permission granted.
 *  3. System role `Auditor` — `is_auditor_class=true`, only `is_write=false`
 *     permissions granted (BR-SEC-04; also enforced by the `trg_auditor_no_write`
 *     trigger from migration 0010 — this migration never attempts to violate it).
 *  4. FR-USER-009.1's three default SoD pairs (`payments:voucher:create` x
 *     `...approve`, `payroll:run:execute` x `...approve`,
 *     `billing:waiver:create` x `...approve`) all reference permission codes
 *     that belong to modules not yet built (payments/payroll/billing) — none
 *     of them exist in `PERMISSION_CATALOGUE` yet, so **zero** `usr_sod_rule`
 *     rows are seeded here. Those modules' own `09xx` seed migrations insert
 *     their pairs once the referenced permission codes exist.
 *  5. One default `brnd_theme` row (Module 4 — Branding), PUBLISHED,
 *     idempotent upsert by `name = 'Infoney Default'` natural key (insert
 *     only if no row with that name exists yet) — the Infoney Solutions
 *     brand palette/tokens realized as the initial theme every fresh
 *     environment boots with, from the exact same
 *     `INFONEY_DEFAULT_THEME_TOKENS`/`INFONEY_DEFAULT_LOGIN_CONFIG`/
 *     `INFONEY_DEFAULT_DOCUMENT_CONFIG` constants `ThemesService.getCurrentTheme()`
 *     falls back to when no theme is published yet (see that constants
 *     module's doc comment — the two call sites must never drift apart).
 *  6. Module 7 (Accounting Core): a default `gl_fiscal_year` for the
 *     current calendar year (`status='OPEN'`) with 12 monthly `gl_period`
 *     rows (`status='OPEN'`), idempotent upsert by `name` (the year as a
 *     string, e.g. `"2026"`) — skipped entirely if a fiscal year with that
 *     name already exists, so re-running this migration never duplicates
 *     periods. A basic Chart of Accounts template (`COA_TEMPLATE` above) —
 *     5 class header accounts plus enough postable leaves to realize every
 *     `control_domain` CHECK value plus ordinary income/expense accounts —
 *     idempotent upsert by `code`. One default `gl_cost_center`
 *     (`'MAIN'`/`'Main Campus'`), idempotent upsert by `code`. None of
 *     `gl_account`/`gl_fiscal_year`/`gl_period`/`gl_cost_center` are covered
 *     by `trg_gl_writer_guard` (migration `0060`), so these seeds are plain
 *     INSERTs — no `SET application_name` workaround needed. Deliberately
 *     NOT seeded: any `gl_journal`/`gl_journal_line` rows (opening
 *     balances) — those three tables ARE writer-guarded and no real
 *     opening-balance data exists yet to seed; deferred to a future pass
 *     once `PostingService` has a real caller with real balances.
 *  7. Module 8 (Students): a small starter `std_class` ladder
 *     (`STD_CLASS_SEED` — Grade 1-8), idempotent upsert by `name`.
 *  8. Module 9 (Billing) PASS B: single-level, ROLE-based (System Admin,
 *     SEQUENTIAL, quorum=1) `appr_workflow_def`/`appr_workflow_version`/
 *     `appr_level` seeds for every domain code named in
 *     `SINGLE_LEVEL_WORKFLOW_SEEDS` above (`GL_BUDGET` — closing Module 7's
 *     own deferred gap — plus `BILLING_CONCESSION`/`BILLING_CREDIT_NOTE`/
 *     `REFUNDS`/`BILLING_LATE_FEE`), idempotent upsert by `domain_code`
 *     (`appr_workflow_def`) / `(workflow_def_id, version)`
 *     (`appr_workflow_version`) / `(workflow_version_id, seq)` (`appr_level`)
 *     — see `seedSingleLevelWorkflow()`. One `bill_fee_category` row named
 *     `LATE_FEE_INCOME_CATEGORY_NAME` ("Late Fee Income"), idempotent upsert
 *     by `name`, `gl_income_account_id` resolved against the already-seeded
 *     `4030 Other Income` leaf (`COA_TEMPLATE` above) rather than minting a
 *     dedicated GL account — `LateFeeBatchesService.postInternal()` looks
 *     this category up by name and fails loudly (`NotFoundException`) if
 *     it's missing, per that service's own doc comment.
 *  9. Module 10 (Payments) PASS B: `PAYMENT_REVERSALS` added to
 *     `SINGLE_LEVEL_WORKFLOW_SEEDS` (same single-level ROLE-based System
 *     Admin/SEQUENTIAL/quorum=1 shape, via `seedSingleLevelWorkflow()`) —
 *     covers both `ReceiptsController`'s BR-PAY-08 receipt reversals and
 *     `SuspenseController`'s BR-PAY-07 suspense-item refunds. `COA_TEMPLATE`
 *     extended with `1030 Cheques in Transit`/`1040 Card/POS Clearing`
 *     (idempotent upsert by `code`, same as every other CoA leaf) — closes
 *     PASS A's own documented gap in `payment-clearing-accounts.util.ts`'s
 *     `METHOD_GL_CODE` map, which already hardcoded these exact two codes.
 *     One more `bill_fee_category` row, `BOUNCE_FEE_CATEGORY_NAME`
 *     ("Cheque Bounce Fee"), idempotent upsert by `name` via
 *     `seedBounceFeeCategory()` — `ChequesService.bounce()`'s bounce-fee path
 *     requires it, and it is a genuinely separate category from
 *     `LATE_FEE_INCOME_CATEGORY_NAME`, though both currently point at the
 *     same `4030 Other Income` GL leaf.
 * 10. Module 12 (Procurement) PASS B: `PROCUREMENT_REQUISITION`/
 *     `PROCUREMENT_PO` (closing PASS A's own bootstrapping gap) and
 *     `SUPPLIER_PAYMENTS` (new) added to `SINGLE_LEVEL_WORKFLOW_SEEDS` — same
 *     single-level ROLE-based System-Admin/SEQUENTIAL/quorum=1 shape via
 *     `seedSingleLevelWorkflow()`. `COA_TEMPLATE` extended with three more
 *     postable leaves closing PASS A's own documented gaps plus this pass's
 *     new one: `2015 GRN Accrual` (P-18/P-19's credit side,
 *     `gl-grn-accounts.util.ts`), `5050 Procurement Expense / Asset WIP`
 *     (P-19's debit side, same file), `5060 Purchase Price Variance` (P-20's
 *     variance line, this pass's `gl-ap-accounts.util.ts`) — no new rows
 *     needed for P-21's payment-clearing accounts
 *     (`payment-clearing-accounts.util.ts`), since `BANK`/`CASH`/`CHEQUE`
 *     reuse the exact codes (`1020`/`1010`/`1030`) Payments PASS B already
 *     seeded, and `MPESA` reuses the pre-existing `MPESA_CLEARING` control
 *     domain (`1400`).
 * 11. Module 13 (Inventory): `STOCK_ADJUSTMENTS` added to
 *     `SINGLE_LEVEL_WORKFLOW_SEEDS` (same single-level ROLE-based
 *     System-Admin/SEQUENTIAL/quorum=1 shape). `COA_TEMPLATE` extended with
 *     `5070 Stock Loss Expense` (P-24's variance account,
 *     `gl-inventory-accounts.util.ts`) — no new row needed for P-24's other
 *     side, since it reuses the already-seeded `1200 Inventory`
 *     `control_domain='INVENTORY'` leaf. `seedInventoryStarterData()` — one
 *     `inv_category` ("General Supplies", unconditional) and one
 *     `inv_store` ("Main Store", CONDITIONAL on at least one `usr_user` row
 *     already existing, since `keeper_user_id` is a real NOT NULL FK and
 *     this codebase never seeds a default user — see that method's own doc
 *     comment for the full bootstrap-ordering rationale).
 * 12. Module 14 (Expenses): `EXPENSES`/`PETTY_CASH_REPLENISHMENT`/
 *     `EXPENSE_CLAIMS` added to `SINGLE_LEVEL_WORKFLOW_SEEDS` (same
 *     single-level ROLE-based System-Admin/SEQUENTIAL/quorum=1 shape).
 *     `COA_TEMPLATE` extended with `1015 Petty Cash Float` (P-26's debit
 *     side / the `PETTY_CASH` method's clearing account,
 *     `expense-clearing-accounts.util.ts`) and `2040 Staff Reimbursements
 *     Payable` (`ClaimsService.reimburse()`'s PAYROLL-branch accrual credit
 *     — Module 15/Payroll's own forward-integration point). `seedExpenseCategories()`
 *     — three starter `exp_category` rows (`EXP_CATEGORY_SEED`), each linked
 *     to an already-existing expense leaf (`Office Supplies`->`5030`,
 *     `Utilities`->`5020`, `Repairs & Maintenance`->`5040` — substituted for
 *     the task brief's own "Transport" example since no existing
 *     `5xxx Transport Expense` leaf exists and this pass doesn't mint a
 *     third GL account beyond the two named above), idempotent upsert by
 *     `name`.
 * 13. Module 15 (Payroll) PASS B: `PAYROLL_LOANS` (closing PASS A's own
 *     bootstrapping gap) and `PAYROLL_RUN` (new) added to
 *     `SINGLE_LEVEL_WORKFLOW_SEEDS`. `COA_TEMPLATE` extended with 7 new
 *     leaves (`1600 Staff Loans Receivable`, `2050`-`2090` PAYE/NSSF/SHIF/
 *     AHL/Other-Deductions payables, `5080 Employer Statutory Contributions
 *     Expense`) — Net Pay Payable and Payroll Expense (gross) both reuse
 *     already-seeded leaves (`2020`/`5010`), no new rows needed for either.
 *     `seedPyrlStatutoryTables()` — the REAL Kenyan PAYE/NSSF/SHIF/AHL rate
 *     seed (`PYRL_STATUTORY_TABLE_SEED`), idempotent upsert by `(kind,
 *     effective_from)`, every row's `source_note` carrying the prominent
 *     `PYRL_STATUTORY_SEED_DISCLAIMER` (best-effort reconstruction from
 *     public knowledge, MUST be verified against current gazette notices —
 *     FR-PYRL-003 makes correcting this a zero-code-change admin action).
 *     `seedPyrlComponents()` — the starter `pyrl_component` catalogue
 *     (`PYRL_COMPONENT_SEED`: `BASIC`/`HOUSE_ALLOWANCE` earnings,
 *     `PAYE`/`NSSF`/`SHIF`/`AHL` statutory deductions, `LOAN_RECOVERY`/
 *     `OTHER_DEDUCTION` deductions), idempotent upsert by `code`,
 *     `PayrollRunsService.compute()`'s exact resolution keys.
 * 14. Module 16 (Banking): `BANK_TRANSFERS`/`BANK_DEPOSITS`/`BANK_WITHDRAWALS`
 *     added to `SINGLE_LEVEL_WORKFLOW_SEEDS` (same single-level ROLE-based
 *     System-Admin/SEQUENTIAL/quorum=1 shape). `COA_TEMPLATE` extended with
 *     `1700 Undeposited Funds` (the deposit/withdrawal clearing account),
 *     `4040 Interest Income`, `5100 Bank Charges Expense` (P-33) — P-32's
 *     `TRANSFER_CLEARING` control-domain leaf reuses the already-seeded
 *     `1500 Inter-Account Transfer Clearing`, no new row needed.
 *     `seedBankingStarterAccounts()` — two starter `bank_account` rows
 *     (`BANK_ACCOUNT_SEED`: "Main Operating Account" -> `1020`, "Petty Cash
 *     Till" -> `1010`), idempotent upsert by `name`.
 * 15. Module 17 (Fixed Assets): `DEPRECIATION`/`ASSET_DISPOSALS`/
 *     `ASSET_VERIFICATION` added to `SINGLE_LEVEL_WORKFLOW_SEEDS` (same
 *     single-level ROLE-based System-Admin/SEQUENTIAL/quorum=1 shape) —
 *     `ASSET_VERIFICATION` is a NEW domain code this pass introduces (see
 *     `VerificationService`'s own doc comment). `COA_TEMPLATE` extended with
 *     `4050 Gain on Disposal`/`5110 Loss on Disposal` (P-31's gain/loss
 *     accounts, `gl-disposal-accounts.util.ts`) plus 6 dedicated leaves for
 *     the two starter `fa_category` rows below (P-31's disposal proceeds
 *     reuse the already-seeded `1020 Bank - Operating Account`, no new row
 *     needed). `seedFixedAssetCategories()` — two starter `fa_category` rows
 *     (`FA_CATEGORY_SEED`: "Furniture & Fittings" SL/60 months, "IT
 *     Equipment" SL/36 months), each with its OWN dedicated cost/accum-dep/
 *     dep-expense `gl_account` leaf triple, idempotent upsert by `name`.
 */
export class SeedPermissionsAndRoles0900 implements MigrationInterface {
  name = "SeedPermissionsAndRoles1700000000900";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionIds = new Map<string, string>();

    for (const permission of PERMISSION_CATALOGUE) {
      const rows: Array<{ id: string }> = await queryRunner.query(
        `
        INSERT INTO app.usr_permission (id, code, module, description, is_write)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO UPDATE SET
          module = EXCLUDED.module,
          description = EXCLUDED.description,
          is_write = EXCLUDED.is_write
        RETURNING id
        `,
        [generateUuidV7(), permission.code, permission.module, permission.description, permission.isWrite],
      );
      permissionIds.set(permission.code, rows[0].id);
    }

    const systemAdminRoleId = await this.upsertRole(queryRunner, SYSTEM_ADMIN_ROLE, "Full access to every permission", false);
    const auditorRoleId = await this.upsertRole(
      queryRunner,
      AUDITOR_ROLE,
      "Read-only access across all modules (BR-SEC-04)",
      true,
    );

    for (const permission of PERMISSION_CATALOGUE) {
      await this.grantPermission(queryRunner, systemAdminRoleId, permissionIds.get(permission.code)!);
      if (!permission.isWrite) {
        await this.grantPermission(queryRunner, auditorRoleId, permissionIds.get(permission.code)!);
      }
    }

    // FR-USER-009.1 default SoD pairs — deferred, see class doc comment above.

    await this.seedDefaultTheme(queryRunner);
    await this.seedDefaultFiscalYear(queryRunner);
    await this.seedChartOfAccounts(queryRunner);
    await this.seedDefaultCostCenter(queryRunner);
    await this.seedStudentClasses(queryRunner);

    for (const workflow of SINGLE_LEVEL_WORKFLOW_SEEDS) {
      await this.seedSingleLevelWorkflow(queryRunner, workflow.domainCode, workflow.name, systemAdminRoleId);
    }
    await this.seedLateFeeIncomeCategory(queryRunner);
    await this.seedBounceFeeCategory(queryRunner);
    await this.seedWalletServicePoints(queryRunner);
    await this.seedInventoryStarterData(queryRunner);
    await this.seedExpenseCategories(queryRunner);
    await this.seedPyrlStatutoryTables(queryRunner);
    await this.seedPyrlComponents(queryRunner);
    await this.seedBankingStarterAccounts(queryRunner);
    await this.seedFixedAssetCategories(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Module 9 (Billing) PASS B + Module 10 (Payments) PASS B + Module 11
    // (Wallet) seeds first — `bill_fee_category`/`wall_service_point`
    // FK-RESTRICT to `gl_account`, and `appr_level.role_id` FK-RESTRICTs to
    // `usr_role`, so all must be torn down before this method's later
    // `gl_account`/`usr_role` deletions run, in FK-child-before-parent order.
    // Module 14 (Expenses) starter categories FK-RESTRICT to `gl_account`
    // too — torn down here for the same reason.
    // Module 17 (Fixed Assets) starter fa_category rows first —
    // fa_category.gl_*_account_id all FK-RESTRICT to gl_account, same
    // "children before parents" ordering every other module's own
    // seed-teardown follows.
    const faCategoryNames = FA_CATEGORY_SEED.map((c) => c.name);
    if (faCategoryNames.length > 0) {
      await queryRunner.query(`DELETE FROM app.fa_category WHERE name = ANY($1::text[])`, [faCategoryNames]);
    }

    // Module 16 (Banking) starter bank_account rows first — bank_account.gl_account_id
    // FK-RESTRICTs to gl_account, same "children before parents" ordering
    // every other module's own seed-teardown follows.
    const bankAccountNames = BANK_ACCOUNT_SEED.map((a) => a.name);
    if (bankAccountNames.length > 0) {
      await queryRunner.query(`DELETE FROM app.bank_account WHERE name = ANY($1::text[])`, [bankAccountNames]);
    }

    // Module 15 (Payroll) PASS B — pyrl_component (upsert-by-code) and
    // pyrl_statutory_table (upsert-by-kind+effective_from) rows first,
    // symmetric with every other module's own seed-teardown-before-CoA
    // ordering (pyrl_component.gl_account_id FK-RESTRICTs to gl_account).
    const pyrlComponentCodes = PYRL_COMPONENT_SEED.map((c) => c.code);
    if (pyrlComponentCodes.length > 0) {
      await queryRunner.query(`DELETE FROM app.pyrl_component WHERE code = ANY($1::text[])`, [pyrlComponentCodes]);
    }
    for (const row of PYRL_STATUTORY_TABLE_SEED) {
      await queryRunner.query(`DELETE FROM app.pyrl_statutory_table WHERE kind = $1 AND effective_from = $2`, [
        row.kind,
        PYRL_STATUTORY_SEED_EFFECTIVE_FROM,
      ]);
    }

    const expCategoryNames = EXP_CATEGORY_SEED.map((c) => c.name);
    if (expCategoryNames.length > 0) {
      await queryRunner.query(`DELETE FROM app.exp_category WHERE name = ANY($1::text[])`, [expCategoryNames]);
    }

    const servicePointNames = WALL_SERVICE_POINT_SEED.map((s) => s.name);
    if (servicePointNames.length > 0) {
      await queryRunner.query(`DELETE FROM app.wall_service_point WHERE name = ANY($1::text[])`, [servicePointNames]);
    }

    // Module 13 (Inventory) starter data — inv_store before inv_category
    // (inv_category has no dependency on inv_store, but this keeps the
    // ordering symmetric/defensive; neither actually blocks the other).
    await queryRunner.query(`DELETE FROM app.inv_store WHERE name = $1`, [INV_STORE_SEED_NAME]);
    await queryRunner.query(`DELETE FROM app.inv_category WHERE name = $1`, [INV_CATEGORY_SEED_NAME]);

    await queryRunner.query(`DELETE FROM app.bill_fee_category WHERE name IN ($1, $2)`, [
      LATE_FEE_INCOME_CATEGORY_NAME,
      BOUNCE_FEE_CATEGORY_NAME,
    ]);

    const workflowDefRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.appr_workflow_def WHERE domain_code = ANY($1::text[])`,
      [SINGLE_LEVEL_WORKFLOW_SEEDS.map((w) => w.domainCode)],
    );
    for (const workflowDef of workflowDefRows) {
      const versionRows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM app.appr_workflow_version WHERE workflow_def_id = $1`,
        [workflowDef.id],
      );
      for (const version of versionRows) {
        await queryRunner.query(`DELETE FROM app.appr_level WHERE workflow_version_id = $1`, [version.id]);
      }
      await queryRunner.query(`DELETE FROM app.appr_workflow_version WHERE workflow_def_id = $1`, [workflowDef.id]);
    }
    const workflowDomainCodes = SINGLE_LEVEL_WORKFLOW_SEEDS.map((w) => w.domainCode);
    if (workflowDomainCodes.length > 0) {
      await queryRunner.query(`DELETE FROM app.appr_workflow_def WHERE domain_code = ANY($1::text[])`, [workflowDomainCodes]);
    }

    const classNames = STD_CLASS_SEED.map((c) => c.name);
    if (classNames.length > 0) {
      await queryRunner.query(`DELETE FROM app.std_class WHERE name = ANY($1::text[])`, [classNames]);
    }

    await queryRunner.query(`DELETE FROM app.gl_cost_center WHERE code = $1`, [DEFAULT_COST_CENTER_CODE]);

    // Leaves before headers — gl_account.parent_id is a self-referential FK
    // RESTRICT, and a single multi-row DELETE gives no ordering guarantee
    // across the rows it removes, so headers and leaves are deleted in two
    // separate statements to stay FK-safe regardless of row-processing order.
    const leafCodes = COA_TEMPLATE.filter((account) => account.parentCode !== null).map((account) => account.code);
    const headerCodes = COA_TEMPLATE.filter((account) => account.parentCode === null).map((account) => account.code);
    if (leafCodes.length > 0) {
      await queryRunner.query(`DELETE FROM app.gl_account WHERE code = ANY($1::text[])`, [leafCodes]);
    }
    if (headerCodes.length > 0) {
      await queryRunner.query(`DELETE FROM app.gl_account WHERE code = ANY($1::text[])`, [headerCodes]);
    }

    const currentYearName = String(new Date().getUTCFullYear());
    const fiscalYearRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.gl_fiscal_year WHERE name = $1`,
      [currentYearName],
    );
    for (const fiscalYear of fiscalYearRows) {
      await queryRunner.query(`DELETE FROM app.gl_period WHERE fiscal_year_id = $1`, [fiscalYear.id]);
    }
    await queryRunner.query(`DELETE FROM app.gl_fiscal_year WHERE name = $1`, [currentYearName]);

    await queryRunner.query(`DELETE FROM app.brnd_theme WHERE name = $1`, [INFONEY_DEFAULT_THEME_NAME]);

    const roleRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.usr_role WHERE name IN ($1, $2)`,
      [SYSTEM_ADMIN_ROLE, AUDITOR_ROLE],
    );
    for (const role of roleRows) {
      await queryRunner.query(`DELETE FROM app.usr_role_permission WHERE role_id = $1`, [role.id]);
    }
    await queryRunner.query(`DELETE FROM app.usr_role WHERE name IN ($1, $2)`, [SYSTEM_ADMIN_ROLE, AUDITOR_ROLE]);

    const codes = PERMISSION_CATALOGUE.map((p) => p.code);
    if (codes.length > 0) {
      await queryRunner.query(`DELETE FROM app.usr_permission WHERE code = ANY($1::text[])`, [codes]);
    }
  }

  /** Idempotent — inserts the Infoney Solutions default theme only if no `brnd_theme` row named `INFONEY_DEFAULT_THEME_NAME` exists yet. */
  private async seedDefaultTheme(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.brnd_theme WHERE name = $1`,
      [INFONEY_DEFAULT_THEME_NAME],
    );
    if (existing.length > 0) {
      return;
    }

    await queryRunner.query(
      `
      INSERT INTO app.brnd_theme (id, name, status, tokens, login_config, document_config, published_at)
      VALUES ($1, $2, 'PUBLISHED', $3::jsonb, $4::jsonb, $5::jsonb, now())
      `,
      [
        generateUuidV7(),
        INFONEY_DEFAULT_THEME_NAME,
        JSON.stringify(INFONEY_DEFAULT_THEME_TOKENS),
        JSON.stringify(INFONEY_DEFAULT_LOGIN_CONFIG),
        JSON.stringify(INFONEY_DEFAULT_DOCUMENT_CONFIG),
      ],
    );
  }

  /** Idempotent — inserts the current-calendar-year default fiscal year + its 12 monthly periods only if no `gl_fiscal_year` named for this year exists yet. */
  private async seedDefaultFiscalYear(queryRunner: QueryRunner): Promise<void> {
    const year = new Date().getUTCFullYear();
    const name = String(year);

    const existing: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.gl_fiscal_year WHERE name = $1`,
      [name],
    );
    if (existing.length > 0) {
      return;
    }

    const fiscalYearId = generateUuidV7();
    await queryRunner.query(
      `
      INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
      VALUES ($1, $2, $3, $4, 'OPEN')
      `,
      [fiscalYearId, name, `${year}-01-01`, `${year}-12-31`],
    );

    for (let month = 1; month <= DEFAULT_FISCAL_YEAR_PERIOD_COUNT; month++) {
      const startsOn = `${year}-${String(month).padStart(2, "0")}-01`;
      const endsOn = lastDayOfUtcMonth(year, month);
      await queryRunner.query(
        `
        INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
        VALUES ($1, $2, $3, $4, $5, 'OPEN')
        `,
        [generateUuidV7(), fiscalYearId, month, startsOn, endsOn],
      );
    }
  }

  /** Idempotent — upserts every `COA_TEMPLATE` row by `code`; `parent_id` resolved from the just-upserted header's returned id, headers-before-children order relied upon. */
  private async seedChartOfAccounts(queryRunner: QueryRunner): Promise<void> {
    const codeToId = new Map<string, string>();

    for (const account of COA_TEMPLATE) {
      const parentId = account.parentCode ? (codeToId.get(account.parentCode) ?? null) : null;
      const rows: Array<{ id: string }> = await queryRunner.query(
        `
        INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, control_domain, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        `,
        [
          generateUuidV7(),
          account.code,
          account.name,
          account.class,
          parentId,
          account.isPostable,
          account.isControl,
          account.controlDomain,
        ],
      );
      codeToId.set(account.code, rows[0].id);
    }
  }

  /** Idempotent — inserts the one default gl_cost_center only if `code='MAIN'` doesn't exist yet. */
  private async seedDefaultCostCenter(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO app.gl_cost_center (id, code, name, is_active)
      VALUES ($1, $2, 'Main Campus', true)
      ON CONFLICT (code) DO NOTHING
      `,
      [generateUuidV7(), DEFAULT_COST_CENTER_CODE],
    );
  }

  /** Idempotent — upserts every `STD_CLASS_SEED` row by `name` (Module 8 Students starter class ladder). */
  private async seedStudentClasses(queryRunner: QueryRunner): Promise<void> {
    for (const klass of STD_CLASS_SEED) {
      await queryRunner.query(
        `
        INSERT INTO app.std_class (id, name, level, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (name) DO UPDATE SET level = EXCLUDED.level
        `,
        [generateUuidV7(), klass.name, klass.level],
      );
    }
  }

  /**
   * Module 9 (Billing) PASS B — idempotent single-level, ROLE-based
   * (`approver_type='ROLE'`, `role_id=systemAdminRoleId`) approval workflow
   * seed: one `appr_workflow_def` (upsert by `domain_code`), one
   * `appr_workflow_version` (`version=1`, `is_current=true`, upsert by
   * `(workflow_def_id, version)`), one `appr_level`
   * (`seq=1`, `mode='SEQUENTIAL'`, `quorum=1`, upsert by
   * `(workflow_version_id, seq)`). No `appr_routing_rule` row — see class doc
   * comment on `SINGLE_LEVEL_WORKFLOW_SEEDS` for why none is needed.
   */
  private async seedSingleLevelWorkflow(
    queryRunner: QueryRunner,
    domainCode: string,
    name: string,
    systemAdminRoleId: string,
  ): Promise<void> {
    const defRows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.appr_workflow_def (id, domain_code, name, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (domain_code) DO UPDATE SET name = EXCLUDED.name, is_active = true
      RETURNING id
      `,
      [generateUuidV7(), domainCode, name],
    );
    const workflowDefId = defRows[0].id;

    const versionRows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.appr_workflow_version (id, workflow_def_id, "version", is_current)
      VALUES ($1, $2, 1, true)
      ON CONFLICT (workflow_def_id, "version") DO UPDATE SET is_current = true
      RETURNING id
      `,
      [generateUuidV7(), workflowDefId],
    );
    const workflowVersionId = versionRows[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.appr_level (id, workflow_version_id, seq, approver_type, role_id, mode, quorum)
      VALUES ($1, $2, 1, 'ROLE', $3, 'SEQUENTIAL', 1)
      ON CONFLICT (workflow_version_id, seq) DO UPDATE SET
        approver_type = EXCLUDED.approver_type,
        role_id = EXCLUDED.role_id,
        mode = EXCLUDED.mode,
        quorum = EXCLUDED.quorum
      `,
      [generateUuidV7(), workflowVersionId, systemAdminRoleId],
    );
  }

  /**
   * Module 9 (Billing) PASS B — idempotent upsert (by `name`) of the
   * `LATE_FEE_INCOME_CATEGORY_NAME` `bill_fee_category` row
   * `LateFeeBatchesService.postInternal()` requires to exist before any late
   * fee batch can post. `gl_income_account_id` resolves against the already-
   * seeded `4030 Other Income` leaf rather than minting a dedicated GL
   * account (per that service's own class doc comment).
   */
  private async seedLateFeeIncomeCategory(queryRunner: QueryRunner): Promise<void> {
    const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "4030",
    ]);
    if (accountRows.length === 0) {
      throw new Error(
        `SeedPermissionsAndRoles0900.seedLateFeeIncomeCategory: gl_account code=4030 (Other Income) not found — seedChartOfAccounts() must run first`,
      );
    }
    const glIncomeAccountId = accountRows[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.bill_fee_category (id, name, gl_income_account_id, taxable, is_active, priority)
      VALUES ($1, $2, $3, false, true, 0)
      ON CONFLICT (name) DO UPDATE SET gl_income_account_id = EXCLUDED.gl_income_account_id, is_active = true
      `,
      [generateUuidV7(), LATE_FEE_INCOME_CATEGORY_NAME, glIncomeAccountId],
    );
  }

  /**
   * Module 10 (Payments) PASS B — idempotent upsert (by `name`) of the
   * `BOUNCE_FEE_CATEGORY_NAME` ("Cheque Bounce Fee") `bill_fee_category` row
   * `ChequesService.bounce()`'s `applyBounceFee()` helper requires to exist
   * before a bounce fee can be raised (it looks this category up by name and
   * fails loudly with `NotFoundException` if missing, per that service's own
   * class doc comment). A genuinely SEPARATE category from
   * `LATE_FEE_INCOME_CATEGORY_NAME` — the two are distinct fee types with
   * distinct names, `ChequesService` never reuses "Late Fee Income" — but the
   * exact same `4030 Other Income` GL leaf is reused as its income account
   * (same judgement call `seedLateFeeIncomeCategory()` made: not enough
   * reason yet to mint a third dedicated GL account for a category this
   * narrow).
   */
  private async seedBounceFeeCategory(queryRunner: QueryRunner): Promise<void> {
    const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "4030",
    ]);
    if (accountRows.length === 0) {
      throw new Error(
        `SeedPermissionsAndRoles0900.seedBounceFeeCategory: gl_account code=4030 (Other Income) not found — seedChartOfAccounts() must run first`,
      );
    }
    const glIncomeAccountId = accountRows[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.bill_fee_category (id, name, gl_income_account_id, taxable, is_active, priority)
      VALUES ($1, $2, $3, false, true, 0)
      ON CONFLICT (name) DO UPDATE SET gl_income_account_id = EXCLUDED.gl_income_account_id, is_active = true
      `,
      [generateUuidV7(), BOUNCE_FEE_CATEGORY_NAME, glIncomeAccountId],
    );
  }

  /**
   * Module 11 (Wallet) — idempotent upsert (by `name`) of `WALL_SERVICE_POINT_SEED`'s
   * three starter service points, each pointing at the already-seeded `4030
   * Other Income` leaf (see `WALL_SERVICE_POINT_SEED`'s doc comment).
   */
  private async seedWalletServicePoints(queryRunner: QueryRunner): Promise<void> {
    const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "4030",
    ]);
    if (accountRows.length === 0) {
      throw new Error(
        `SeedPermissionsAndRoles0900.seedWalletServicePoints: gl_account code=4030 (Other Income) not found — seedChartOfAccounts() must run first`,
      );
    }
    const glIncomeAccountId = accountRows[0].id;

    for (const servicePoint of WALL_SERVICE_POINT_SEED) {
      await queryRunner.query(
        `
        INSERT INTO app.wall_service_point (id, name, type, gl_income_account_id, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, gl_income_account_id = EXCLUDED.gl_income_account_id, is_active = true
        `,
        [generateUuidV7(), servicePoint.name, servicePoint.type, glIncomeAccountId],
      );
    }
  }

  /**
   * Module 13 (Inventory) — starter `inv_category`/`inv_store` rows.
   * `INV_CATEGORY_SEED_NAME` is unconditional (idempotent upsert by `name`,
   * no dependencies). `INV_STORE_SEED_NAME` is CONDITIONAL — `inv_store.
   * keeper_user_id` is a real NOT NULL FK to `usr_user`, and this codebase's
   * migrations never seed a default user (System Admin/Auditor are seeded
   * as `usr_role` rows only, never a concrete `usr_user` account — real
   * users are always provisioned via the app's own signup/admin-invite flow,
   * out of migration scope). A fresh environment therefore has zero rows in
   * `usr_user` at the moment `0900` first runs. Rather than fail the whole
   * migration (or invent a throwaway system user nothing else references),
   * this method looks for the OLDEST existing `usr_user` row (by
   * `created_at`) and, if one exists, upserts the starter store pointing at
   * it as `keeper_user_id`; if none exists yet, the store is skipped
   * entirely (idempotent — a LATER re-run of this migration, once a real
   * user has been provisioned, will pick it up then, since `up()` runs this
   * method unconditionally every time and the category/store upserts are
   * both natural-key-idempotent). This is a pragmatic bootstrap-ordering
   * accommodation, not a design flaw — no other `09xx`-seeded row in this
   * codebase has a NOT NULL FK to `usr_user`.
   */
  private async seedInventoryStarterData(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO app.inv_category (id, name, parent_id)
      VALUES ($1, $2, NULL)
      ON CONFLICT (name) DO NOTHING
      `,
      [generateUuidV7(), INV_CATEGORY_SEED_NAME],
    );

    const userRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.usr_user ORDER BY created_at ASC LIMIT 1`,
    );
    if (userRows.length === 0) {
      return;
    }
    const keeperUserId = userRows[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.inv_store (id, name, location, keeper_user_id, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (name) DO UPDATE SET location = EXCLUDED.location
      `,
      [generateUuidV7(), INV_STORE_SEED_NAME, INV_STORE_SEED_LOCATION, keeperUserId],
    );
  }

  /** Module 14 (Expenses) — see `EXP_CATEGORY_SEED`'s own doc comment. */
  private async seedExpenseCategories(queryRunner: QueryRunner): Promise<void> {
    for (const category of EXP_CATEGORY_SEED) {
      const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        category.glAccountCode,
      ]);
      if (accountRows.length === 0) {
        throw new Error(
          `SeedPermissionsAndRoles0900.seedExpenseCategories: gl_account code=${category.glAccountCode} not found — seedChartOfAccounts() must run first`,
        );
      }
      const glExpenseAccountId = accountRows[0].id;

      await queryRunner.query(
        `
        INSERT INTO app.exp_category (id, name, gl_expense_account_id, budget_required, is_active)
        VALUES ($1, $2, $3, false, true)
        ON CONFLICT (name) DO UPDATE SET gl_expense_account_id = EXCLUDED.gl_expense_account_id, is_active = true
        `,
        [generateUuidV7(), category.name, glExpenseAccountId],
      );
    }
  }

  /**
   * Module 15 (Payroll) PASS B — idempotent upsert (by `(kind,
   * effective_from)`, `uq_pyrl_statutory_table_kind_effective_from`) of the
   * real Kenyan PAYE/NSSF/SHIF/AHL rate seed. See `PYRL_STATUTORY_TABLE_SEED`'s
   * own doc comment for the exact `params` shapes and
   * `PYRL_STATUTORY_SEED_DISCLAIMER` for the prominent provenance note
   * stored verbatim in every row's `source_note`.
   */
  private async seedPyrlStatutoryTables(queryRunner: QueryRunner): Promise<void> {
    for (const row of PYRL_STATUTORY_TABLE_SEED) {
      await queryRunner.query(
        `
        INSERT INTO app.pyrl_statutory_table (id, kind, effective_from, params, source_note)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (kind, effective_from) DO UPDATE SET
          params = EXCLUDED.params,
          source_note = EXCLUDED.source_note
        `,
        [generateUuidV7(), row.kind, PYRL_STATUTORY_SEED_EFFECTIVE_FROM, JSON.stringify(row.params), PYRL_STATUTORY_SEED_DISCLAIMER],
      );
    }
  }

  /** Module 15 (Payroll) PASS B — idempotent upsert (by `code`, `uq_pyrl_component_code`) of `PYRL_COMPONENT_SEED`. `seedChartOfAccounts()` must run first (every row's `gl_account_id` is resolved by code). */
  private async seedPyrlComponents(queryRunner: QueryRunner): Promise<void> {
    for (const component of PYRL_COMPONENT_SEED) {
      const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        component.glAccountCode,
      ]);
      if (accountRows.length === 0) {
        throw new Error(
          `SeedPermissionsAndRoles0900.seedPyrlComponents: gl_account code=${component.glAccountCode} not found — seedChartOfAccounts() must run first`,
        );
      }
      const glAccountId = accountRows[0].id;

      await queryRunner.query(
        `
        INSERT INTO app.pyrl_component (id, code, name, kind, is_taxable, is_statutory, gl_account_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          kind = EXCLUDED.kind,
          is_taxable = EXCLUDED.is_taxable,
          is_statutory = EXCLUDED.is_statutory,
          gl_account_id = EXCLUDED.gl_account_id
        `,
        [generateUuidV7(), component.code, component.name, component.kind, component.isTaxable, component.isStatutory, glAccountId],
      );
    }
  }

  /** Module 16 (Banking) — see `BANK_ACCOUNT_SEED`'s own doc comment. `seedChartOfAccounts()` must run first (each row's `gl_account_id` is resolved by code). */
  private async seedBankingStarterAccounts(queryRunner: QueryRunner): Promise<void> {
    for (const account of BANK_ACCOUNT_SEED) {
      const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        account.glAccountCode,
      ]);
      if (accountRows.length === 0) {
        throw new Error(
          `SeedPermissionsAndRoles0900.seedBankingStarterAccounts: gl_account code=${account.glAccountCode} not found — seedChartOfAccounts() must run first`,
        );
      }
      const glAccountId = accountRows[0].id;

      await queryRunner.query(
        `
        INSERT INTO app.bank_account (id, name, kind, gl_account_id, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, gl_account_id = EXCLUDED.gl_account_id, is_active = true
        `,
        [generateUuidV7(), account.name, account.kind, glAccountId],
      );
    }
  }

  /** Module 17 (Fixed Assets) — see `FA_CATEGORY_SEED`'s own doc comment. `seedChartOfAccounts()` must run first (every row's 3 GL account ids are resolved by code). */
  private async seedFixedAssetCategories(queryRunner: QueryRunner): Promise<void> {
    for (const category of FA_CATEGORY_SEED) {
      const costRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        category.costAccountCode,
      ]);
      const accumDepRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        category.accumDepAccountCode,
      ]);
      const depExpenseRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
        category.depExpenseAccountCode,
      ]);
      if (costRows.length === 0 || accumDepRows.length === 0 || depExpenseRows.length === 0) {
        throw new Error(
          `SeedPermissionsAndRoles0900.seedFixedAssetCategories: one of gl_account codes ${category.costAccountCode}/${category.accumDepAccountCode}/${category.depExpenseAccountCode} not found — seedChartOfAccounts() must run first`,
        );
      }

      await queryRunner.query(
        `
        INSERT INTO app.fa_category (id, name, method, life_months, rate, residual_pct, gl_cost_account_id, gl_accum_dep_account_id, gl_dep_expense_account_id)
        VALUES ($1, $2, $3, $4, NULL, 0, $5, $6, $7)
        ON CONFLICT (name) DO UPDATE SET
          method = EXCLUDED.method,
          life_months = EXCLUDED.life_months,
          gl_cost_account_id = EXCLUDED.gl_cost_account_id,
          gl_accum_dep_account_id = EXCLUDED.gl_accum_dep_account_id,
          gl_dep_expense_account_id = EXCLUDED.gl_dep_expense_account_id
        `,
        [
          generateUuidV7(),
          category.name,
          category.method,
          category.lifeMonths,
          costRows[0].id,
          accumDepRows[0].id,
          depExpenseRows[0].id,
        ],
      );
    }
  }

  private async upsertRole(
    queryRunner: QueryRunner,
    name: string,
    description: string,
    isAuditorClass: boolean,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.usr_role (id, name, description, is_system_template, is_auditor_class)
      VALUES ($1, $2, $3, true, $4)
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
      `,
      [generateUuidV7(), name, description, isAuditorClass],
    );
    return rows[0].id;
  }

  private async grantPermission(queryRunner: QueryRunner, roleId: string, permissionId: string): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO app.usr_role_permission (id, role_id, permission_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      [generateUuidV7(), roleId, permissionId],
    );
  }
}

/** Last calendar day of `year`-`month` (1-indexed), UTC — day 0 of the next month is the last day of this one. */
function lastDayOfUtcMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
