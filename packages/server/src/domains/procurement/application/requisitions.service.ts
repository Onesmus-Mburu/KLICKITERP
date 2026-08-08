import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import {
  GlBudgetLineEntity,
  GlBudgetLineRepository,
  GlBudgetRepository,
  GlPeriodAccountTotalRepository,
  GlPeriodRepository,
} from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";
import {
  ListProcRequisitionsFilter,
  ProcRequisitionRepository,
} from "../infrastructure/proc-requisition.repository";
import { ProcRequisitionLineRepository } from "../infrastructure/proc-requisition-line.repository";

/** `appr_workflow_def.domain_code` this module submits requisitions under — Pass B's `0900` seed extension must register a workflow def/version under this code before `submit()` can succeed (the same bootstrapping gap every other domain module calling into Module 6 starts with — see `BudgetsService`'s own doc comment). */
export const PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE = "PROCUREMENT_REQUISITION";

export interface CreateRequisitionInput {
  requestedBy: string;
  departmentId: string;
  justification: string;
}

export interface CreateRequisitionLineInput {
  itemId?: string | null;
  freeText?: string | null;
  qty: string;
  estPrice: Money;
  budgetLineId?: string | null;
}

export interface UpdateRequisitionLineInput {
  itemId?: string | null;
  freeText?: string | null;
  qty?: string;
  estPrice?: Money;
  budgetLineId?: string | null;
}

interface BudgetSnapshotLine {
  requisitionLineId: string;
  budgeted: boolean;
  budgetLineId: string | null;
  accountId?: string;
  annualAmount?: string;
  actuals?: string;
  openCommitments?: string;
  available?: string;
  lineEstimate: string;
  withinAvailable?: boolean;
}

export interface BudgetSnapshot {
  checkedAt: string;
  lines: BudgetSnapshotLine[];
  totalEstimate: string;
}

/**
 * CRUD for `proc_requisition` + `proc_requisition_line` (lines editable only
 * while the parent sits `DRAFT`, per `ProcRequisitionLineEntity`'s own
 * `MutableBaseEntity` judgement call), plus the submit -> approve/reject ->
 * convert/cancel workflow (FR-PROC-002.1, BR-PROC-01, BR-PROC-02).
 *
 * **Numbering** — unlike `proc_purchase_order`/`proc_grn` (whose `number` is
 * only meaningful once ISSUED/POSTED, so both defer real allocation to that
 * later step and start with a `DRAFT-<uuid>` placeholder, mirroring
 * `InvoicingService.generateInvoice()`'s precedent), a requisition has no
 * "posting" step — the whole document IS the request from the moment it's
 * created, and real procurement UX references a requisition by number from
 * day one. `create()` therefore allocates the real number via
 * `NumberingService.allocate(em, 'PROC_REQUISITION')` immediately, opening
 * its own transaction (the row-lock `allocate()` takes requires one).
 *
 * **`submit()`'s budget snapshot (FR-PROC-002.1, BR-PROC-02)** —
 * "available budget = budget − actuals − open commitments":
 *  - For each requisition line WITH a `budget_line_id` set: `budget` =
 *    that `gl_budget_line.annual_amount`; `actuals` = re-derived by summing
 *    `gl_period_account_total.debit_total - credit_total` for that line's
 *    `(account_id, cost_center_id)` across every `gl_period` in the budget's
 *    own `gl_fiscal_year` (the only "actuals" concept this codebase exposes
 *    — accounting core has no separate running-actuals ledger, so this
 *    re-derives the same aggregate `IntegritySweepService.runSweep()`
 *    cross-checks against, scoped to one account/fiscal-year); `open
 *    commitments` is **approximated as zero** — a documented simplification:
 *    no queryable "committed but not yet actualized" concept exists anywhere
 *    in this codebase yet (it would mean summing every other still-open
 *    requisition/PO's estimate against the same budget line, which needs a
 *    dedicated commitment ledger this pass does not build). Lines with NO
 *    `budget_line_id` are recorded as `budgeted: false` — informational
 *    only, no check performed.
 *  - The snapshot is **informational, not a hard block** on submission: the
 *    task brief's own FR-PROC-002.1/BR-PROC-02 text says "the block/warn
 *    policy of the budget line governs approval" — but `gl_budget_line`'s
 *    DDL (see its entity's doc comment) carries no block/warn/policy column
 *    at all, so there is nothing to enforce a hard block against; this pass
 *    captures the snapshot faithfully (for the approver to see) and lets the
 *    `PROCUREMENT_REQUISITION` approval chain be the actual gate, exactly
 *    the same "capture now, gate via workflow" shape `BudgetsService`
 *    itself uses for `gl_budget` activation.
 *  - The entity's own enum lists a `SUBMITTED` status distinct from
 *    `PENDING_APPROVAL`, but `submit()` never persists an intermediate
 *    `SUBMITTED` row — the whole method is one atomic write (budget
 *    snapshot + `ApprovalEngineService.submit()` + status flip all inside
 *    the caller's transaction), so there is no moment where a merely-
 *    `SUBMITTED`-not-yet-`PENDING_APPROVAL` state would ever be visible;
 *    persisting it would just be immediately overwritten within the same
 *    transaction. A documented judgement call, mirroring how
 *    `BudgetsService.submitForApproval()`/`ConcessionsService.
 *    requestConcession()` also go straight to `PENDING_APPROVAL` with no
 *    persisted intermediate step.
 *
 * `onApprovalDecided()`/`markConverted()` are the same "no event dispatcher
 * exists anywhere in this codebase yet" manual-trigger interim pattern
 * `BudgetsService.onApprovalDecided()` established.
 */
@Injectable()
export class RequisitionsService {
  constructor(
    private readonly requisitionRepository: ProcRequisitionRepository,
    private readonly requisitionLineRepository: ProcRequisitionLineRepository,
    private readonly budgetLineRepository: GlBudgetLineRepository,
    private readonly budgetRepository: GlBudgetRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly numberingService: NumberingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateRequisitionInput, actorId: string | null): Promise<ProcRequisitionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const number = await this.numberingService.allocate(manager, "PROC_REQUISITION");
      return this.requisitionRepository.create(
        {
          number,
          requestedBy: input.requestedBy,
          departmentId: input.departmentId,
          justification: input.justification,
          status: "DRAFT",
          approvalRef: null,
          budgetSnapshot: null,
          totalEstimate: Money.ZERO,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );
    });
  }

  async findByIdOrFail(id: string): Promise<ProcRequisitionEntity> {
    return this.requisitionRepository.findByIdOrFail(id);
  }

  async list(filter: ListProcRequisitionsFilter = {}): Promise<ProcRequisitionEntity[]> {
    return this.requisitionRepository.list(filter);
  }

  async listLines(requisitionId: string): Promise<ProcRequisitionLineEntity[]> {
    return this.requisitionLineRepository.findByRequisitionId(requisitionId);
  }

  async addLine(
    requisitionId: string,
    input: CreateRequisitionLineInput,
    actorId: string | null,
  ): Promise<ProcRequisitionLineEntity> {
    await this.requireDraft(requisitionId);
    if (!input.itemId && !input.freeText) {
      throw new ValidationException(
        "A requisition line needs item_id or free_text (ck_proc_requisition_line_item_or_free_text)",
      );
    }
    const line = await this.requisitionLineRepository.create({
      requisitionId,
      itemId: input.itemId ?? null,
      freeText: input.freeText ?? null,
      qty: input.qty,
      estPrice: input.estPrice,
      budgetLineId: input.budgetLineId ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    await this.recomputeTotalEstimate(requisitionId, actorId);
    return line;
  }

  async updateLine(
    lineId: string,
    changes: UpdateRequisitionLineInput,
    actorId: string | null,
  ): Promise<ProcRequisitionLineEntity> {
    const line = await this.requisitionLineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.requisitionId);
    if (changes.itemId !== undefined) line.itemId = changes.itemId;
    if (changes.freeText !== undefined) line.freeText = changes.freeText;
    if (!line.itemId && !line.freeText) {
      throw new ValidationException(
        "A requisition line needs item_id or free_text (ck_proc_requisition_line_item_or_free_text)",
      );
    }
    if (changes.qty !== undefined) line.qty = changes.qty;
    if (changes.estPrice !== undefined) line.estPrice = changes.estPrice;
    if (changes.budgetLineId !== undefined) line.budgetLineId = changes.budgetLineId;
    line.updatedBy = actorId;
    const saved = await this.requisitionLineRepository.save(line);
    await this.recomputeTotalEstimate(line.requisitionId, actorId);
    return saved;
  }

  async removeLine(lineId: string, actorId: string | null = null): Promise<void> {
    const line = await this.requisitionLineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.requisitionId);
    await this.requisitionLineRepository.delete(lineId);
    await this.recomputeTotalEstimate(line.requisitionId, actorId);
  }

  /** See class doc comment "submit()'s budget snapshot". */
  async submit(em: EntityManager, requisitionId: string, initiatorId: string): Promise<ProcRequisitionEntity> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId, em);
    if (requisition.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT requisition can be submitted (status=${requisition.status})`);
    }
    const lines = await this.requisitionLineRepository.findByRequisitionId(requisitionId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Requisition ${requisitionId} has no lines — nothing to submit`);
    }

    const totalEstimate = lines.reduce((sum, line) => sum.add(line.estPrice.multiply(line.qty)), Money.ZERO);
    const budgetSnapshot = await this.buildBudgetSnapshot(em, lines, totalEstimate);

    const instance = await this.approvalEngine.submit(em, {
      domainCode: PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE,
      entityType: "proc_requisition",
      entityId: requisition.id,
      amount: totalEstimate,
      initiatorId,
    });

    requisition.totalEstimate = totalEstimate;
    requisition.budgetSnapshot = budgetSnapshot as unknown as Record<string, unknown>;
    requisition.status = "PENDING_APPROVAL";
    requisition.approvalRef = instance.id;
    requisition.updatedBy = initiatorId;
    return this.requisitionRepository.save(requisition, em);
  }

  /** Manual-trigger interim pattern — see class doc comment. */
  async onApprovalDecided(
    requisitionId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<ProcRequisitionEntity> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId);
    if (requisition.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `proc_requisition ${requisitionId} is not PENDING_APPROVAL (status=${requisition.status})`,
      );
    }
    requisition.status = approved ? "APPROVED" : "REJECTED";
    requisition.updatedBy = actorId;
    return this.requisitionRepository.save(requisition);
  }

  /**
   * Called by `PurchaseOrdersService.createFromRequisition()` once a PO is
   * created from this requisition — accepts an optional caller `EntityManager`
   * so that call can happen atomically inside the PO-creation transaction.
   */
  async markConverted(
    requisitionId: string,
    actorId: string | null = null,
    manager?: EntityManager,
  ): Promise<ProcRequisitionEntity> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId, manager);
    if (requisition.status !== "APPROVED") {
      throw new ValidationException(
        `proc_requisition ${requisitionId} must be APPROVED before converting to a PO (status=${requisition.status})`,
      );
    }
    requisition.status = "CONVERTED";
    requisition.updatedBy = actorId;
    return this.requisitionRepository.save(requisition, manager);
  }

  async cancel(requisitionId: string, actorId: string | null = null): Promise<ProcRequisitionEntity> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId);
    if (["CONVERTED", "CANCELLED", "REJECTED"].includes(requisition.status)) {
      throw new ValidationException(
        `proc_requisition ${requisitionId} cannot be cancelled from status=${requisition.status}`,
      );
    }
    requisition.status = "CANCELLED";
    requisition.updatedBy = actorId;
    return this.requisitionRepository.save(requisition);
  }

  private async buildBudgetSnapshot(
    em: EntityManager,
    lines: ProcRequisitionLineEntity[],
    totalEstimate: Money,
  ): Promise<BudgetSnapshot> {
    const snapshotLines: BudgetSnapshotLine[] = [];
    for (const line of lines) {
      const lineEstimate = line.estPrice.multiply(line.qty);
      if (!line.budgetLineId) {
        snapshotLines.push({
          requisitionLineId: line.id,
          budgeted: false,
          budgetLineId: null,
          lineEstimate: lineEstimate.toDecimalString(),
        });
        continue;
      }
      const budgetLine = await this.budgetLineRepository.findByIdOrFail(line.budgetLineId, em);
      const actuals = await this.computeActuals(em, budgetLine);
      const openCommitments = Money.ZERO; // BR-PROC-02 simplification — see class doc comment
      const available = budgetLine.annualAmount.subtract(actuals).subtract(openCommitments);
      snapshotLines.push({
        requisitionLineId: line.id,
        budgeted: true,
        budgetLineId: budgetLine.id,
        accountId: budgetLine.accountId,
        annualAmount: budgetLine.annualAmount.toDecimalString(),
        actuals: actuals.toDecimalString(),
        openCommitments: openCommitments.toDecimalString(),
        available: available.toDecimalString(),
        lineEstimate: lineEstimate.toDecimalString(),
        withinAvailable: lineEstimate.compare(available) <= 0,
      });
    }
    return { checkedAt: new Date().toISOString(), lines: snapshotLines, totalEstimate: totalEstimate.toDecimalString() };
  }

  private async computeActuals(em: EntityManager, budgetLine: GlBudgetLineEntity): Promise<Money> {
    const budget = await this.budgetRepository.findByIdOrFail(budgetLine.budgetId, em);
    const periods = await this.periodRepository.listByFiscalYear(budget.fiscalYearId, em);
    const periodIds = new Set(periods.map((p) => p.id));
    const totals = await this.periodAccountTotalRepository.listByAccount(budgetLine.accountId, em);
    return totals
      .filter((t) => periodIds.has(t.periodId) && (budgetLine.costCenterId === null || t.costCenterId === budgetLine.costCenterId))
      .reduce((sum, t) => sum.add(t.debitTotal).subtract(t.creditTotal), Money.ZERO);
  }

  private async recomputeTotalEstimate(requisitionId: string, actorId: string | null): Promise<void> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId);
    const lines = await this.requisitionLineRepository.findByRequisitionId(requisitionId);
    requisition.totalEstimate = lines.reduce((sum, l) => sum.add(l.estPrice.multiply(l.qty)), Money.ZERO);
    requisition.updatedBy = actorId;
    await this.requisitionRepository.save(requisition);
  }

  private async requireDraft(requisitionId: string): Promise<ProcRequisitionEntity> {
    const requisition = await this.requisitionRepository.findByIdOrFail(requisitionId);
    if (requisition.status !== "DRAFT") {
      throw new ValidationException(
        `proc_requisition ${requisitionId} lines can only be edited while DRAFT (status=${requisition.status})`,
      );
    }
    return requisition;
  }
}
