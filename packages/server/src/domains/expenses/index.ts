/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 14
 * (Expenses).
 */
export { ExpensesModule } from "./expenses.module";

export { CategoriesService } from "./application/categories.service";
export type { CreateCategoryInput, UpdateCategoryInput } from "./application/categories.service";
export { resolveExpenseClearingAccount, PETTY_CASH_FLOAT_ACCOUNT_CODE } from "./application/expense-clearing-accounts.util";
export { VouchersService, EXPENSES_APPROVAL_DOMAIN_CODE, EXPENSE_ATTACHMENT_THRESHOLD_SETTING_KEY, EXP_VOUCHER_FILE_ENTITY_TYPE } from "./application/vouchers.service";
export type { CreateVoucherInput, UpdateVoucherInput } from "./application/vouchers.service";
export { PettyCashService, PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE } from "./application/petty-cash.service";
export type { CreateFloatInput, SpendInput } from "./application/petty-cash.service";
export { ClaimsService, EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE, STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE } from "./application/claims.service";
export type { CreateClaimInput, AddClaimLineInput, UpdateClaimLineInput } from "./application/claims.service";
export { RecurringService, computeNextRunOn } from "./application/recurring.service";
export type { CreateRecurringInput, RecurringVoucherTemplate, RunDueResult } from "./application/recurring.service";

export { ExpCategoryEntity } from "./domain/exp-category.entity";
export { ExpVoucherEntity, EXP_VOUCHER_PAYEE_TYPES, EXP_VOUCHER_METHODS, EXP_VOUCHER_STATUSES } from "./domain/exp-voucher.entity";
export type { ExpVoucherPayeeType, ExpVoucherMethod, ExpVoucherStatus } from "./domain/exp-voucher.entity";
export { ExpPettyCashFloatEntity } from "./domain/exp-petty-cash-float.entity";
export { ExpPettyCashVoucherEntity, EXP_PETTY_CASH_VOUCHER_STATUSES } from "./domain/exp-petty-cash-voucher.entity";
export type { ExpPettyCashVoucherStatus } from "./domain/exp-petty-cash-voucher.entity";
export { ExpReplenishmentEntity, EXP_REPLENISHMENT_STATUSES } from "./domain/exp-replenishment.entity";
export type { ExpReplenishmentStatus } from "./domain/exp-replenishment.entity";
export { ExpClaimEntity, EXP_CLAIM_STATUSES, EXP_CLAIM_REIMBURSE_VIA } from "./domain/exp-claim.entity";
export type { ExpClaimStatus, ExpClaimReimburseVia } from "./domain/exp-claim.entity";
export { ExpClaimLineEntity } from "./domain/exp-claim-line.entity";
export { ExpRecurringEntity } from "./domain/exp-recurring.entity";

export { ExpCategoryRepository } from "./infrastructure/exp-category.repository";
export { ExpVoucherRepository } from "./infrastructure/exp-voucher.repository";
export { ExpPettyCashFloatRepository } from "./infrastructure/exp-petty-cash-float.repository";
export { ExpPettyCashVoucherRepository } from "./infrastructure/exp-petty-cash-voucher.repository";
export { ExpReplenishmentRepository } from "./infrastructure/exp-replenishment.repository";
export { ExpClaimRepository } from "./infrastructure/exp-claim.repository";
export { ExpClaimLineRepository } from "./infrastructure/exp-claim-line.repository";
export { ExpRecurringRepository } from "./infrastructure/exp-recurring.repository";
