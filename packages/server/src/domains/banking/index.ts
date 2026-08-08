/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 16
 * (Banking) is now ✅ COMPLETE: entities/repositories (foundation pass) +
 * `application/` services + `api/` controllers/DTOs (this pass).
 */
export { BankingModule } from "./banking.module";

export { BankAccountEntity, BANK_ACCOUNT_KINDS } from "./domain/bank-account.entity";
export type { BankAccountKind } from "./domain/bank-account.entity";
export { BankTransferEntity, BANK_TRANSFER_STATUSES } from "./domain/bank-transfer.entity";
export type { BankTransferStatus } from "./domain/bank-transfer.entity";
export { BankDepositEntity, BANK_DEPOSIT_WITHDRAWAL_STATUSES } from "./domain/bank-deposit.entity";
export type { BankDepositWithdrawalStatus } from "./domain/bank-deposit.entity";
export { BankWithdrawalEntity } from "./domain/bank-withdrawal.entity";
export { BankStatementImportEntity } from "./domain/bank-statement-import.entity";
export {
  BankStatementLineEntity,
  BANK_STATEMENT_LINE_RECON_STATES,
} from "./domain/bank-statement-line.entity";
export type { BankStatementLineReconState } from "./domain/bank-statement-line.entity";
export {
  BankReconciliationEntity,
  BANK_RECONCILIATION_STATUSES,
} from "./domain/bank-reconciliation.entity";
export type { BankReconciliationStatus } from "./domain/bank-reconciliation.entity";
export { BankReconMatchEntity } from "./domain/bank-recon-match.entity";
export { BankChequeBookEntity } from "./domain/bank-cheque-book.entity";
export { BankChequeLeafEntity, BANK_CHEQUE_LEAF_STATUSES } from "./domain/bank-cheque-leaf.entity";
export type { BankChequeLeafStatus } from "./domain/bank-cheque-leaf.entity";

export { BankAccountRepository } from "./infrastructure/bank-account.repository";
export type { ListBankAccountsFilter } from "./infrastructure/bank-account.repository";
export { BankTransferRepository } from "./infrastructure/bank-transfer.repository";
export type { ListBankTransfersFilter } from "./infrastructure/bank-transfer.repository";
export { BankDepositRepository } from "./infrastructure/bank-deposit.repository";
export type { ListBankDepositsFilter } from "./infrastructure/bank-deposit.repository";
export { BankWithdrawalRepository } from "./infrastructure/bank-withdrawal.repository";
export type { ListBankWithdrawalsFilter } from "./infrastructure/bank-withdrawal.repository";
export { BankStatementImportRepository } from "./infrastructure/bank-statement-import.repository";
export type { ListBankStatementImportsFilter } from "./infrastructure/bank-statement-import.repository";
export { BankStatementLineRepository } from "./infrastructure/bank-statement-line.repository";
export type { ListBankStatementLinesFilter } from "./infrastructure/bank-statement-line.repository";
export { BankReconciliationRepository } from "./infrastructure/bank-reconciliation.repository";
export type { ListBankReconciliationsFilter } from "./infrastructure/bank-reconciliation.repository";
export { BankReconMatchRepository } from "./infrastructure/bank-recon-match.repository";
export { BankChequeBookRepository } from "./infrastructure/bank-cheque-book.repository";
export type { ListBankChequeBooksFilter } from "./infrastructure/bank-cheque-book.repository";
export { BankChequeLeafRepository } from "./infrastructure/bank-cheque-leaf.repository";
export type { ListBankChequeLeavesFilter } from "./infrastructure/bank-cheque-leaf.repository";

export { BankAccountsService } from "./application/bank-accounts.service";
export type { CreateBankAccountInput, UpdateBankAccountInput } from "./application/bank-accounts.service";
export { BankTransfersService, BANK_TRANSFERS_APPROVAL_DOMAIN_CODE } from "./application/bank-transfers.service";
export type { CreateBankTransferInput } from "./application/bank-transfers.service";
export { DepositsService, BANK_DEPOSITS_APPROVAL_DOMAIN_CODE } from "./application/deposits.service";
export type { CreateBankDepositInput } from "./application/deposits.service";
export { WithdrawalsService, BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE } from "./application/withdrawals.service";
export type { CreateBankWithdrawalInput } from "./application/withdrawals.service";
export { BankStatementImportService } from "./application/bank-statement-import.service";
export type {
  BankStatementColumnMap,
  BankStatementMappingTemplate,
  DebitCreditConvention,
  ImportBankStatementLinesInput,
  ImportBankStatementLinesResult,
} from "./application/bank-statement-import.service";
export { ReconciliationService } from "./application/reconciliation.service";
export type {
  AutoMatchResult,
  AutoMatchSuggestion,
  CreateAdjustmentInput,
  StartReconciliationInput,
} from "./application/reconciliation.service";
export { ChequeBooksService } from "./application/cheque-books.service";
export type { CreateChequeBookInput } from "./application/cheque-books.service";
export { ChequeLeavesService } from "./application/cheque-leaves.service";
export type { IssueChequeLeafInput } from "./application/cheque-leaves.service";
export {
  UNDEPOSITED_FUNDS_ACCOUNT_CODE,
  BANK_CHARGES_EXPENSE_ACCOUNT_CODE,
  INTEREST_INCOME_ACCOUNT_CODE,
} from "./application/gl-banking-accounts.util";
