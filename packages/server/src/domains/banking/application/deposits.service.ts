import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { BankDepositEntity } from "../domain/bank-deposit.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankDepositRepository, ListBankDepositsFilter } from "../infrastructure/bank-deposit.repository";
import { resolveUndepositedFundsAccount } from "./gl-banking-accounts.util";

/** `appr_workflow_def.domain_code` this module submits `bank_deposit`s under. */
export const BANK_DEPOSITS_APPROVAL_DOMAIN_CODE = "BANK_DEPOSITS";

export interface CreateBankDepositInput {
  accountId: string;
  amount: Money;
  slipRef?: string | null;
  sourceSessionId?: string | null;
}

/**
 * FR-BANK-002.1 — a source-till/safe -> bank deposit.
 *
 * **"Undeposited Funds" clearing-account design decision** (the task's own
 * flagged judgement call): the DDL's `bank_deposit`/`bank_withdrawal` tables
 * carry a single `account_id` — the DESTINATION bank account being deposited
 * into — with no formal `bank_account` row on the other, "source till/safe"
 * side (a cashier's physical cash drawer is never itself registered as a
 * `bank_account`; `pay_cashier_session` already models that separately, per
 * Module 10/Payments). Rather than force every till/safe to become its own
 * `bank_account` row (kind=`CASH`) purely so a deposit could debit/credit two
 * real `bank_account.gl_account_id`s, this service resolves the OTHER side
 * of the entry via a generic control-style "Undeposited Funds" clearing
 * account (`gl-banking-accounts.util.ts`'s `UNDEPOSITED_FUNDS_ACCOUNT_CODE
 * = "1700"`, added to this pass's own `0900` seed extension): a deposit
 * debits the destination `bank_account.gl_account_id` and credits
 * "Undeposited Funds"; `WithdrawalsService` is the exact mirror (debits
 * "Undeposited Funds", credits the source `bank_account.gl_account_id`).
 * This is the standard "cash/cheques collected but not yet reflected as
 * bank-account activity" holding account real accounting systems use for
 * exactly this till-to-bank gap, and avoids inventing a `bank_account`
 * row per physical cash drawer this DDL never asked for.
 *
 * **`sourceSessionId`** (FR-PAY-011.1's "cash banked via BANK deposit doc
 * referencing session") is recorded as a reference ONLY — no additional
 * posting logic runs off it. The referenced `pay_cashier_session`'s own cash
 * total was already reflected in the ORIGINAL receipt postings (Module 10's
 * P-08/P-09) at capture time; a `bank_deposit` merely documents that this
 * batch of already-recognized cash was physically banked, so posting it
 * again here would double-count the same cash.
 *
 * **Dual acknowledgment** (FR-BANK-007, `ack_by_sender`/`ack_by_receiver` +
 * timestamps) — both column pairs exist on the entity (confirmed against
 * the foundation pass's `BankDepositEntity`), so `acknowledgeBySender()`/
 * `acknowledgeByReceiver()` are real methods here, not a documented gap.
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly depositRepository: BankDepositRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(em: EntityManager, input: CreateBankDepositInput, actorId: string | null): Promise<BankDepositEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_bank_deposit_amount_positive: amount must be > 0");
    }
    await this.bankAccountRepository.findByIdOrFail(input.accountId, em);

    const depositId = generateUuidV7();
    return this.depositRepository.create(
      {
        id: depositId,
        // `number varchar(30)` (migration 0140) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${depositId.replace(/-/g, "").slice(0, 24)}`,
        accountId: input.accountId,
        amount: input.amount,
        slipRef: input.slipRef ?? null,
        sourceSessionId: input.sourceSessionId ?? null,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        ackBySender: null,
        ackBySenderAt: null,
        ackByReceiver: null,
        ackByReceiverAt: null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string): Promise<BankDepositEntity> {
    return this.depositRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankDepositsFilter = {}): Promise<BankDepositEntity[]> {
    return this.depositRepository.list(filter);
  }

  async submitForApproval(em: EntityManager, depositId: string, initiatorId: string): Promise<BankDepositEntity> {
    const deposit = await this.depositRepository.findByIdOrFail(depositId, em);
    if (deposit.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT bank deposit can be submitted (deposit ${depositId} status=${deposit.status})`);
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: BANK_DEPOSITS_APPROVAL_DOMAIN_CODE,
      entityType: "bank_deposit",
      entityId: deposit.id,
      amount: deposit.amount,
      initiatorId,
    });

    deposit.status = "PENDING_APPROVAL";
    deposit.approvalRef = instance.id;
    deposit.updatedBy = initiatorId;
    return this.depositRepository.save(deposit, em);
  }

  /** Manual-trigger interim pattern — see `BankTransfersService.onApprovalDecided()`'s doc comment for the identical "revert to DRAFT on rejection" judgement call (`bank_deposit.status` has the same 4-value enum, no dedicated REJECTED value). */
  async onApprovalDecided(
    em: EntityManager,
    depositId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<BankDepositEntity> {
    const deposit = await this.depositRepository.findByIdOrFail(depositId, em);
    if (deposit.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`bank_deposit ${depositId} is not PENDING_APPROVAL (status=${deposit.status})`);
    }
    deposit.status = approved ? "APPROVED" : "DRAFT";
    if (!approved) deposit.approvalRef = null;
    deposit.updatedBy = actorId;
    return this.depositRepository.save(deposit, em);
  }

  /** Requires `APPROVED`. Debits the destination bank account, credits "Undeposited Funds" — see class doc comment. */
  async post(em: EntityManager, depositId: string, postedBy: string): Promise<BankDepositEntity> {
    const deposit = await this.depositRepository.findByIdOrFail(depositId, em);
    if (deposit.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED bank deposit can be posted (deposit ${depositId} status=${deposit.status})`);
    }

    const account = await this.bankAccountRepository.findByIdOrFail(deposit.accountId, em);
    const undepositedFunds = await resolveUndepositedFundsAccount(this.glAccountRepository, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "banking",
      sourceDocType: "bank_deposit",
      sourceDocId: deposit.id,
      narration: `Bank deposit into ${account.name}${deposit.slipRef ? ` (slip ${deposit.slipRef})` : ""}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: deposit.approvalRef,
      lines: [
        {
          accountId: account.glAccountId,
          debit: deposit.amount,
          credit: Money.ZERO,
          memo: `Deposit into ${account.name}`,
          entityRefType: "bank_deposit",
          entityRefId: deposit.id,
        },
        {
          accountId: undepositedFunds.id,
          debit: Money.ZERO,
          credit: deposit.amount,
          memo: "Undeposited Funds cleared",
          entityRefType: "bank_deposit",
          entityRefId: deposit.id,
        },
      ],
    });

    const number = await this.numberingService.allocate(em, "BANK_DEPOSIT");
    deposit.number = number;
    deposit.status = "POSTED";
    deposit.journalId = journal.id;
    deposit.updatedBy = postedBy;
    return this.depositRepository.save(deposit, em);
  }

  async acknowledgeBySender(id: string, actorId: string): Promise<BankDepositEntity> {
    const deposit = await this.depositRepository.findByIdOrFail(id);
    deposit.ackBySender = actorId;
    deposit.ackBySenderAt = new Date();
    deposit.updatedBy = actorId;
    return this.depositRepository.save(deposit);
  }

  async acknowledgeByReceiver(id: string, actorId: string): Promise<BankDepositEntity> {
    const deposit = await this.depositRepository.findByIdOrFail(id);
    deposit.ackByReceiver = actorId;
    deposit.ackByReceiverAt = new Date();
    deposit.updatedBy = actorId;
    return this.depositRepository.save(deposit);
  }
}
