import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { ExpClaimEntity, ExpClaimReimburseVia, ExpClaimStatus } from "../domain/exp-claim.entity";
import { ExpClaimLineEntity } from "../domain/exp-claim-line.entity";
import { ExpVoucherMethod } from "../domain/exp-voucher.entity";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";
import { ExpClaimRepository } from "../infrastructure/exp-claim.repository";
import { ExpClaimLineRepository } from "../infrastructure/exp-claim-line.repository";
import { resolveExpenseClearingAccount } from "./expense-clearing-accounts.util";

/** `appr_workflow_def.domain_code` — the `0900` seed registers a single-level System-Admin workflow under this code. */
export const EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE = "EXPENSE_CLAIMS";

/**
 * `2040` — "Staff Reimbursements Payable" — a new liability leaf this pass
 * adds to the `0900` seed's `COA_TEMPLATE` (next free `20xx` code after
 * `2030 Student Wallet Balances`). `reimburse()`'s `PAYROLL` branch debits
 * each claim line's expense account and credits THIS account (an accrual —
 * the expense is genuinely incurred now, even though cash settlement
 * happens later via a payroll run). **Forward integration point for Module
 * 15 (Payroll, not built yet)**: whenever Module 15 actually settles a
 * PAYROLL-routed claim (folding it into a payslip's net pay), it must debit
 * this SAME account (`2040`) to clear the payable — otherwise the liability
 * this pass books here would never unwind. Documented here, in
 * `PROGRESS.md`, and on `reimburse()` itself, per this codebase's own
 * "honest forward-gap" convention (e.g. `bill_refund_voucher.
 * b2c_transaction_id`, `proc_po_line.item_id` before Module 13 closed it).
 */
export const STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE = "2040";

export interface CreateClaimInput {
  staffUserId: string;
  reimburseVia: ExpClaimReimburseVia;
}

export interface AddClaimLineInput {
  categoryId: string;
  description: string;
  amount: Money;
  expenseDate: string;
  receiptFileId?: string | null;
}

export interface UpdateClaimLineInput {
  categoryId?: string;
  description?: string;
  amount?: Money;
  expenseDate?: string;
  receiptFileId?: string | null;
}

/**
 * CRUD for `exp_claim` + `exp_claim_line` (`DRAFT`-only line edits — the
 * claimant assembles their expense list before submission, per
 * `ExpClaimLineEntity`'s own `MutableBaseEntity` doc comment) plus the
 * submit -> approve/reject -> reimburse workflow.
 *
 * **Numbering** — same `DRAFT-<uuid>` placeholder / real-number-allocated-
 * at-financial-execution shape `VouchersService` uses, for consistency
 * across this module: `create()` starts `number` at `DRAFT-<uuid>`,
 * `reimburse()` allocates the real `EXP_CLAIM` number.
 *
 * **`reimburse()`'s `DIRECT` vs `PAYROLL` branching** (the task brief's own
 * design point): `DIRECT` realizes a P-25-shaped posting — debit each
 * line's category expense account (aggregated per account so a claim with
 * several lines against the same category posts one clean debit line, the
 * same aggregation `InvoicingService`/`ClaimsService`'s own sibling
 * services use), credit a `method`-resolved cash/bank/mpesa/cheque clearing
 * account (`expense-clearing-accounts.util.ts`, same resolver P-25 itself
 * uses) — real cash moves now, `status='REIMBURSED'` genuinely means paid.
 * `PAYROLL` posts an ACCRUAL instead — same per-account expense debit, but
 * credits `STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE` (`2040`) — the
 * expense is recognized now (it was genuinely incurred), but actual cash
 * settlement happens later via a payroll run (Module 15). `status=
 * 'REIMBURSED'` here means "the accrual is booked", NOT "cash has settled" —
 * a documented naming tension forced by `exp_claim.status`'s own DDL-given
 * enum having no separate "accrued, awaiting payroll settlement" terminal
 * value; see `STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE`'s own doc comment
 * for the Module 15 forward-integration point.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly claimRepository: ExpClaimRepository,
    private readonly lineRepository: ExpClaimLineRepository,
    private readonly categoryRepository: ExpCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(input: CreateClaimInput, actorId: string | null): Promise<ExpClaimEntity> {
    const claimId = generateUuidV7();
    return this.claimRepository.create({
      id: claimId,
      // `number varchar(30)` (migration 0120) can't hold "DRAFT-" (6) + a full UUID (36) = 42
      // chars — truncate the hyphen-stripped UUID to fit.
      number: `DRAFT-${claimId.replace(/-/g, "").slice(0, 24)}`,
      staffUserId: input.staffUserId,
      total: Money.ZERO,
      status: "DRAFT",
      reimburseVia: input.reimburseVia,
      approvalRef: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<ExpClaimEntity> {
    return this.claimRepository.findByIdOrFail(id);
  }

  async list(staffUserId?: string, status?: ExpClaimStatus): Promise<ExpClaimEntity[]> {
    if (staffUserId) return this.claimRepository.listByStaffUserId(staffUserId, status);
    return this.claimRepository.listAll(status);
  }

  async listLines(claimId: string): Promise<ExpClaimLineEntity[]> {
    return this.lineRepository.listByClaimId(claimId);
  }

  async addLine(claimId: string, input: AddClaimLineInput, actorId: string | null): Promise<ExpClaimLineEntity> {
    await this.requireDraft(claimId);
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_exp_claim_line_amount_positive: amount must be > 0");
    }
    await this.categoryRepository.findByIdOrFail(input.categoryId);
    const existingLines = await this.lineRepository.listByClaimId(claimId);
    const line = await this.lineRepository.create({
      claimId,
      lineNo: existingLines.length + 1,
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      expenseDate: input.expenseDate,
      receiptFileId: input.receiptFileId ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    await this.recomputeTotal(claimId, actorId);
    return line;
  }

  async updateLine(lineId: string, changes: UpdateClaimLineInput, actorId: string | null): Promise<ExpClaimLineEntity> {
    const line = await this.lineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.claimId);
    if (changes.categoryId !== undefined) {
      await this.categoryRepository.findByIdOrFail(changes.categoryId);
      line.categoryId = changes.categoryId;
    }
    if (changes.description !== undefined) line.description = changes.description;
    if (changes.amount !== undefined) {
      if (!changes.amount.isPositive()) {
        throw new ValidationException("ck_exp_claim_line_amount_positive: amount must be > 0");
      }
      line.amount = changes.amount;
    }
    if (changes.expenseDate !== undefined) line.expenseDate = changes.expenseDate;
    if (changes.receiptFileId !== undefined) line.receiptFileId = changes.receiptFileId;
    line.updatedBy = actorId;
    const saved = await this.lineRepository.save(line);
    await this.recomputeTotal(line.claimId, actorId);
    return saved;
  }

  async removeLine(lineId: string, actorId: string | null = null): Promise<void> {
    const line = await this.lineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.claimId);
    await this.lineRepository.delete(lineId);
    await this.recomputeTotal(line.claimId, actorId);
  }

  async submit(em: EntityManager, claimId: string, initiatorId: string): Promise<ExpClaimEntity> {
    const claim = await this.claimRepository.findByIdOrFail(claimId, em);
    if (claim.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT expense claim can be submitted (claim ${claimId} status=${claim.status})`);
    }
    const lines = await this.lineRepository.listByClaimId(claimId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Expense claim ${claimId} has no lines — nothing to submit`);
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE,
      entityType: "exp_claim",
      entityId: claim.id,
      amount: claim.total,
      initiatorId,
    });

    claim.status = "PENDING_APPROVAL";
    claim.approvalRef = instance.id;
    claim.updatedBy = initiatorId;
    return this.claimRepository.save(claim, em);
  }

  /** Manual-trigger interim pattern. */
  async onApprovalDecided(em: EntityManager, claimId: string, approved: boolean, actorId: string | null = null): Promise<ExpClaimEntity> {
    const claim = await this.claimRepository.findByIdOrFail(claimId, em);
    if (claim.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`exp_claim ${claimId} is not PENDING_APPROVAL (status=${claim.status})`);
    }
    claim.status = approved ? "APPROVED" : "REJECTED";
    claim.updatedBy = actorId;
    return this.claimRepository.save(claim, em);
  }

  /** See class doc comment "reimburse()'s DIRECT vs PAYROLL branching". `method` is required for `DIRECT`, ignored for `PAYROLL`. */
  async reimburse(em: EntityManager, claimId: string, reimbursedBy: string, method?: ExpVoucherMethod): Promise<ExpClaimEntity> {
    const claim = await this.claimRepository.findByIdOrFail(claimId, em);
    if (claim.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED expense claim can be reimbursed (claim ${claimId} status=${claim.status})`);
    }
    const lines = await this.lineRepository.listByClaimId(claimId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Expense claim ${claimId} has no lines — nothing to reimburse`);
    }

    const perAccount = new Map<string, Money>();
    for (const line of lines) {
      const category = await this.categoryRepository.findByIdOrFail(line.categoryId, em);
      const running = perAccount.get(category.glExpenseAccountId) ?? Money.ZERO;
      perAccount.set(category.glExpenseAccountId, running.add(line.amount));
    }

    const debitLines = Array.from(perAccount.entries()).map(([accountId, amount]) => ({
      accountId,
      debit: amount,
      credit: Money.ZERO,
      memo: "Expense claim line(s) recognized",
      entityRefType: "exp_claim",
      entityRefId: claim.id,
    }));

    let creditAccountId: string;
    let narration: string;
    if (claim.reimburseVia === "DIRECT") {
      if (!method) {
        throw new ValidationException("reimburse(): a method (CASH/BANK/MPESA/CHEQUE/PETTY_CASH) is required for DIRECT reimbursement");
      }
      const clearingAccount = await resolveExpenseClearingAccount(this.glAccountRepository, method, em);
      creditAccountId = clearingAccount.id;
      narration = `P-25-shaped direct reimbursement — expense claim ${claim.number} (${method})`;
    } else {
      const payableAccount = await this.glAccountRepository.findByCodeOrFail(STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE, em);
      creditAccountId = payableAccount.id;
      narration = `Staff reimbursement accrual — expense claim ${claim.number} (settled via a future Module 15 payroll run)`;
    }

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "expenses",
      sourceDocType: "exp_claim",
      sourceDocId: claim.id,
      narration,
      journalType: "MANUAL",
      postedBy: reimbursedBy,
      lines: [
        ...debitLines,
        {
          accountId: creditAccountId,
          debit: Money.ZERO,
          credit: claim.total,
          memo: claim.reimburseVia === "DIRECT" ? "Direct reimbursement paid" : "Staff reimbursements payable accrued",
          entityRefType: "exp_claim",
          entityRefId: claim.id,
        },
      ],
    });

    // `exp_claim`'s own DDL carries NO `journal_id` column (unlike
    // `exp_voucher`/`exp_replenishment`) — the posting is still fully
    // traceable via `gl_journal.source_doc_type='exp_claim'`/
    // `.source_doc_id=claim.id` (set above), just not mirrored back onto
    // this row. `journal.id` is logged here rather than silently discarded.
    this.logger.log(`exp_claim ${claim.id} reimbursed via ${claim.reimburseVia} — journal ${journal.id}`);

    const number = claim.number.startsWith("DRAFT-") ? await this.numberingService.allocate(em, "EXP_CLAIM") : claim.number;
    claim.number = number;
    claim.status = "REIMBURSED";
    claim.updatedBy = reimbursedBy;
    return this.claimRepository.save(claim, em);
  }

  private async recomputeTotal(claimId: string, actorId: string | null): Promise<void> {
    const claim = await this.claimRepository.findByIdOrFail(claimId);
    const lines = await this.lineRepository.listByClaimId(claimId);
    claim.total = lines.reduce((sum, l) => sum.add(l.amount), Money.ZERO);
    claim.updatedBy = actorId;
    await this.claimRepository.save(claim);
  }

  private async requireDraft(claimId: string): Promise<ExpClaimEntity> {
    const claim = await this.claimRepository.findByIdOrFail(claimId);
    if (claim.status !== "DRAFT") {
      throw new ValidationException(`exp_claim ${claimId} lines can only be edited while DRAFT (status=${claim.status})`);
    }
    return claim;
  }
}
