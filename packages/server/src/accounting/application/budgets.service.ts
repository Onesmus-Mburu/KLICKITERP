import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { ApprovalEngineService } from "../../platform/approvals";
import { runInTransaction } from "../../shared/database/tx";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { Money } from "../../shared/money/money";
import { BudgetActivatedEvent } from "../events/budget-activated.event";
import { GlBudgetEntity } from "../domain/gl-budget.entity";
import { GlBudgetLineEntity } from "../domain/gl-budget-line.entity";
import { GlAccountRepository } from "../infrastructure/gl-account.repository";
import { GlBudgetLineRepository } from "../infrastructure/gl-budget-line.repository";
import { GlBudgetRepository } from "../infrastructure/gl-budget.repository";
import { GlFiscalYearRepository } from "../infrastructure/gl-fiscal-year.repository";

/** `appr_workflow_def.domain_code` this module registers for budget approval — the consuming 0900 seed extension owns actually publishing a workflow def/version under this code (see budgets.service.ts doc comment). */
export const GL_BUDGET_APPROVAL_DOMAIN_CODE = "GL_BUDGET";

export interface CreateBudgetLineInput {
  accountId: string;
  costCenterId?: string | null;
  periodPhasing: Record<string, unknown>;
  annualAmount: Money;
}

export interface CreateBudgetInput {
  fiscalYearId: string;
  name: string;
  versionLabel: string;
  lines: CreateBudgetLineInput[];
}

export interface UpdateBudgetLineInput {
  periodPhasing?: Record<string, unknown>;
  annualAmount?: Money;
}

/**
 * CRUD for `gl_budget` + `gl_budget_line`, and the budget approval
 * lifecycle (`DRAFT -> PENDING_APPROVAL -> ACTIVE -> SUPERSEDED`).
 *
 * **Exactly-one-`ACTIVE`-per-`fiscal_year_id`**: enforced by
 * `uq_gl_budget_active_p` (partial unique index, `WHERE status='ACTIVE'`),
 * kept safe mid-flight by `onApprovalDecided()`'s unset-previous-then-set
 * transactional pattern — the same shape as `AcademicCalendarService.setCurrentYear`/
 * `.setCurrentTerm` and `ThemesService.publish()`: archive (SUPERSEDE) the
 * previous `ACTIVE` budget for the fiscal year inside the same transaction
 * as activating the new one, so the partial unique index is never violated
 * mid-flight.
 *
 * **`submitForApproval()`** sums every line's `annual_amount` and calls
 * `ApprovalEngineService.submit()` (`platform/approvals`, imported via its
 * public barrel per `module-deps.json`'s `accounting` entry) inside the same
 * transaction as the `status='PENDING_APPROVAL'`/`approval_ref` write —
 * mirrors every other domain module's expected `submit()` composition
 * pattern. Nothing in this pass seeds a `GL_BUDGET` `appr_workflow_def`/
 * `appr_workflow_version` row — `submit()` will reject with a
 * `ValidationException` ("no active appr_workflow_def registered") until an
 * operator (or a future seed migration) registers one via
 * `WorkflowDefinitionsService`/`WorkflowVersionsService`, exactly the same
 * bootstrapping gap every other domain module calling into Module 6 will
 * have on day one.
 *
 * **`onApprovalDecided(budgetId, approved)`** — a method other code calls
 * once a decision is known. **No event dispatcher exists anywhere in this
 * codebase yet** (same caveat as Communications module's trigger-binding
 * dispatch, and Approvals' own un-subscribed `ApprovalDecidedEvent`), so
 * this cannot wire itself automatically off `ApprovalEngineService.decide()`.
 * `budgets.controller.ts` exposes a manual `activate`/`reject` action as an
 * interim stand-in until a real dispatcher exists (documented on that
 * controller).
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly budgetRepository: GlBudgetRepository,
    private readonly budgetLineRepository: GlBudgetLineRepository,
    private readonly fiscalYearRepository: GlFiscalYearRepository,
    private readonly accountRepository: GlAccountRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async create(input: CreateBudgetInput, actorId: string | null): Promise<GlBudgetEntity> {
    await this.fiscalYearRepository.findByIdOrFail(input.fiscalYearId);
    for (const line of input.lines) {
      const account = await this.accountRepository.findByIdOrFail(line.accountId);
      if (!account.isPostable) {
        throw new ValidationException(`gl_budget_line account ${account.code} must be a postable account`);
      }
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const budget = await this.budgetRepository.create(
        {
          fiscalYearId: input.fiscalYearId,
          name: input.name,
          versionLabel: input.versionLabel,
          status: "DRAFT",
          approvalRef: null,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );

      for (const line of input.lines) {
        await this.budgetLineRepository.create(
          {
            budgetId: budget.id,
            accountId: line.accountId,
            costCenterId: line.costCenterId ?? null,
            periodPhasing: line.periodPhasing,
            annualAmount: line.annualAmount,
            createdBy: actorId,
            updatedBy: actorId,
          },
          manager,
        );
      }

      return budget;
    });
  }

  async findByIdOrFail(id: string): Promise<GlBudgetEntity> {
    return this.budgetRepository.findByIdOrFail(id);
  }

  async listByFiscalYear(fiscalYearId: string): Promise<GlBudgetEntity[]> {
    return this.budgetRepository.listByFiscalYear(fiscalYearId);
  }

  async listLines(budgetId: string): Promise<GlBudgetLineEntity[]> {
    return this.budgetLineRepository.listByBudget(budgetId);
  }

  /** Only while the parent budget is DRAFT — activated/pending budgets are frozen. */
  async addLine(budgetId: string, input: CreateBudgetLineInput, actorId: string | null): Promise<GlBudgetLineEntity> {
    const budget = await this.requireDraft(budgetId);
    const account = await this.accountRepository.findByIdOrFail(input.accountId);
    if (!account.isPostable) {
      throw new ValidationException(`gl_budget_line account ${account.code} must be a postable account`);
    }
    return this.budgetLineRepository.create(
      {
        budgetId: budget.id,
        accountId: input.accountId,
        costCenterId: input.costCenterId ?? null,
        periodPhasing: input.periodPhasing,
        annualAmount: input.annualAmount,
        createdBy: actorId,
        updatedBy: actorId,
      },
      this.dataSource.manager,
    );
  }

  async updateLine(lineId: string, changes: UpdateBudgetLineInput, actorId: string | null): Promise<GlBudgetLineEntity> {
    const line = await this.budgetLineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.budgetId);
    if (changes.periodPhasing !== undefined) line.periodPhasing = changes.periodPhasing;
    if (changes.annualAmount !== undefined) line.annualAmount = changes.annualAmount;
    line.updatedBy = actorId;
    return this.budgetLineRepository.save(line);
  }

  async removeLine(lineId: string): Promise<void> {
    const line = await this.budgetLineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.budgetId);
    await this.budgetLineRepository.delete(lineId);
  }

  /** Sums annual_amount across lines and attaches an approval instance under `GL_BUDGET_APPROVAL_DOMAIN_CODE` — see class doc comment. */
  async submitForApproval(budgetId: string, initiatorId: string): Promise<GlBudgetEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const budget = await this.budgetRepository.findByIdOrFail(budgetId, manager);
      if (budget.status !== "DRAFT") {
        throw new ValidationException(`Only a DRAFT budget can be submitted for approval (status=${budget.status})`);
      }
      const lines = await this.budgetLineRepository.listByBudget(budgetId, manager);
      if (lines.length === 0) {
        throw new ValidationException(`Budget ${budgetId} has no lines — nothing to submit`);
      }
      const amount = lines.reduce((sum, line) => sum.add(line.annualAmount), Money.ZERO);

      const instance = await this.approvalEngine.submit(manager, {
        domainCode: GL_BUDGET_APPROVAL_DOMAIN_CODE,
        entityType: "gl_budget",
        entityId: budget.id,
        amount,
        initiatorId,
      });

      budget.status = "PENDING_APPROVAL";
      budget.approvalRef = instance.id;
      budget.updatedBy = initiatorId;
      return this.budgetRepository.save(budget, manager);
    });
  }

  /**
   * Transitions `PENDING_APPROVAL -> ACTIVE` (archiving/superseding the
   * previous `ACTIVE` budget for the fiscal year) when `approved`, or back
   * to `DRAFT` on rejection. See class doc comment — no automatic wiring
   * exists yet, this is called explicitly (currently only from
   * `budgets.controller.ts`'s manual activate/reject endpoints).
   */
  async onApprovalDecided(budgetId: string, approved: boolean, actorId: string | null): Promise<GlBudgetEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const budget = await this.budgetRepository.findByIdOrFail(budgetId, manager);
      if (budget.status !== "PENDING_APPROVAL") {
        throw new ValidationException(`Budget ${budgetId} is not PENDING_APPROVAL (status=${budget.status})`);
      }

      if (!approved) {
        budget.status = "DRAFT";
        budget.updatedBy = actorId;
        return this.budgetRepository.save(budget, manager);
      }

      const previousActive = await this.budgetRepository.findActiveForFiscalYear(budget.fiscalYearId, manager);
      if (previousActive && previousActive.id !== budget.id) {
        previousActive.status = "SUPERSEDED";
        previousActive.updatedBy = actorId;
        await this.budgetRepository.save(previousActive, manager);
      }

      budget.status = "ACTIVE";
      budget.updatedBy = actorId;
      const saved = await this.budgetRepository.save(budget, manager);

      await this.outboxWriter.write(
        manager,
        new BudgetActivatedEvent(saved.id, {
          budgetId: saved.id,
          fiscalYearId: saved.fiscalYearId,
          supersededBudgetId: previousActive && previousActive.id !== saved.id ? previousActive.id : null,
          actorId,
        }),
      );

      return saved;
    });
  }

  private async requireDraft(budgetId: string, manager?: EntityManager): Promise<GlBudgetEntity> {
    const budget = await this.budgetRepository.findByIdOrFail(budgetId, manager);
    if (budget.status !== "DRAFT") {
      throw new ValidationException(`Budget ${budgetId} lines can only be edited while DRAFT (status=${budget.status})`);
    }
    return budget;
  }
}
