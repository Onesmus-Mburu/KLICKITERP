/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 10
 * (Payments) is now **fully complete** (foundation + PASS A + PASS B,
 * docs/phase-5/PROGRESS.md): all 7 application services, the M-Pesa
 * ports/adapters, and every domain entity/repository are exported here.
 * `api`/controllers are NOT re-exported (per this codebase's convention —
 * controllers are wired directly in `payments.module.ts`, never imported by
 * a sibling module).
 */
export { PaymentsModule } from "./payments.module";

export { CashierSessionsService, SESSION_VARIANCE_TOLERANCE_SETTING_KEY } from "./application/cashier-sessions.service";
export type { CloseSessionApproval } from "./application/cashier-sessions.service";
export { AllocationService, ALLOCATION_DEFAULT_RULE_SETTING_KEY } from "./application/allocation.service";
export type { AllocationRule, ResolveAllocationsInput, ResolvedAllocation } from "./application/allocation.service";
export {
  ReceiptsService,
  PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE,
  NON_REVERSIBLE_RECEIPT_SPLIT_METHODS,
  PAYMENT_RECEIPT_DOCUMENT_TYPE,
} from "./application/receipts.service";
export type {
  CaptureReceiptInput,
  CaptureReceiptSplitInput,
  CaptureReceiptChequeDetailsInput,
  ReceiptReversalReasonCode,
  RecordWalletFundedReceiptInput,
  RecordWalletFundedReceiptAllocationInput,
  ApplyStudentCreditToInvoicesInput,
  ApplyStudentCreditAllocationResult,
  ApplyStudentCreditShortfallResult,
  ApplyStudentCreditToInvoicesResult,
} from "./application/receipts.service";
export { resolveClearingAccount } from "./application/payment-clearing-accounts.util";

export {
  MpesaService,
  MPESA_SHORTCODE_SETTING_KEY,
  C2B_BILL_REF_PATTERNS_SETTING_KEY,
  MPESA_SYSTEM_ACTOR_SETTING_KEY,
} from "./application/mpesa.service";
export type { InitiateStkInput, InitiateB2cInput } from "./application/mpesa.service";
export { SuspenseService } from "./application/suspense.service";
export {
  ChequesService,
  BOUNCE_FEE_CATEGORY_NAME,
  CHEQUE_BOUNCE_FEE_AMOUNT_SETTING_KEY,
} from "./application/cheques.service";
export { BulkAllocationService } from "./application/bulk-allocation.service";
export type { CreateBulkAllocationLineInput } from "./application/bulk-allocation.service";

export type {
  MpesaPort,
  MpesaStkPushInput,
  MpesaStkPushResult,
  MpesaStkStatusResult,
  MpesaB2cPaymentInput,
  MpesaB2cPaymentResult,
} from "./infrastructure/ports/mpesa.port";
export { DarajaAdapter } from "./infrastructure/adapters/daraja.adapter";
export type { DarajaConfig } from "./infrastructure/adapters/daraja.adapter";
export { MpesaLogOnlyAdapter } from "./infrastructure/adapters/mpesa-log-only.adapter";
export { MpesaAdapterResolverService } from "./infrastructure/mpesa-adapter-resolver.service";

export {
  PayCashierSessionEntity,
  PAY_CASHIER_SESSION_STATUSES,
} from "./domain/pay-cashier-session.entity";
export type { PayCashierSessionStatus } from "./domain/pay-cashier-session.entity";
export { PayReceiptEntity, PAY_RECEIPT_STATUSES } from "./domain/pay-receipt.entity";
export type { PayReceiptStatus } from "./domain/pay-receipt.entity";
export { PayReceiptSplitEntity, PAY_RECEIPT_SPLIT_METHODS } from "./domain/pay-receipt-split.entity";
export type { PayReceiptSplitMethod } from "./domain/pay-receipt-split.entity";
export { PayReceiptAllocationEntity } from "./domain/pay-receipt-allocation.entity";
export { PayChequeEntity, PAY_CHEQUE_STATUSES } from "./domain/pay-cheque.entity";
export type { PayChequeStatus } from "./domain/pay-cheque.entity";
export {
  PayMpesaTransactionEntity,
  PAY_MPESA_TRANSACTION_KINDS,
  PAY_MPESA_TRANSACTION_STATES,
  PAY_MPESA_TRANSACTION_OPEN_STATES,
} from "./domain/pay-mpesa-transaction.entity";
export type { PayMpesaTransactionKind, PayMpesaTransactionState } from "./domain/pay-mpesa-transaction.entity";
export {
  PaySuspenseItemEntity,
  PAY_SUSPENSE_ITEM_SOURCES,
  PAY_SUSPENSE_ITEM_STATES,
} from "./domain/pay-suspense-item.entity";
export type { PaySuspenseItemSource, PaySuspenseItemState } from "./domain/pay-suspense-item.entity";
export {
  PayBulkAllocationBatchEntity,
  PAY_BULK_ALLOCATION_BATCH_STATUSES,
} from "./domain/pay-bulk-allocation-batch.entity";
export type { PayBulkAllocationBatchStatus } from "./domain/pay-bulk-allocation-batch.entity";
export { PayBulkAllocationBatchLineEntity } from "./domain/pay-bulk-allocation-batch-line.entity";

export { PayCashierSessionRepository } from "./infrastructure/pay-cashier-session.repository";
export { PayReceiptRepository } from "./infrastructure/pay-receipt.repository";
export { PayReceiptSplitRepository } from "./infrastructure/pay-receipt-split.repository";
export { PayReceiptAllocationRepository } from "./infrastructure/pay-receipt-allocation.repository";
export { PayChequeRepository } from "./infrastructure/pay-cheque.repository";
export { PayMpesaTransactionRepository } from "./infrastructure/pay-mpesa-transaction.repository";
export { PaySuspenseItemRepository } from "./infrastructure/pay-suspense-item.repository";
export { PayBulkAllocationBatchRepository } from "./infrastructure/pay-bulk-allocation-batch.repository";
export { PayBulkAllocationBatchLineRepository } from "./infrastructure/pay-bulk-allocation-batch-line.repository";
