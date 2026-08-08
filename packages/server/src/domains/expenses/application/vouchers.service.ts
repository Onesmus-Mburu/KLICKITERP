import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import {
  GlAccountRepository,
  GlBudgetLineRepository,
  GlBudgetRepository,
  GlPeriodAccountTotalRepository,
  GlPeriodRepository,
  PostingService,
} from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { FilesService } from "../../../platform/files";
import { NumberingService, SettingsService } from "../../../platform/settings";
import { ExpVoucherEntity, ExpVoucherMethod, ExpVoucherPayeeType, ExpVoucherStatus } from "../domain/exp-voucher.entity";
import { ExpVoucherRepository } from "../infrastructure/exp-voucher.repository";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";
import { resolveExpenseClearingAccount } from "./expense-clearing-accounts.util";

/** `appr_workflow_def.domain_code` this module submits `exp_voucher`s under — the `0900` seed registers a single-level System-Admin workflow under this code (`seedSingleLevelWorkflow()`, same "real tiers are future work" treatment `SUPPLIER_PAYMENTS`/every other amount-tiered chain in this codebase got — FR-EXP-002.1 calls this chain amount-tiered, but no school-specific approver-role ladder exists in this codebase's seed yet). */
export const EXPENSES_APPROVAL_DOMAIN_CODE = "EXPENSES";

/** BR-EXP-03 — Settings key for the attachment-required threshold (KES), default 1000. */
export const EXPENSE_ATTACHMENT_THRESHOLD_SETTING_KEY = "expenses.attachment_required_threshold_kes";
const DEFAULT_ATTACHMENT_THRESHOLD = Money.fromInt(1000);

/** `file_object.entity_type` value `FilesService.listByEntity()` filters on for `exp_voucher` attachments. */
export const EXP_VOUCHER_FILE_ENTITY_TYPE = "exp_voucher";

export interface CreateVoucherInput {
  payeeType: ExpVoucherPayeeType;
  payeeRef: Record<string, unknown>;
  categoryId: string;
  costCenterId?: string | null;
  amount: Money;
  method: ExpVoucherMethod;
  narrative: string;
}

export interface UpdateVoucherInput {
  payeeType?: ExpVoucherPayeeType;
  payeeRef?: Record<string, unknown>;
  categoryId?: string;
  costCenterId?: string | null;
  amount?: Money;
  method?: ExpVoucherMethod;
  narrative?: string;
}

/**
 * CRUD for `exp_voucher` (`DRAFT`-only edits — mirrors
 * `trg_exp_voucher_immutable`'s frozen-column set: `amount`/`category_id`/
 * `payee_type`/`payee_ref`/`method`, though this service is stricter, only
 * allowing edits at all while `DRAFT`, not merely pre-`APPROVED`) plus the
 * submit -> approve/reject -> pay workflow (FR-EXP-002.1, BR-EXP-03, P-25).
 *
 * **Numbering** — mirrors `ProcPaymentVoucherEntity`'s precedent (this
 * entity's own doc comment names it explicitly): `create()` starts `number`
 * at a `DRAFT-<uuid>` placeholder (not yet meaningful — an expense voucher's
 * number matters once it is actually paid, the same "document only matters
 * once executed" shape `PaymentVouchersService`/`GrnService` follow), and
 * `pay()` allocates the real number via `NumberingService.allocate(em,
 * 'EXP_VOUCHER')` at that point.
 *
 * **BR-EXP-03 attachment check** (`submit()`) — counts `file_object` rows
 * tagged `entity_type='exp_voucher'`/`entity_id=<voucherId>` via
 * `FilesService.listByEntity()` (the same convention
 * `bill_sponsor.agreement_file_id`-adjacent attachment flows in this
 * codebase use — confirmed via `FilesController`'s own
 * `GET /files?entityType=&entityId=` endpoint and `FilesService.
 * listByEntity()`'s doc comment), requiring at least one row when `amount`
 * exceeds the Settings-configurable threshold (`expenses.
 * attachment_required_threshold_kes`, default KES 1000).
 *
 * **Budget check** (`submit()` AND `onApprovalDecided()` on approval,
 * per the task brief) — the SAME honest simplification
 * `RequisitionsService.buildBudgetSnapshot()` (Module 12) established:
 * `gl_budget_line` carries no block/warn policy column, so this is
 * INFORMATIONAL ONLY (logged, never a hard block) when `category.
 * budget_required` is true. Resolves the current-calendar-year
 * `gl_fiscal_year` (by name, same convention the `0900` seed itself uses),
 * its ACTIVE `gl_budget`, and a `gl_budget_line` matching
 * `(account_id=category.gl_expense_account_id, cost_center_id)` — if any
 * step finds no match, the voucher is simply not budget-tracked (no error);
 * `available = annual_amount - actuals - openCommitments(0)` re-derived from
 * `gl_period_account_total` exactly like `RequisitionsService.
 * computeActuals()`, `openCommitments` approximated as zero for the same
 * documented reason (no commitment ledger exists anywhere in this codebase).
 * `exp_voucher` has no `budget_snapshot` jsonb column (unlike
 * `proc_requisition`), so the result is logged, not persisted.
 */
@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    private readonly voucherRepository: ExpVoucherRepository,
    private readonly categoryRepository: ExpCategoryRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly settingsService: SettingsService,
    private readonly filesService: FilesService,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly budgetRepository: GlBudgetRepository,
    private readonly budgetLineRepository: GlBudgetLineRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
  ) {}

  async create(input: CreateVoucherInput, actorId: string | null, em?: EntityManager): Promise<ExpVoucherEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_exp_voucher_amount_positive: amount must be > 0");
    }
    await this.categoryRepository.findByIdOrFail(input.categoryId, em);

    const voucherId = generateUuidV7();
    return this.voucherRepository.create(
      {
        id: voucherId,
        // `number varchar(30)` (migration 0120) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${voucherId.replace(/-/g, "").slice(0, 24)}`,
        payeeType: input.payeeType,
        payeeRef: input.payeeRef,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId ?? null,
        amount: input.amount,
        method: input.method,
        narrative: input.narrative,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string): Promise<ExpVoucherEntity> {
    return this.voucherRepository.findByIdOrFail(id);
  }

  async list(status?: ExpVoucherStatus): Promise<ExpVoucherEntity[]> {
    if (status) return this.voucherRepository.listByStatus(status);
    return this.voucherRepository.listAll();
  }

  async update(id: string, changes: UpdateVoucherInput, actorId: string | null): Promise<ExpVoucherEntity> {
    const voucher = await this.requireDraft(id);
    if (changes.categoryId !== undefined) {
      await this.categoryRepository.findByIdOrFail(changes.categoryId);
      voucher.categoryId = changes.categoryId;
    }
    if (changes.payeeType !== undefined) voucher.payeeType = changes.payeeType;
    if (changes.payeeRef !== undefined) voucher.payeeRef = changes.payeeRef;
    if (changes.costCenterId !== undefined) voucher.costCenterId = changes.costCenterId;
    if (changes.amount !== undefined) {
      if (!changes.amount.isPositive()) {
        throw new ValidationException("ck_exp_voucher_amount_positive: amount must be > 0");
      }
      voucher.amount = changes.amount;
    }
    if (changes.method !== undefined) voucher.method = changes.method;
    if (changes.narrative !== undefined) voucher.narrative = changes.narrative;
    voucher.updatedBy = actorId;
    return this.voucherRepository.save(voucher);
  }

  /** See class doc comment "BR-EXP-03 attachment check" / "Budget check". */
  async submit(em: EntityManager, voucherId: string, initiatorId: string): Promise<ExpVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId, em);
    if (voucher.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT expense voucher can be submitted (voucher ${voucherId} status=${voucher.status})`);
    }

    await this.assertAttachmentRequirement(voucher);
    await this.checkBudgetAvailability(em, voucher, "submit");

    const instance = await this.approvalEngine.submit(em, {
      domainCode: EXPENSES_APPROVAL_DOMAIN_CODE,
      entityType: "exp_voucher",
      entityId: voucher.id,
      amount: voucher.amount,
      initiatorId,
    });

    voucher.status = "PENDING_APPROVAL";
    voucher.approvalRef = instance.id;
    voucher.updatedBy = initiatorId;
    return this.voucherRepository.save(voucher, em);
  }

  /** Manual-trigger interim pattern (no event dispatcher exists anywhere in this codebase yet). Rejection maps to `CANCELLED` — `exp_voucher.status` has no dedicated `REJECTED` value. */
  async onApprovalDecided(em: EntityManager, voucherId: string, approved: boolean, actorId: string | null = null): Promise<ExpVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId, em);
    if (voucher.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`exp_voucher ${voucherId} is not PENDING_APPROVAL (status=${voucher.status})`);
    }
    if (approved) {
      await this.checkBudgetAvailability(em, voucher, "approval");
      voucher.status = "APPROVED";
    } else {
      voucher.status = "CANCELLED";
    }
    voucher.updatedBy = actorId;
    return this.voucherRepository.save(voucher, em);
  }

  /** P-25 — requires `APPROVED`. See class doc comment "Numbering". */
  async pay(em: EntityManager, voucherId: string, paidBy: string): Promise<ExpVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId, em);
    if (voucher.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED expense voucher can be paid (voucher ${voucherId} status=${voucher.status})`);
    }
    const category = await this.categoryRepository.findByIdOrFail(voucher.categoryId, em);
    const clearingAccount = await resolveExpenseClearingAccount(this.glAccountRepository, voucher.method, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "expenses",
      sourceDocType: "exp_voucher",
      sourceDocId: voucher.id,
      narration: `P-25 direct expense paid — ${voucher.narrative}`,
      journalType: "MANUAL",
      postedBy: paidBy,
      lines: [
        {
          accountId: category.glExpenseAccountId,
          costCenterId: voucher.costCenterId,
          debit: voucher.amount,
          credit: Money.ZERO,
          memo: "P-25 expense recognized",
          entityRefType: "exp_voucher",
          entityRefId: voucher.id,
        },
        {
          accountId: clearingAccount.id,
          debit: Money.ZERO,
          credit: voucher.amount,
          memo: `P-25 ${voucher.method} clearing`,
          entityRefType: "exp_voucher",
          entityRefId: voucher.id,
        },
      ],
    });

    const number = await this.numberingService.allocate(em, "EXP_VOUCHER");
    voucher.number = number;
    voucher.status = "PAID";
    voucher.journalId = journal.id;
    voucher.updatedBy = paidBy;
    return this.voucherRepository.save(voucher, em);
  }

  // ---- helpers -----------------------------------------------------------

  private async requireDraft(voucherId: string): Promise<ExpVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId);
    if (voucher.status !== "DRAFT") {
      throw new ValidationException(`exp_voucher ${voucherId} can only be edited while DRAFT (status=${voucher.status})`);
    }
    return voucher;
  }

  /** BR-EXP-03 — see class doc comment. */
  private async assertAttachmentRequirement(voucher: ExpVoucherEntity): Promise<void> {
    const thresholdRaw = await this.settingsService.getTyped<string | null>(EXPENSE_ATTACHMENT_THRESHOLD_SETTING_KEY, null);
    const threshold = thresholdRaw ? Money.fromDecimalString(thresholdRaw) : DEFAULT_ATTACHMENT_THRESHOLD;
    if (voucher.amount.compare(threshold) <= 0) return;

    const attachments = await this.filesService.listByEntity(EXP_VOUCHER_FILE_ENTITY_TYPE, voucher.id);
    if (attachments.length === 0) {
      throw new ValidationException(
        `BR-EXP-03: expense voucher ${voucher.id} amount ${voucher.amount.toDecimalString()} exceeds the KES ` +
          `${threshold.toDecimalString()} attachment threshold — at least one file_object attachment is required before submission`,
      );
    }
  }

  /** Informational-only budget snapshot — see class doc comment "Budget check". */
  private async checkBudgetAvailability(em: EntityManager, voucher: ExpVoucherEntity, stage: "submit" | "approval"): Promise<void> {
    const category = await this.categoryRepository.findByIdOrFail(voucher.categoryId, em);
    if (!category.budgetRequired) return;

    const currentPeriod = await this.periodRepository.findCurrentForDate(new Date().toISOString().slice(0, 10), em);
    if (!currentPeriod) {
      this.logger.warn(`exp_voucher ${voucher.id} (${stage}): category ${category.id} requires a budget check but no current gl_period was found — skipping`);
      return;
    }
    const budget = await this.budgetRepository.findActiveForFiscalYear(currentPeriod.fiscalYearId, em);
    if (!budget) {
      this.logger.warn(`exp_voucher ${voucher.id} (${stage}): category ${category.id} requires a budget check but no ACTIVE gl_budget exists for the current fiscal year — skipping`);
      return;
    }
    const budgetLine = await this.budgetLineRepository.findByBudgetAccountCostCenter(
      budget.id,
      category.glExpenseAccountId,
      voucher.costCenterId,
      em,
    );
    if (!budgetLine) {
      this.logger.warn(`exp_voucher ${voucher.id} (${stage}): no gl_budget_line for account ${category.glExpenseAccountId}/cost-center ${voucher.costCenterId ?? "null"} — not budget-tracked`);
      return;
    }

    const periods = await this.periodRepository.listByFiscalYear(budget.fiscalYearId, em);
    const periodIds = new Set(periods.map((p) => p.id));
    const totals = await this.periodAccountTotalRepository.listByAccount(budgetLine.accountId, em);
    const actuals = totals
      .filter((t) => periodIds.has(t.periodId) && (budgetLine.costCenterId === null || t.costCenterId === budgetLine.costCenterId))
      .reduce((sum, t) => sum.add(t.debitTotal).subtract(t.creditTotal), Money.ZERO);
    const openCommitments = Money.ZERO; // BR-EXP-01/BR-PROC-02-style simplification — see class doc comment
    const available = budgetLine.annualAmount.subtract(actuals).subtract(openCommitments);

    if (voucher.amount.compare(available) > 0) {
      this.logger.warn(
        `BR-EXP-01 budget WARNING (${stage}, not a hard block): exp_voucher ${voucher.id} amount ${voucher.amount.toDecimalString()} ` +
          `exceeds available budget ${available.toDecimalString()} for account ${category.glExpenseAccountId} (annual ${budgetLine.annualAmount.toDecimalString()}, actuals ${actuals.toDecimalString()})`,
      );
    } else {
      this.logger.log(`exp_voucher ${voucher.id} (${stage}): within available budget ${available.toDecimalString()}`);
    }
  }
}
