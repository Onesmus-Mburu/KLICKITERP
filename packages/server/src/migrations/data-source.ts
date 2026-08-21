import "reflect-metadata";
import { config } from "dotenv";
import { resolve } from "node:path";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "../shared/database/snake-naming.strategy";
import { OutboxEntity } from "../shared/events/outbox.entity";
import { OutboxConsumerMarkEntity } from "../shared/events/outbox-consumer-mark.entity";
import { AuditLogEntity } from "../shared/audit/audit-log.entity";
import { ChainAnchorEntity } from "../shared/audit/chain-anchor.entity";
import { UsrUserEntity } from "../platform/users/domain/usr-user.entity";
import { UsrRoleEntity } from "../platform/users/domain/usr-role.entity";
import { UsrPermissionEntity } from "../platform/users/domain/usr-permission.entity";
import { UsrUserRoleEntity } from "../platform/users/domain/usr-user-role.entity";
import { UsrRolePermissionEntity } from "../platform/users/domain/usr-role-permission.entity";
import { UsrDepartmentEntity } from "../platform/users/domain/usr-department.entity";
import { UsrSodRuleEntity } from "../platform/users/domain/usr-sod-rule.entity";
import { UsrSessionEntity } from "../platform/users/domain/usr-session.entity";
import { UsrLoginEventEntity } from "../platform/users/domain/usr-login-event.entity";
import { UsrPasswordHistoryEntity } from "../platform/users/domain/usr-password-history.entity";
import { UsrApiKeyEntity } from "../platform/users/domain/usr-api-key.entity";
import { SetSettingEntity } from "../platform/settings/domain/set-setting.entity";
import { SetAcademicYearEntity } from "../platform/settings/domain/set-academic-year.entity";
import { SetTermEntity } from "../platform/settings/domain/set-term.entity";
import { SetNumberingSeriesEntity } from "../platform/settings/domain/set-numbering-series.entity";
import { SetIntegrationConfigEntity } from "../platform/settings/domain/set-integration-config.entity";
import { SetCustomFieldDefEntity } from "../platform/settings/domain/set-custom-field-def.entity";
import { FileObjectEntity } from "../platform/files/domain/file-object.entity";
import { BrndThemeEntity } from "../platform/branding/domain/brnd-theme.entity";
import { CommTemplateEntity } from "../platform/comms/domain/comm-template.entity";
import { CommTriggerBindingEntity } from "../platform/comms/domain/comm-trigger-binding.entity";
import { CommBroadcastEntity } from "../platform/comms/domain/comm-broadcast.entity";
import { CommMessageEntity } from "../platform/comms/domain/comm-message.entity";
import { CommDeviceTokenEntity } from "../platform/comms/domain/comm-device-token.entity";
import { CommOptoutEntity } from "../platform/comms/domain/comm-optout.entity";
import { ApprWorkflowDefEntity } from "../platform/approvals/domain/appr-workflow-def.entity";
import { ApprWorkflowVersionEntity } from "../platform/approvals/domain/appr-workflow-version.entity";
import { ApprLevelEntity } from "../platform/approvals/domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../platform/approvals/domain/appr-routing-rule.entity";
import { ApprInstanceEntity } from "../platform/approvals/domain/appr-instance.entity";
import { ApprActionEntity } from "../platform/approvals/domain/appr-action.entity";
import { ApprDelegationEntity } from "../platform/approvals/domain/appr-delegation.entity";
import { DocvRecordEntity } from "../platform/document-verification/domain/docv-record.entity";
import { GlAccountEntity } from "../accounting/domain/gl-account.entity";
import { GlFiscalYearEntity } from "../accounting/domain/gl-fiscal-year.entity";
import { GlPeriodEntity } from "../accounting/domain/gl-period.entity";
import { GlJournalEntity } from "../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../accounting/domain/gl-journal-line.entity";
import { GlPeriodAccountTotalEntity } from "../accounting/domain/gl-period-account-total.entity";
import { GlCostCenterEntity } from "../accounting/domain/gl-cost-center.entity";
import { GlBudgetEntity } from "../accounting/domain/gl-budget.entity";
import { GlBudgetLineEntity } from "../accounting/domain/gl-budget-line.entity";
import { GlIntegrityRunEntity } from "../accounting/domain/gl-integrity-run.entity";
import { StdClassEntity } from "../domains/students/domain/std-class.entity";
import { StdStreamEntity } from "../domains/students/domain/std-stream.entity";
import { StdFeeGroupEntity } from "../domains/students/domain/std-fee-group.entity";
import { StdStudentEntity } from "../domains/students/domain/std-student.entity";
import { StdGuardianEntity } from "../domains/students/domain/std-guardian.entity";
import { StdStudentGuardianEntity } from "../domains/students/domain/std-student-guardian.entity";
import { StdLedgerEntryEntity } from "../domains/students/domain/std-ledger-entry.entity";
import { StdPromotionBatchEntity } from "../domains/students/domain/std-promotion-batch.entity";
import { BillFeeCategoryEntity } from "../domains/billing/domain/bill-fee-category.entity";
import { BillTransportRouteEntity } from "../domains/billing/domain/bill-transport-route.entity";
import { BillFeeStructureEntity } from "../domains/billing/domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domains/billing/domain/bill-fee-structure-line.entity";
import { BillStudentOptionalItemEntity } from "../domains/billing/domain/bill-student-optional-item.entity";
import { BillInvoiceEntity } from "../domains/billing/domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domains/billing/domain/bill-invoice-line.entity";
import { BillInstallmentEntity } from "../domains/billing/domain/bill-installment.entity";
import { BillConcessionSchemeEntity } from "../domains/billing/domain/bill-concession-scheme.entity";
import { BillConcessionEntity } from "../domains/billing/domain/bill-concession.entity";
import { BillSponsorEntity } from "../domains/billing/domain/bill-sponsor.entity";
import { BillSponsorAwardEntity } from "../domains/billing/domain/bill-sponsor-award.entity";
import { BillCreditNoteEntity } from "../domains/billing/domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "../domains/billing/domain/bill-credit-note-line.entity";
import { BillDebitNoteEntity } from "../domains/billing/domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "../domains/billing/domain/bill-debit-note-line.entity";
import { BillRefundVoucherEntity } from "../domains/billing/domain/bill-refund-voucher.entity";
import { BillLateFeePolicyEntity } from "../domains/billing/domain/bill-late-fee-policy.entity";
import { BillLateFeeBatchEntity } from "../domains/billing/domain/bill-late-fee-batch.entity";
import { BillStudentCreditEntity } from "../domains/billing/domain/bill-student-credit.entity";
import { BillStudentCreditEntryEntity } from "../domains/billing/domain/bill-student-credit-entry.entity";
import { PayCashierSessionEntity } from "../domains/payments/domain/pay-cashier-session.entity";
import { PayReceiptEntity } from "../domains/payments/domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "../domains/payments/domain/pay-receipt-split.entity";
import { PayReceiptAllocationEntity } from "../domains/payments/domain/pay-receipt-allocation.entity";
import { PayChequeEntity } from "../domains/payments/domain/pay-cheque.entity";
import { PayMpesaTransactionEntity } from "../domains/payments/domain/pay-mpesa-transaction.entity";
import { PaySuspenseItemEntity } from "../domains/payments/domain/pay-suspense-item.entity";
import { PayBulkAllocationBatchEntity } from "../domains/payments/domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "../domains/payments/domain/pay-bulk-allocation-batch-line.entity";
import { WallServicePointEntity } from "../domains/wallet/domain/wall-service-point.entity";
import { WallServicePointOperatorEntity } from "../domains/wallet/domain/wall-service-point-operator.entity";
import { WallWalletEntity } from "../domains/wallet/domain/wall-wallet.entity";
import { WallTransactionEntity } from "../domains/wallet/domain/wall-transaction.entity";
import { ProcSupplierEntity } from "../domains/procurement/domain/proc-supplier.entity";
import { ProcRequisitionEntity } from "../domains/procurement/domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domains/procurement/domain/proc-requisition-line.entity";
import { ProcQuotationEntity } from "../domains/procurement/domain/proc-quotation.entity";
import { ProcQuotationLineEntity } from "../domains/procurement/domain/proc-quotation-line.entity";
import { ProcPurchaseOrderEntity } from "../domains/procurement/domain/proc-purchase-order.entity";
import { ProcPoLineEntity } from "../domains/procurement/domain/proc-po-line.entity";
import { ProcGrnEntity } from "../domains/procurement/domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domains/procurement/domain/proc-grn-line.entity";
import { ProcSupplierInvoiceEntity } from "../domains/procurement/domain/proc-supplier-invoice.entity";
import { ProcPaymentVoucherEntity } from "../domains/procurement/domain/proc-payment-voucher.entity";
import { ProcVoucherAllocationEntity } from "../domains/procurement/domain/proc-voucher-allocation.entity";
import { ProcContractEntity } from "../domains/procurement/domain/proc-contract.entity";
import { InvCategoryEntity } from "../domains/inventory/domain/inv-category.entity";
import { InvStoreEntity } from "../domains/inventory/domain/inv-store.entity";
import { InvItemEntity } from "../domains/inventory/domain/inv-item.entity";
import { InvStockBalanceEntity } from "../domains/inventory/domain/inv-stock-balance.entity";
import { InvMovementEntity } from "../domains/inventory/domain/inv-movement.entity";
import { InvTransferEntity } from "../domains/inventory/domain/inv-transfer.entity";
import { InvTransferLineEntity } from "../domains/inventory/domain/inv-transfer-line.entity";
import { InvStockTakeEntity } from "../domains/inventory/domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domains/inventory/domain/inv-stock-take-line.entity";
import { ExpCategoryEntity } from "../domains/expenses/domain/exp-category.entity";
import { ExpVoucherEntity } from "../domains/expenses/domain/exp-voucher.entity";
import { ExpPettyCashFloatEntity } from "../domains/expenses/domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "../domains/expenses/domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "../domains/expenses/domain/exp-replenishment.entity";
import { ExpClaimEntity } from "../domains/expenses/domain/exp-claim.entity";
import { ExpClaimLineEntity } from "../domains/expenses/domain/exp-claim-line.entity";
import { ExpRecurringEntity } from "../domains/expenses/domain/exp-recurring.entity";
import { PyrlEmployeeEntity } from "../domains/payroll/domain/pyrl-employee.entity";
import { PyrlComponentEntity } from "../domains/payroll/domain/pyrl-component.entity";
import { PyrlSalaryStructureEntity } from "../domains/payroll/domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "../domains/payroll/domain/pyrl-structure-component.entity";
import { PyrlEmployeeAssignmentEntity } from "../domains/payroll/domain/pyrl-employee-assignment.entity";
import { PyrlEmployeeComponentEntity } from "../domains/payroll/domain/pyrl-employee-component.entity";
import { PyrlStatutoryTableEntity } from "../domains/payroll/domain/pyrl-statutory-table.entity";
import { PyrlLoanEntity } from "../domains/payroll/domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "../domains/payroll/domain/pyrl-loan-schedule.entity";
import { PyrlRunEntity } from "../domains/payroll/domain/pyrl-run.entity";
import { PyrlRunLineEntity } from "../domains/payroll/domain/pyrl-run-line.entity";
import { PyrlRunLineComponentEntity } from "../domains/payroll/domain/pyrl-run-line-component.entity";
import { PyrlRunLineLoanRecoveryEntity } from "../domains/payroll/domain/pyrl-run-line-loan-recovery.entity";
import { PyrlOneoffEntity } from "../domains/payroll/domain/pyrl-oneoff.entity";
import { BankAccountEntity } from "../domains/banking/domain/bank-account.entity";
import { BankTransferEntity } from "../domains/banking/domain/bank-transfer.entity";
import { BankDepositEntity } from "../domains/banking/domain/bank-deposit.entity";
import { BankWithdrawalEntity } from "../domains/banking/domain/bank-withdrawal.entity";
import { BankStatementImportEntity } from "../domains/banking/domain/bank-statement-import.entity";
import { BankStatementLineEntity } from "../domains/banking/domain/bank-statement-line.entity";
import { BankReconciliationEntity } from "../domains/banking/domain/bank-reconciliation.entity";
import { BankReconMatchEntity } from "../domains/banking/domain/bank-recon-match.entity";
import { BankChequeBookEntity } from "../domains/banking/domain/bank-cheque-book.entity";
import { BankChequeLeafEntity } from "../domains/banking/domain/bank-cheque-leaf.entity";
import { FaCategoryEntity } from "../domains/fixed-assets/domain/fa-category.entity";
import { FaAssetEntity } from "../domains/fixed-assets/domain/fa-asset.entity";
import { FaDepreciationRunEntity } from "../domains/fixed-assets/domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "../domains/fixed-assets/domain/fa-depreciation-line.entity";
import { FaMaintenanceEntity } from "../domains/fixed-assets/domain/fa-maintenance.entity";
import { FaTransferEntity } from "../domains/fixed-assets/domain/fa-transfer.entity";
import { FaDisposalEntity } from "../domains/fixed-assets/domain/fa-disposal.entity";
import { FaVerificationEntity } from "../domains/fixed-assets/domain/fa-verification.entity";
import { FaVerificationLineEntity } from "../domains/fixed-assets/domain/fa-verification-line.entity";
import { RptSavedParamsEntity } from "../domains/reporting/domain/rpt-saved-params.entity";
import { RptScheduleEntity } from "../domains/reporting/domain/rpt-schedule.entity";
import { RptExportJobEntity } from "../domains/reporting/domain/rpt-export-job.entity";
import { IntgWebhookSubscriptionEntity } from "../domains/integrations/domain/intg-webhook-subscription.entity";
import { IntgWebhookDeliveryEntity } from "../domains/integrations/domain/intg-webhook-delivery.entity";
import { IntgSyncLogEntity } from "../domains/integrations/domain/intg-sync-log.entity";
import { BkpBackupRunEntity } from "../domains/backups-ops/domain/bkp-backup-run.entity";
import { BkpRestoreRunEntity } from "../domains/backups-ops/domain/bkp-restore-run.entity";
import { LicenseEntity } from "../licensing/domain/license.entity";
import { ApiCallLogEntity } from "../licensing/domain/api-call-log.entity";
import { UsageSnapshotEntity } from "../licensing/domain/usage-snapshot.entity";
import { UpdateNoticeEntity } from "../licensing/domain/update-notice.entity";

// `dotenv`'s default `config()` resolves `.env` relative to `process.cwd()`, which is
// `packages/server` (not the repo root where `.env`/`.env.example` actually live) whenever this
// file is loaded via `pnpm --filter server run migration:*` or Jest run from that package — found
// running migrations for real for the first time (Phase 5 Full Verification): it silently no-ops
// (dotenv doesn't throw on a missing file) rather than erroring, so every env var silently falls
// back to its hardcoded default with no warning. Every default happens to be a valid, matching
// dev value (by design — see `AppConfigService`'s own doc comment), so this had zero effect on
// verification correctness, but it's a real latent bug for anyone who ever needs a REAL non-default
// `.env` value locally (a custom DB password, real JWT/license keys, etc.). Resolving explicitly
// against the repo root fixes it for every caller (all 31 integration specs import `AppDataSource`
// from this file, so this runs before their test bodies do).
config({ path: resolve(__dirname, "../../../../.env") });

/**
 * Migrations run under `kfe_migrate` (DDL-only role) per M-5 — never the
 * app-boot `kfe_app` role. `schema: "app"` is the Postgres default schema
 * for entities that don't declare their own (docs/phase-4/01-standards-and-migrations.md
 * §1) — audit.* entities set their schema explicitly and are unaffected.
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_MIGRATION_USER ?? "kfe_migrate",
  password: process.env.DB_MIGRATION_PASSWORD ?? "changeme",
  database: process.env.DB_NAME ?? "klickit_dev",
  schema: "app",
  ssl: process.env.DB_SSL === "true",
  namingStrategy: new SnakeNamingStrategy(),
  entities: [
    OutboxEntity,
    OutboxConsumerMarkEntity,
    AuditLogEntity,
    ChainAnchorEntity,
    UsrUserEntity,
    UsrRoleEntity,
    UsrPermissionEntity,
    UsrUserRoleEntity,
    UsrRolePermissionEntity,
    UsrDepartmentEntity,
    UsrSodRuleEntity,
    UsrSessionEntity,
    UsrLoginEventEntity,
    UsrPasswordHistoryEntity,
    UsrApiKeyEntity,
    SetSettingEntity,
    SetAcademicYearEntity,
    SetTermEntity,
    SetNumberingSeriesEntity,
    SetIntegrationConfigEntity,
    SetCustomFieldDefEntity,
    FileObjectEntity,
    BrndThemeEntity,
    CommTemplateEntity,
    CommTriggerBindingEntity,
    CommBroadcastEntity,
    CommMessageEntity,
    CommDeviceTokenEntity,
    CommOptoutEntity,
    ApprWorkflowDefEntity,
    ApprWorkflowVersionEntity,
    ApprLevelEntity,
    ApprRoutingRuleEntity,
    ApprInstanceEntity,
    ApprActionEntity,
    ApprDelegationEntity,
    // Phase 6 Slice 16 (Part 1 — Document Security: Watermark + QR
    // Verification backend) — a new small platform module, not one of the
    // original 21 phase-5 modules; placed here (end of the platform-module
    // block, before accounting-core) for the same reason the phase-5 blocks
    // are grouped by module rather than alphabetically.
    DocvRecordEntity,
    GlAccountEntity,
    GlFiscalYearEntity,
    GlPeriodEntity,
    GlJournalEntity,
    GlJournalLineEntity,
    GlPeriodAccountTotalEntity,
    GlCostCenterEntity,
    GlBudgetEntity,
    GlBudgetLineEntity,
    GlIntegrityRunEntity,
    StdClassEntity,
    StdStreamEntity,
    StdFeeGroupEntity,
    StdStudentEntity,
    StdGuardianEntity,
    StdStudentGuardianEntity,
    StdLedgerEntryEntity,
    StdPromotionBatchEntity,
    BillFeeCategoryEntity,
    BillTransportRouteEntity,
    BillFeeStructureEntity,
    BillFeeStructureLineEntity,
    BillStudentOptionalItemEntity,
    BillInvoiceEntity,
    BillInvoiceLineEntity,
    BillInstallmentEntity,
    BillConcessionSchemeEntity,
    BillConcessionEntity,
    BillSponsorEntity,
    BillSponsorAwardEntity,
    BillCreditNoteEntity,
    BillCreditNoteLineEntity,
    BillDebitNoteEntity,
    BillDebitNoteLineEntity,
    BillRefundVoucherEntity,
    BillLateFeePolicyEntity,
    BillLateFeeBatchEntity,
    BillStudentCreditEntity,
    BillStudentCreditEntryEntity,
    PayCashierSessionEntity,
    PayReceiptEntity,
    PayReceiptSplitEntity,
    PayReceiptAllocationEntity,
    PayChequeEntity,
    PayMpesaTransactionEntity,
    PaySuspenseItemEntity,
    PayBulkAllocationBatchEntity,
    PayBulkAllocationBatchLineEntity,
    WallServicePointEntity,
    WallServicePointOperatorEntity,
    WallWalletEntity,
    WallTransactionEntity,
    ProcSupplierEntity,
    ProcRequisitionEntity,
    ProcRequisitionLineEntity,
    ProcQuotationEntity,
    ProcQuotationLineEntity,
    ProcPurchaseOrderEntity,
    ProcPoLineEntity,
    ProcGrnEntity,
    ProcGrnLineEntity,
    ProcSupplierInvoiceEntity,
    ProcPaymentVoucherEntity,
    ProcVoucherAllocationEntity,
    ProcContractEntity,
    InvCategoryEntity,
    InvStoreEntity,
    InvItemEntity,
    InvStockBalanceEntity,
    InvMovementEntity,
    InvTransferEntity,
    InvTransferLineEntity,
    InvStockTakeEntity,
    InvStockTakeLineEntity,
    ExpCategoryEntity,
    ExpVoucherEntity,
    ExpPettyCashFloatEntity,
    ExpPettyCashVoucherEntity,
    ExpReplenishmentEntity,
    ExpClaimEntity,
    ExpClaimLineEntity,
    ExpRecurringEntity,
    PyrlEmployeeEntity,
    PyrlComponentEntity,
    PyrlSalaryStructureEntity,
    PyrlStructureComponentEntity,
    PyrlEmployeeAssignmentEntity,
    PyrlEmployeeComponentEntity,
    PyrlStatutoryTableEntity,
    PyrlLoanEntity,
    PyrlLoanScheduleEntity,
    PyrlRunEntity,
    PyrlRunLineEntity,
    PyrlRunLineComponentEntity,
    PyrlRunLineLoanRecoveryEntity,
    PyrlOneoffEntity,
    BankAccountEntity,
    BankTransferEntity,
    BankDepositEntity,
    BankWithdrawalEntity,
    BankStatementImportEntity,
    BankStatementLineEntity,
    BankReconciliationEntity,
    BankReconMatchEntity,
    BankChequeBookEntity,
    BankChequeLeafEntity,
    FaCategoryEntity,
    FaAssetEntity,
    FaDepreciationRunEntity,
    FaDepreciationLineEntity,
    FaMaintenanceEntity,
    FaTransferEntity,
    FaDisposalEntity,
    FaVerificationEntity,
    FaVerificationLineEntity,
    RptSavedParamsEntity,
    RptScheduleEntity,
    RptExportJobEntity,
    IntgWebhookSubscriptionEntity,
    IntgWebhookDeliveryEntity,
    IntgSyncLogEntity,
    BkpBackupRunEntity,
    BkpRestoreRunEntity,
    // Module 21 (Licensing) — the only 4 entities in this codebase that set
    // their own `schema: "license"` (isolated per ADR-002) rather than
    // inheriting this DataSource's default `schema: "app"`, same treatment
    // `AuditLogEntity`/`ChainAnchorEntity` (`schema: "audit"`) already get.
    LicenseEntity,
    ApiCallLogEntity,
    UsageSnapshotEntity,
    UpdateNoticeEntity,
    // NOTE: the 5 Module-18 materialized-view "entities"
    // (domains/reporting/domain/mv-*.view-entity.ts) are deliberately NOT
    // listed here. They are plain DTO classes, not TypeORM @Entity/@ViewEntity
    // classes — they carry no PK/migration lifecycle in the normal TypeORM
    // sense (each is a GROUP BY aggregate keyed by a composite of dimensions,
    // refreshed via raw `REFRESH MATERIALIZED VIEW CONCURRENTLY`, never
    // written via the ORM). They're queried via plain `DataSource.query()` in
    // `MaterializedViewsRepository` instead — see that class's own doc
    // comment for the full reasoning.
  ],
  // `[0-9][0-9][0-9][0-9]-*.ts` (not `*.ts`) so this glob only ever matches the numbered
  // migration files (`0001-create-extensions.ts`, etc.) and never `data-source.ts` itself —
  // found running `migration:run` for real for the first time (Phase 5 Full Verification):
  // a bare `*.ts` glob pulls this very file in as an "exported class" candidate, and
  // `DirectoryExportedClassesLoader.loadFileClasses` recursing into the exported `AppDataSource`
  // object's own properties (which are circular — e.g. `manager.connection === this`) blew the
  // call stack (`RangeError: Maximum call stack size exceeded`) before a single migration ran.
  migrations: [`${__dirname}/[0-9][0-9][0-9][0-9]-*.ts`],
  migrationsTableName: "typeorm_migrations",
});

// NOTE: intentionally no `export default` here. TypeORM's CLI (`CommandUtils.loadDataSource`,
// used by `migration:run`/`migration:revert`/`migration:show` via the `-d` flag) enumerates
// EVERY export of this file and collects every one that is a DataSource instance; a `default`
// export re-exporting the same `AppDataSource` object makes it find two matches and throw
// "Given data source file must contain only one export of DataSource instance". Found running
// `migration:run` for real for the first time (Phase 5 Full Verification) — every one of the 31
// integration specs already imports the named `{ AppDataSource }` export, so that's the one kept.
