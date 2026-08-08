import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApprovalsModule } from "../platform/approvals";
import { SettingsModule } from "../platform/settings";
import { OutboxWriterService } from "../shared/events/outbox-writer.service";
import { AccountsController } from "./api/accounts.controller";
import { BudgetsController } from "./api/budgets.controller";
import { CostCentersController } from "./api/cost-centers.controller";
import { FiscalYearsController } from "./api/fiscal-years.controller";
import { IntegritySweepController } from "./api/integrity-sweep.controller";
import { JournalsController } from "./api/journals.controller";
import { BudgetsService } from "./application/budgets.service";
import { ChartOfAccountsService } from "./application/chart-of-accounts.service";
import { CostCentersService } from "./application/cost-centers.service";
import { FiscalYearsService } from "./application/fiscal-years.service";
import { IntegritySweepService } from "./application/integrity-sweep.service";
import { PostingService } from "./application/posting.service";
import { GlAccountEntity } from "./domain/gl-account.entity";
import { GlBudgetLineEntity } from "./domain/gl-budget-line.entity";
import { GlBudgetEntity } from "./domain/gl-budget.entity";
import { GlCostCenterEntity } from "./domain/gl-cost-center.entity";
import { GlFiscalYearEntity } from "./domain/gl-fiscal-year.entity";
import { GlIntegrityRunEntity } from "./domain/gl-integrity-run.entity";
import { GlJournalLineEntity } from "./domain/gl-journal-line.entity";
import { GlJournalEntity } from "./domain/gl-journal.entity";
import { GlPeriodAccountTotalEntity } from "./domain/gl-period-account-total.entity";
import { GlPeriodEntity } from "./domain/gl-period.entity";
import { GlAccountRepository } from "./infrastructure/gl-account.repository";
import { GlBudgetLineRepository } from "./infrastructure/gl-budget-line.repository";
import { GlBudgetRepository } from "./infrastructure/gl-budget.repository";
import { GlCostCenterRepository } from "./infrastructure/gl-cost-center.repository";
import { GlFiscalYearRepository } from "./infrastructure/gl-fiscal-year.repository";
import { GlIntegrityRunRepository } from "./infrastructure/gl-integrity-run.repository";
import { GlJournalLineRepository } from "./infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "./infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalRepository } from "./infrastructure/gl-period-account-total.repository";
import { GlPeriodRepository } from "./infrastructure/gl-period.repository";

/**
 * Application-layer pass (docs/phase-5/PROGRESS.md Module 7 — foundation
 * pass registered entities/repositories only, no services/controllers).
 * Imports `SettingsModule`/`ApprovalsModule` (not just types) — `PostingService`
 * calls `NumberingService.allocate()` and `BudgetsService` calls
 * `ApprovalEngineService.submit()` at runtime, both siblings' public surface
 * only (their barrel `index.ts` exports), per `module-deps.json`'s
 * `accounting` entry (`mayImport: ["shared", "platform/settings",
 * "platform/approvals"]`) and its documented rationale there.
 *
 * Exports `PostingService` prominently — it's this module's whole reason to
 * exist (the sole path to writing GL data) and every future domain module
 * (billing, payments, wallet, procurement, inventory, expenses, payroll,
 * banking, fixed-assets) is expected to import it from `accounting`'s
 * barrel and call `post()` inside its own transaction, mirroring how
 * `platform/settings`' `NumberingService.allocate()` and
 * `platform/approvals`' `ApprovalEngineService.submit()` are consumed.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
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
    ]),
    SettingsModule,
    ApprovalsModule,
  ],
  controllers: [
    AccountsController,
    FiscalYearsController,
    CostCentersController,
    BudgetsController,
    JournalsController,
    IntegritySweepController,
  ],
  providers: [
    GlAccountRepository,
    GlFiscalYearRepository,
    GlPeriodRepository,
    GlJournalRepository,
    GlJournalLineRepository,
    GlPeriodAccountTotalRepository,
    GlCostCenterRepository,
    GlBudgetRepository,
    GlBudgetLineRepository,
    GlIntegrityRunRepository,
    OutboxWriterService,
    PostingService,
    ChartOfAccountsService,
    FiscalYearsService,
    CostCentersService,
    BudgetsService,
    IntegritySweepService,
  ],
  exports: [
    GlAccountRepository,
    GlFiscalYearRepository,
    GlPeriodRepository,
    GlJournalRepository,
    GlJournalLineRepository,
    GlPeriodAccountTotalRepository,
    GlCostCenterRepository,
    GlBudgetRepository,
    GlBudgetLineRepository,
    GlIntegrityRunRepository,
    PostingService,
    ChartOfAccountsService,
    FiscalYearsService,
    CostCentersService,
    BudgetsService,
    IntegritySweepService,
  ],
})
export class AccountingModule {}
