/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 18
 * (Reporting Engine + Dashboard) is now ✅ COMPLETE (foundation + PASS A +
 * PASS B, docs/phase-5/PROGRESS.md): `rpt_*` entities/repositories + the 5
 * materialized views' read/refresh helper, the report registry
 * (`ReportRegistryService`) and all 16 reports (7 Pass A report-of-record
 * financial reports + 9 Pass B domain reports) plus the distinctly-gated
 * `AuditLogReport`, `DashboardKpisService`/`MvRefreshService`/
 * `ExportJobsService`/`ReportSchedulesService`, and the full `api/`
 * controller layer (not re-exported here — no sibling module ever imports
 * another's controllers, same convention every other domain module's
 * barrel establishes).
 */
export { ReportingModule } from "./reporting.module";

export {
  ReportRegistryService,
} from "./application/report-registry.service";
export type {
  ReportDefinition,
  ReportResult,
  ReportColumnDef,
  ReportColumnType,
  ReportParamType,
  ReportExecutionContext,
} from "./application/report-registry.service";
export { SavedParamsService } from "./application/saved-params.service";
export type { CreateSavedParamsInput, UpdateSavedParamsInput } from "./application/saved-params.service";
export { TrialBalanceReport } from "./application/trial-balance.report";
export type { TrialBalanceParams } from "./application/trial-balance.report";
export { BalanceSheetReport } from "./application/balance-sheet.report";
export type { BalanceSheetParams } from "./application/balance-sheet.report";
export { IncomeStatementReport } from "./application/income-statement.report";
export type { IncomeStatementParams } from "./application/income-statement.report";
export { GeneralLedgerReport } from "./application/general-ledger.report";
export type { GeneralLedgerParams } from "./application/general-ledger.report";
export { CashbookReport } from "./application/cashbook.report";
export type { CashbookParams } from "./application/cashbook.report";
export { StudentStatementReport } from "./application/student-statement.report";
export type { StudentStatementParams } from "./application/student-statement.report";
export { AgingOutstandingReport } from "./application/aging-outstanding.report";
export type { AgingOutstandingParams } from "./application/aging-outstanding.report";
export { CashFlowReport } from "./application/cash-flow.report";
export type { CashFlowParams } from "./application/cash-flow.report";
export { FeeCollectionReport } from "./application/fee-collection.report";
export type { FeeCollectionParams } from "./application/fee-collection.report";
export { ReceiptsRegisterReport } from "./application/receipts-register.report";
export type { ReceiptsRegisterParams } from "./application/receipts-register.report";
export { InvoicesRegisterReport } from "./application/invoices-register.report";
export type { InvoicesRegisterParams } from "./application/invoices-register.report";
export { PayrollSummaryReport } from "./application/payroll-summary.report";
export type { PayrollSummaryParams } from "./application/payroll-summary.report";
export { ExpenseSummaryReport } from "./application/expense-summary.report";
export type { ExpenseSummaryParams } from "./application/expense-summary.report";
export { SupplierStatementReport } from "./application/supplier-statement.report";
export type { SupplierStatementParams } from "./application/supplier-statement.report";
export { WalletActivityReport } from "./application/wallet-activity.report";
export type { WalletActivityParams } from "./application/wallet-activity.report";
export { StatutorySummaryReport } from "./application/statutory-summary.report";
export type { StatutorySummaryParams } from "./application/statutory-summary.report";
export { AuditLogReport } from "./application/audit-log.report";
export type { AuditLogReportParams } from "./application/audit-log.report";

export { DashboardKpisService } from "./application/dashboard-kpis.service";
export type {
  CollectionTrendBucket,
  CollectionTrendChartInput,
  CollectionTrendPoint,
  IncomeVsExpenseChartInput,
  IncomeVsExpensePoint,
  CollectionRateResult,
} from "./application/dashboard-kpis.service";
export { MvRefreshService } from "./application/mv-refresh.service";
export { ExportJobsService } from "./application/export-jobs.service";
export type { ExportJobFormat, CreateExportJobInput } from "./application/export-jobs.service";
export { buildCsv } from "./application/csv-export.util";
export { ReportSchedulesService } from "./application/report-schedules.service";
export type { CreateScheduleInput, UpdateScheduleInput, RunDueResult } from "./application/report-schedules.service";

export { RptSavedParamsEntity } from "./domain/rpt-saved-params.entity";
export { RptScheduleEntity, RPT_SCHEDULE_FORMATS } from "./domain/rpt-schedule.entity";
export type { RptScheduleFormat } from "./domain/rpt-schedule.entity";
export { RptExportJobEntity, RPT_EXPORT_JOB_STATUSES } from "./domain/rpt-export-job.entity";
export type { RptExportJobStatus } from "./domain/rpt-export-job.entity";

export { MvDailyCollectionsRow } from "./domain/mv-daily-collections.view-entity";
export { MvArSummaryRow } from "./domain/mv-ar-summary.view-entity";
export type { MvArSummaryAgingBucket } from "./domain/mv-ar-summary.view-entity";
export { MvIncomeExpenseRow } from "./domain/mv-income-expense.view-entity";
export type { MvIncomeExpenseAccountClass } from "./domain/mv-income-expense.view-entity";
export { MvWalletLiabilityRow } from "./domain/mv-wallet-liability.view-entity";
export { MvDefaultersRow } from "./domain/mv-defaulters.view-entity";

export { RptSavedParamsRepository } from "./infrastructure/rpt-saved-params.repository";
export { RptScheduleRepository } from "./infrastructure/rpt-schedule.repository";
export { RptExportJobRepository } from "./infrastructure/rpt-export-job.repository";
export { AuditLogRepository } from "./infrastructure/audit-log.repository";
export type { AuditLogSearchFilter } from "./infrastructure/audit-log.repository";
export {
  MaterializedViewsRepository,
  REPORTING_MATERIALIZED_VIEW_NAMES,
} from "./infrastructure/materialized-views.repository";
export type { ReportingMaterializedViewName } from "./infrastructure/materialized-views.repository";
