/**
 * Public barrel — the only surface any future domain module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). `PostingService`
 * is the headline export (see its doc comment) — every future domain
 * module (billing, payments, wallet, procurement, inventory, expenses,
 * payroll, banking, fixed-assets) imports it from here and calls `post()`
 * inside its own transaction, mirroring how `platform/settings`'
 * `NumberingService.allocate()` and `platform/approvals`'
 * `ApprovalEngineService.submit()` are consumed.
 */
export { AccountingModule } from "./accounting.module";

export { PostingService, POSTING_SERVICE_APPLICATION_NAME } from "./application/posting.service";
export type { PostJournalDraft, PostJournalLineDraft, GlJournalWithLines } from "./application/posting.service";
export { ChartOfAccountsService } from "./application/chart-of-accounts.service";
export type { CreateGlAccountInput, UpdateGlAccountInput, GlAccountTreeNode } from "./application/chart-of-accounts.service";
export { FiscalYearsService } from "./application/fiscal-years.service";
export type { CreateFiscalYearInput } from "./application/fiscal-years.service";
export { CostCentersService } from "./application/cost-centers.service";
export type { CreateCostCenterInput } from "./application/cost-centers.service";
export { BudgetsService, GL_BUDGET_APPROVAL_DOMAIN_CODE } from "./application/budgets.service";
export type { CreateBudgetInput, CreateBudgetLineInput, UpdateBudgetLineInput } from "./application/budgets.service";
export { IntegritySweepService } from "./application/integrity-sweep.service";

export { JournalPostedEvent } from "./events/journal-posted.event";
export type { JournalPostedPayload } from "./events/journal-posted.event";
export { PeriodClosedEvent } from "./events/period-closed.event";
export type { PeriodClosedPayload } from "./events/period-closed.event";
export { BudgetActivatedEvent } from "./events/budget-activated.event";
export type { BudgetActivatedPayload } from "./events/budget-activated.event";

export { GlAccountEntity, GL_ACCOUNT_CLASSES, GL_ACCOUNT_CONTROL_DOMAINS } from "./domain/gl-account.entity";
export type { GlAccountClass, GlAccountControlDomain } from "./domain/gl-account.entity";
export { GlFiscalYearEntity, GL_FISCAL_YEAR_STATUSES } from "./domain/gl-fiscal-year.entity";
export type { GlFiscalYearStatus } from "./domain/gl-fiscal-year.entity";
export { GlPeriodEntity, GL_PERIOD_STATUSES } from "./domain/gl-period.entity";
export type { GlPeriodStatus } from "./domain/gl-period.entity";
export { GlJournalEntity, GL_JOURNAL_TYPES } from "./domain/gl-journal.entity";
export type { GlJournalType } from "./domain/gl-journal.entity";
export { GlJournalLineEntity } from "./domain/gl-journal-line.entity";
export { GlPeriodAccountTotalEntity } from "./domain/gl-period-account-total.entity";
export { GlCostCenterEntity } from "./domain/gl-cost-center.entity";
export { GlBudgetEntity, GL_BUDGET_STATUSES } from "./domain/gl-budget.entity";
export type { GlBudgetStatus } from "./domain/gl-budget.entity";
export { GlBudgetLineEntity } from "./domain/gl-budget-line.entity";
export { GlIntegrityRunEntity } from "./domain/gl-integrity-run.entity";

export { GlAccountRepository } from "./infrastructure/gl-account.repository";
export type { ListGlAccountsFilter } from "./infrastructure/gl-account.repository";
export { GlFiscalYearRepository } from "./infrastructure/gl-fiscal-year.repository";
export { GlPeriodRepository } from "./infrastructure/gl-period.repository";
export { GlJournalRepository } from "./infrastructure/gl-journal.repository";
export { GlJournalLineRepository } from "./infrastructure/gl-journal-line.repository";
export { GlPeriodAccountTotalRepository } from "./infrastructure/gl-period-account-total.repository";
export { GlCostCenterRepository } from "./infrastructure/gl-cost-center.repository";
export { GlBudgetRepository } from "./infrastructure/gl-budget.repository";
export { GlBudgetLineRepository } from "./infrastructure/gl-budget-line.repository";
export { GlIntegrityRunRepository } from "./infrastructure/gl-integrity-run.repository";
