import { Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { BillingModule } from "../billing";
import { StudentsModule } from "../students";
import { PayrollModule } from "../payroll";
import { ProcurementModule } from "../procurement";
import { FilesModule } from "../../platform/files";
import { CommsModule } from "../../platform/comms";
import { AuditLogEntity } from "../../shared/audit/audit-log.entity";
import { RptSavedParamsEntity } from "./domain/rpt-saved-params.entity";
import { RptScheduleEntity } from "./domain/rpt-schedule.entity";
import { RptExportJobEntity } from "./domain/rpt-export-job.entity";
import { RptSavedParamsRepository } from "./infrastructure/rpt-saved-params.repository";
import { RptScheduleRepository } from "./infrastructure/rpt-schedule.repository";
import { RptExportJobRepository } from "./infrastructure/rpt-export-job.repository";
import { AuditLogRepository } from "./infrastructure/audit-log.repository";
import { MaterializedViewsRepository } from "./infrastructure/materialized-views.repository";
import { ReportRegistryService } from "./application/report-registry.service";
import { SavedParamsService } from "./application/saved-params.service";
import { TrialBalanceReport } from "./application/trial-balance.report";
import { BalanceSheetReport } from "./application/balance-sheet.report";
import { IncomeStatementReport } from "./application/income-statement.report";
import { GeneralLedgerReport } from "./application/general-ledger.report";
import { CashbookReport } from "./application/cashbook.report";
import { StudentStatementReport } from "./application/student-statement.report";
import { AgingOutstandingReport } from "./application/aging-outstanding.report";
import { CashFlowReport } from "./application/cash-flow.report";
import { FeeCollectionReport } from "./application/fee-collection.report";
import { ReceiptsRegisterReport } from "./application/receipts-register.report";
import { InvoicesRegisterReport } from "./application/invoices-register.report";
import { PayrollSummaryReport } from "./application/payroll-summary.report";
import { ExpenseSummaryReport } from "./application/expense-summary.report";
import { SupplierStatementReport } from "./application/supplier-statement.report";
import { WalletActivityReport } from "./application/wallet-activity.report";
import { StatutorySummaryReport } from "./application/statutory-summary.report";
import { AuditLogReport } from "./application/audit-log.report";
import { DashboardKpisService } from "./application/dashboard-kpis.service";
import { MvRefreshService } from "./application/mv-refresh.service";
import { ExportJobsService } from "./application/export-jobs.service";
import { ReportSchedulesService } from "./application/report-schedules.service";
import { ReportsController } from "./api/reports.controller";
import { DashboardController } from "./api/dashboard.controller";
import { ExportJobsController } from "./api/export-jobs.controller";
import { SchedulesController } from "./api/schedules.controller";
import { AuditLogController } from "./api/audit-log.controller";

/** Every Pass A + Pass B report class, in one place — the single array `onModuleInit()` walks to register each report individually (see that method's own doc comment for why NOT a `.forEach()` loop). */
const ALL_REPORT_PROVIDERS = [
  TrialBalanceReport,
  BalanceSheetReport,
  IncomeStatementReport,
  GeneralLedgerReport,
  CashbookReport,
  StudentStatementReport,
  AgingOutstandingReport,
  CashFlowReport,
  FeeCollectionReport,
  ReceiptsRegisterReport,
  InvoicesRegisterReport,
  PayrollSummaryReport,
  ExpenseSummaryReport,
  SupplierStatementReport,
  WalletActivityReport,
  StatutorySummaryReport,
  AuditLogReport,
] as const;

/**
 * Module 18 (Reporting Engine + Dashboard) — **PASS B, now ✅ COMPLETE**
 * (docs/phase-5/PROGRESS.md). On top of the foundation pass (3 `rpt_*`
 * entities/repos + 5 materialized views) and PASS A (report registry + 7
 * report-of-record financial reports), this pass adds: 9 more domain
 * reports (`CashFlowReport`/`FeeCollectionReport`/`ReceiptsRegisterReport`/
 * `InvoicesRegisterReport`/`PayrollSummaryReport`/`ExpenseSummaryReport`/
 * `SupplierStatementReport`/`WalletActivityReport`/`StatutorySummaryReport`),
 * plus the distinctly-privileged `AuditLogReport`; `DashboardKpisService`
 * (reads the 5 MVs — the module's whole reason to exist, per FR-DASH-002.1);
 * `MvRefreshService` (manual on-demand MV refresh); `ExportJobsService`
 * (real CSV generation, XLSX/PDF deferred); `ReportSchedulesService`
 * (`rpt_schedule` CRUD + manual `runDue()`); and the FULL `api/` layer — 5
 * controllers, all registered below (explicitly double-checked per the task
 * brief's own warning that a module forgetting its `controllers` array is a
 * real bug this codebase has hit before).
 *
 * **New sibling Nest module imports** (`PayrollModule`/`ProcurementModule`/
 * `FilesModule`/`CommsModule`) back real DI-injected cross-module
 * dependencies this pass's services/reports use:
 * `PayrollSummaryReport`/`StatutorySummaryReport`/`DashboardKpisService`
 * use `PyrlRunRepository`/`PyrlRunLineRepository` (`PayrollModule`);
 * `SupplierStatementReport` uses `ProcSupplierRepository`
 * (`ProcurementModule`); `ExportJobsService` uses `FilesService`
 * (`FilesModule`, for CSV upload); `ReportSchedulesService` uses
 * `NotificationsService` (`CommsModule`, for FR-RPT-007.1 delivery). Several
 * reports read `pay_receipt`/`pay_receipt_split`/`exp_voucher`/
 * `wall_transaction` via raw `DataSource.query()` (the same cross-table
 * style Pass A's `CashbookReport`/`GeneralLedgerReport` already
 * established) rather than a typed repository call — those domains
 * (`domains/payments`/`domains/expenses`/`domains/wallet`) were still added
 * to `module-deps.json`'s `mayImport` list per the task brief's own explicit
 * instruction (real conceptual read access to those domains' data), even
 * though no NestJS module import is needed for DI in those specific cases —
 * see that entry's own note for the full breakdown of which addition is a
 * genuine typed import vs. a documented raw-SQL table read.
 *
 * **`AuditLogEntity` (`shared/audit`) is registered directly in this
 * module's own `TypeOrmModule.forFeature([...])`** (alongside the 3 owned
 * `rpt_*` entities) so `AuditLogRepository`'s `@InjectRepository(AuditLogEntity)`
 * resolves — `shared/audit` is shared-kernel (importable by every module
 * without a `module-deps.json` exception), and `AuditLogEntity` is already
 * registered in `data-source.ts`'s global entities array (via
 * `platform/auth`'s own, separate `AuthAuditLogRepository` use), so this
 * `forFeature()` call attaches a SECOND, independent repository binding for
 * the SAME already-migrated table — a normal, supported TypeORM pattern for
 * two modules that each want their own narrow repository wrapper over one
 * shared table, not a duplicate migration/schema registration.
 *
 * **Redis for the dynamic per-report permission check** — `ReportsController`
 * injects `REDIS_CLIENT` (`shared/cache/redis.provider`) directly. This
 * module no longer registers its own local copy of `redisClientProvider` —
 * the `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides the
 * token once for the whole app (see that file's doc comment for the full
 * consolidation write-up; this module was one of 4 that used to each open
 * their own redundant Redis connection).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RptSavedParamsEntity, RptScheduleEntity, RptExportJobEntity, AuditLogEntity]),
    AccountingModule,
    StudentsModule,
    BillingModule,
    PayrollModule,
    ProcurementModule,
    FilesModule,
    CommsModule,
  ],
  // **Order matters here — a real routing bug, not stylistic.** `ReportsController`'s
  // `GET /reports/:code` is a single-segment wildcard that ALSO structurally matches
  // `GET /reports/audit-log` and `GET /reports/schedules` (both single extra path
  // segments off `/reports`) — Nest/Express registers routes in this array's order and
  // matches the FIRST pattern that fits, with no literal-vs-param prioritization of its
  // own. `AuditLogController`/`SchedulesController` (and `ExportJobsController`, listed
  // here too for the same reason, even though its own routes don't currently collide)
  // MUST be registered before `ReportsController` so their more specific literal routes
  // are tried first; `ReportsController` — the module's greediest wildcard — is listed
  // LAST deliberately. `DashboardController` has its own disjoint `/dashboard` prefix,
  // so its position here is inert either way.
  controllers: [DashboardController, ExportJobsController, SchedulesController, AuditLogController, ReportsController],
  providers: [
    RptSavedParamsRepository,
    RptScheduleRepository,
    RptExportJobRepository,
    AuditLogRepository,
    MaterializedViewsRepository,
    ReportRegistryService,
    SavedParamsService,
    ...ALL_REPORT_PROVIDERS,
    DashboardKpisService,
    MvRefreshService,
    ExportJobsService,
    ReportSchedulesService,
  ],
  exports: [
    RptSavedParamsRepository,
    RptScheduleRepository,
    RptExportJobRepository,
    AuditLogRepository,
    MaterializedViewsRepository,
    ReportRegistryService,
    SavedParamsService,
    ...ALL_REPORT_PROVIDERS,
    DashboardKpisService,
    MvRefreshService,
    ExportJobsService,
    ReportSchedulesService,
  ],
})
export class ReportingModule implements OnModuleInit {
  constructor(
    private readonly registry: ReportRegistryService,
    private readonly trialBalance: TrialBalanceReport,
    private readonly balanceSheet: BalanceSheetReport,
    private readonly incomeStatement: IncomeStatementReport,
    private readonly generalLedger: GeneralLedgerReport,
    private readonly cashbook: CashbookReport,
    private readonly studentStatement: StudentStatementReport,
    private readonly agingOutstanding: AgingOutstandingReport,
    private readonly cashFlow: CashFlowReport,
    private readonly feeCollection: FeeCollectionReport,
    private readonly receiptsRegister: ReceiptsRegisterReport,
    private readonly invoicesRegister: InvoicesRegisterReport,
    private readonly payrollSummary: PayrollSummaryReport,
    private readonly expenseSummary: ExpenseSummaryReport,
    private readonly supplierStatement: SupplierStatementReport,
    private readonly walletActivity: WalletActivityReport,
    private readonly statutorySummary: StatutorySummaryReport,
    private readonly auditLog: AuditLogReport,
  ) {}

  /**
   * Each `register()` call is written out individually rather than looped
   * over an array — see `ReportRegistryService`'s own doc comment and Pass
   * A's identical `onModuleInit()` for the full "why" (each report's
   * `execute()` takes a genuinely different, mutually-incompatible params
   * shape, so a single `.forEach()` over a heterogeneous array would force
   * `TParams` to infer one shared union type across every report and fail
   * to type-check). `ALL_REPORT_PROVIDERS` above still exists as a single
   * source of truth for the module's `providers`/`exports` arrays — only
   * the REGISTRATION calls stay individually written out.
   */
  onModuleInit(): void {
    this.registry.register(this.trialBalance);
    this.registry.register(this.balanceSheet);
    this.registry.register(this.incomeStatement);
    this.registry.register(this.generalLedger);
    this.registry.register(this.cashbook);
    this.registry.register(this.studentStatement);
    this.registry.register(this.agingOutstanding);
    this.registry.register(this.cashFlow);
    this.registry.register(this.feeCollection);
    this.registry.register(this.receiptsRegister);
    this.registry.register(this.invoicesRegister);
    this.registry.register(this.payrollSummary);
    this.registry.register(this.expenseSummary);
    this.registry.register(this.supplierStatement);
    this.registry.register(this.walletActivity);
    this.registry.register(this.statutorySummary);
    this.registry.register(this.auditLog);
  }
}
