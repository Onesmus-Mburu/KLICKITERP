import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "../domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "../domain/exp-replenishment.entity";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";
import { ExpPettyCashFloatRepository } from "../infrastructure/exp-petty-cash-float.repository";
import { ExpPettyCashVoucherRepository } from "../infrastructure/exp-petty-cash-voucher.repository";
import { ExpReplenishmentRepository } from "../infrastructure/exp-replenishment.repository";
import { PETTY_CASH_FLOAT_ACCOUNT_CODE, resolveExpenseClearingAccount } from "./expense-clearing-accounts.util";

/** `appr_workflow_def.domain_code` `requestReplenishment()` submits under (`0900` seed's `seedSingleLevelWorkflow()`). */
export const PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE = "PETTY_CASH_REPLENISHMENT";

export interface CreateFloatInput {
  custodianUserId: string;
  ceiling: Money;
}

export interface SpendInput {
  floatId: string;
  categoryId: string;
  amount: Money;
  receiptFileId?: string | null;
}

/**
 * THE core petty-cash engine (FR-EXP-003.1, BR-EXP-02, P-26).
 *
 * **`createFloat()`'s `balance` starting point** — a documented judgement
 * call (task brief leaves this open): `balance = ceiling` ("fully funded on
 * creation"), NOT `balance = 0`. Rationale: a float created at zero balance
 * would be permanently unusable until a first replenishment cycle — but
 * `requestReplenishment()` only ever collects vouchers ALREADY spent from
 * the float, so a zero-balance float has no way to bootstrap itself (no
 * vouchers exist yet to justify a replenishment request). `balance=ceiling`
 * mirrors this codebase's own precedent for not requiring a real GL entry
 * behind every non-transactional starting state (e.g. `0900`'s seeded
 * `gl_fiscal_year`/`gl_account` rows carry no opening-balance journal
 * either, a documented, still-open gap per Module 7's own design notes) —
 * a real deployment would follow this creation with a manual opening
 * journal crediting Bank/debiting Petty Cash Float for the initial funding,
 * out of this pass's scope, same honest-gap treatment.
 *
 * **`spend()`** — row-locks the float (`findByIdForUpdate`, BR-EXP-02's
 * hard backstop is the DB CHECK `ck_exp_petty_cash_float_balance_range`;
 * this is the defense-in-depth half), rejects `amount > balance`,
 * decrements `balance`, creates the voucher. **No per-voucher GL posting**
 * — per FR-EXP-003.1's own wording ("vouchers debit expense categories FROM
 * THE FLOAT DIRECTLY... only the REPLENISHMENT posts P-26 for the aggregate
 * spent total"), a `spend()` call only ever moves the float's own
 * application-level `balance` counter, never touches `gl_journal`. A real
 * accounting-strict design would debit each category/credit the float at
 * spend time too — this module deliberately does NOT do that, matching the
 * task brief's own explicit posting map (P-26 is the ONLY petty-cash
 * posting code) at the cost of category-level expense recognition never
 * reaching the GL until/unless a future pass revisits this design.
 *
 * **Per-voucher approval — deliberately NOT built.** A `spend()` call sets
 * `status='APPROVED'` directly, with no intervening `PENDING_APPROVAL`
 * step or `ApprovalEngineService.submit()` call. Rationale: a "float"
 * represents pre-delegated spending authority up to `ceiling`, already
 * granted at `createFloat()` time (implicitly, by whoever holds
 * `expenses:petty-cash:manage`) — gating every individual small spend
 * behind its own approval chain would defeat the entire point of a petty
 * cash float (fast, low-friction small purchases). The float's `ceiling`
 * and `spend()`'s balance-floor check ARE the control; the REPLENISHMENT
 * step (which real money moves through) is where a real approval gate
 * belongs, per FR-EXP-003.1's own workflow.
 *
 * **`requestReplenishment()`'s voucher-collection mechanism** — the DDL's
 * `exp_replenishment.voucher_ids uuid[]` column is the record of which
 * vouchers a given replenishment covers, but no NEW column exists on
 * `exp_petty_cash_voucher` to flag "already claimed by a replenishment"
 * (this pass does not extend the Module 14 foundation migration further).
 * Rather than invent a schema field, this method computes the "not yet
 * included in any replenishment" set by set difference: every APPROVED
 * voucher for the float, minus every voucher id that appears in ANY
 * existing `exp_replenishment.voucher_ids` array for that float (regardless
 * of that replenishment's own status — PENDING_APPROVAL/APPROVED/PAID all
 * "claim" their listed vouchers so a second concurrent request can't
 * double-count them). Cleaner than a persisted flag given the immutability
 * trigger already froze `voucher_ids` the moment a replenishment leaves
 * DRAFT... except `exp_replenishment` has no DRAFT status at all (its own
 * 3-value enum starts at `PENDING_APPROVAL`), so `voucher_ids` is written
 * once, at creation, and never revisited — a natural fit for this
 * set-difference approach.
 *
 * **`onApprovalDecided()`'s rejection path** — `exp_replenishment.status`
 * has no `REJECTED`/`CANCELLED` value in its DDL-given 3-value enum
 * (`PENDING_APPROVAL|APPROVED|PAID`). Rather than force an unsupported
 * status value into the CHECK constraint (which would need a migration this
 * pass doesn't make), a rejected replenishment request is simply DELETED —
 * this releases its claimed vouchers back into the "not yet included in any
 * replenishment" pool (per the set-difference mechanism above), so the
 * custodian/administrator can freely call `requestReplenishment()` again
 * and pick up the same (or a since-grown) voucher set. Documented here per
 * the task brief's own instruction to design and document this choice.
 */
@Injectable()
export class PettyCashService {
  constructor(
    private readonly floatRepository: ExpPettyCashFloatRepository,
    private readonly voucherRepository: ExpPettyCashVoucherRepository,
    private readonly replenishmentRepository: ExpReplenishmentRepository,
    private readonly categoryRepository: ExpCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  /** See class doc comment "createFloat()'s balance starting point". */
  async createFloat(em: EntityManager, input: CreateFloatInput, actorId: string | null): Promise<ExpPettyCashFloatEntity> {
    if (!input.ceiling.isPositive()) {
      throw new ValidationException("ck_exp_petty_cash_float_balance_range: ceiling must be > 0");
    }
    try {
      return await this.floatRepository.create(
        {
          custodianUserId: input.custodianUserId,
          ceiling: input.ceiling,
          balance: input.ceiling,
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`A petty cash float already exists for custodian ${input.custodianUserId} (one float per custodian)`);
      }
      throw error;
    }
  }

  async findFloatByIdOrFail(id: string): Promise<ExpPettyCashFloatEntity> {
    return this.floatRepository.findByIdOrFail(id);
  }

  async findFloatByCustodian(custodianUserId: string): Promise<ExpPettyCashFloatEntity | null> {
    return this.floatRepository.findByCustodianUserId(custodianUserId);
  }

  async listFloats(): Promise<ExpPettyCashFloatEntity[]> {
    return this.floatRepository.listAll();
  }

  async updateCeiling(floatId: string, ceiling: Money, actorId: string | null): Promise<ExpPettyCashFloatEntity> {
    if (!ceiling.isPositive()) {
      throw new ValidationException("ck_exp_petty_cash_float_balance_range: ceiling must be > 0");
    }
    const float = await this.floatRepository.findByIdOrFail(floatId);
    if (float.balance.compare(ceiling) > 0) {
      throw new ValidationException(
        `Cannot lower ceiling below the float's current balance (balance=${float.balance.toDecimalString()}, requested ceiling=${ceiling.toDecimalString()})`,
      );
    }
    float.ceiling = ceiling;
    float.updatedBy = actorId;
    return this.floatRepository.save(float);
  }

  /** See class doc comment "spend()". */
  async spend(em: EntityManager, input: SpendInput, actorId: string): Promise<ExpPettyCashVoucherEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_exp_petty_cash_voucher_amount_positive: amount must be > 0");
    }
    await this.categoryRepository.findByIdOrFail(input.categoryId, em);

    const float = await this.floatRepository.findByIdForUpdate(em, input.floatId);
    if (!float) throw new NotFoundException("ExpPettyCashFloat", input.floatId);

    if (input.amount.compare(float.balance) > 0) {
      throw new ValidationException(
        `BR-EXP-02: spend ${input.amount.toDecimalString()} exceeds float ${float.id}'s current balance ${float.balance.toDecimalString()}`,
      );
    }

    float.balance = float.balance.subtract(input.amount);
    float.updatedBy = actorId;
    await this.floatRepository.save(float, em);

    const number = await this.numberingService.allocate(em, "EXP_PETTY_CASH_VOUCHER");
    return this.voucherRepository.create(
      {
        number,
        floatId: float.id,
        categoryId: input.categoryId,
        amount: input.amount,
        receiptFileId: input.receiptFileId ?? null,
        status: "APPROVED",
        journalId: null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async listVouchersByFloat(floatId: string): Promise<ExpPettyCashVoucherEntity[]> {
    return this.voucherRepository.listByFloatId(floatId);
  }

  /** See class doc comment "requestReplenishment()'s voucher-collection mechanism". */
  async requestReplenishment(em: EntityManager, floatId: string, initiatedBy: string): Promise<ExpReplenishmentEntity> {
    const float = await this.floatRepository.findByIdOrFail(floatId, em);

    const claimedVoucherIds = new Set<string>();
    const existingReplenishments = await this.replenishmentRepository.listByFloatId(floatId, undefined, em);
    for (const replenishment of existingReplenishments) {
      for (const voucherId of replenishment.voucherIds) claimedVoucherIds.add(voucherId);
    }

    const approvedVouchers = await this.voucherRepository.listByFloatId(floatId, "APPROVED", em);
    const unclaimed = approvedVouchers.filter((v) => !claimedVoucherIds.has(v.id));

    if (unclaimed.length === 0) {
      throw new ValidationException(`Float ${floatId} has no unclaimed APPROVED vouchers since its last replenishment — nothing to request`);
    }

    const amount = unclaimed.reduce((sum, v) => sum.add(v.amount), Money.ZERO);
    const voucherIds = unclaimed.map((v) => v.id);

    const replenishment = await this.replenishmentRepository.create(
      {
        floatId: float.id,
        amount,
        voucherIds,
        status: "PENDING_APPROVAL",
        approvalRef: null,
        journalId: null,
        createdBy: initiatedBy,
        updatedBy: initiatedBy,
      },
      em,
    );

    const instance = await this.approvalEngine.submit(em, {
      domainCode: PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE,
      entityType: "exp_replenishment",
      entityId: replenishment.id,
      amount,
      initiatorId: initiatedBy,
    });

    replenishment.approvalRef = instance.id;
    return this.replenishmentRepository.save(replenishment, em);
  }

  /** See class doc comment "onApprovalDecided()'s rejection path". */
  async onApprovalDecided(em: EntityManager, replenishmentId: string, approved: boolean): Promise<ExpReplenishmentEntity> {
    const replenishment = await this.replenishmentRepository.findByIdOrFail(replenishmentId, em);
    if (replenishment.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`exp_replenishment ${replenishmentId} is not PENDING_APPROVAL (status=${replenishment.status})`);
    }
    if (!approved) {
      await this.replenishmentRepository.delete(replenishmentId, em);
      return replenishment;
    }
    replenishment.status = "APPROVED";
    return this.replenishmentRepository.save(replenishment, em);
  }

  /** P-26 — requires `APPROVED`. Restores `float.balance` toward `ceiling`, capped (BR-EXP-02). */
  async execute(em: EntityManager, replenishmentId: string, executedBy: string): Promise<ExpReplenishmentEntity> {
    const replenishment = await this.replenishmentRepository.findByIdOrFail(replenishmentId, em);
    if (replenishment.status !== "APPROVED") {
      throw new ValidationException(`exp_replenishment ${replenishmentId} must be APPROVED before execution (status=${replenishment.status})`);
    }

    const float = await this.floatRepository.findByIdForUpdate(em, replenishment.floatId);
    if (!float) throw new NotFoundException("ExpPettyCashFloat", replenishment.floatId);

    const floatAccount = await this.glAccountRepository.findByCodeOrFail(PETTY_CASH_FLOAT_ACCOUNT_CODE, em);
    // P-26's Bank credit side — reuses `expense-clearing-accounts.util.ts`'s
    // own `BANK` resolution (code `1020`), the same account
    // `VouchersService.pay()`'s `BANK` method credits for P-25.
    const bankAccount = await resolveExpenseClearingAccount(this.glAccountRepository, "BANK", em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "expenses",
      sourceDocType: "exp_replenishment",
      sourceDocId: replenishment.id,
      narration: `P-26 petty cash replenishment (float ${float.id})`,
      journalType: "MANUAL",
      postedBy: executedBy,
      lines: [
        {
          accountId: floatAccount.id,
          debit: replenishment.amount,
          credit: Money.ZERO,
          memo: "P-26 petty cash float restored",
          entityRefType: "exp_replenishment",
          entityRefId: replenishment.id,
        },
        {
          accountId: bankAccount.id,
          debit: Money.ZERO,
          credit: replenishment.amount,
          memo: "P-26 bank",
          entityRefType: "exp_replenishment",
          entityRefId: replenishment.id,
        },
      ],
    });

    // Restore toward ceiling, capped — real arithmetic, not a blind `=ceiling`
    // reset, so any concurrent spend()/ceiling change between request and
    // execution is respected.
    const restored = float.balance.add(replenishment.amount);
    float.balance = restored.compare(float.ceiling) > 0 ? float.ceiling : restored;
    float.updatedBy = executedBy;
    await this.floatRepository.save(float, em);

    replenishment.status = "PAID";
    replenishment.journalId = journal.id;
    replenishment.updatedBy = executedBy;
    return this.replenishmentRepository.save(replenishment, em);
  }

  async listReplenishmentsByFloat(floatId: string): Promise<ExpReplenishmentEntity[]> {
    return this.replenishmentRepository.listByFloatId(floatId);
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; driverError?: { code?: string } })?.code
    ?? (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}
