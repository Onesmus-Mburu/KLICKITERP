import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { BankWithdrawalEntity } from "../domain/bank-withdrawal.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankWithdrawalRepository, ListBankWithdrawalsFilter } from "../infrastructure/bank-withdrawal.repository";
import { resolveUndepositedFundsAccount } from "./gl-banking-accounts.util";

/** `appr_workflow_def.domain_code` this module submits `bank_withdrawal`s under. */
export const BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE = "BANK_WITHDRAWALS";

export interface CreateBankWithdrawalInput {
  accountId: string;
  amount: Money;
  slipRef?: string | null;
  sourceSessionId?: string | null;
}

/**
 * FR-BANK-002.1's mirror-image event — bank -> till/safe withdrawal. See
 * `DepositsService`'s class doc comment for the full "Undeposited Funds"
 * clearing-account design decision (identical here, just the two legs
 * swapped) and the `sourceSessionId` reference-only rationale.
 */
@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly withdrawalRepository: BankWithdrawalRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(
    em: EntityManager,
    input: CreateBankWithdrawalInput,
    actorId: string | null,
  ): Promise<BankWithdrawalEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_bank_withdrawal_amount_positive: amount must be > 0");
    }
    await this.bankAccountRepository.findByIdOrFail(input.accountId, em);

    const withdrawalId = generateUuidV7();
    return this.withdrawalRepository.create(
      {
        id: withdrawalId,
        // `number varchar(30)` (migration 0140) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit; `issue()`/`post()` replaces this
        // placeholder with the real allocated number before it's ever user-facing.
        number: `DRAFT-${withdrawalId.replace(/-/g, "").slice(0, 24)}`,
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

  async findByIdOrFail(id: string): Promise<BankWithdrawalEntity> {
    return this.withdrawalRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankWithdrawalsFilter = {}): Promise<BankWithdrawalEntity[]> {
    return this.withdrawalRepository.list(filter);
  }

  async submitForApproval(em: EntityManager, withdrawalId: string, initiatorId: string): Promise<BankWithdrawalEntity> {
    const withdrawal = await this.withdrawalRepository.findByIdOrFail(withdrawalId, em);
    if (withdrawal.status !== "DRAFT") {
      throw new ValidationException(
        `Only a DRAFT bank withdrawal can be submitted (withdrawal ${withdrawalId} status=${withdrawal.status})`,
      );
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE,
      entityType: "bank_withdrawal",
      entityId: withdrawal.id,
      amount: withdrawal.amount,
      initiatorId,
    });

    withdrawal.status = "PENDING_APPROVAL";
    withdrawal.approvalRef = instance.id;
    withdrawal.updatedBy = initiatorId;
    return this.withdrawalRepository.save(withdrawal, em);
  }

  /** Manual-trigger interim pattern — same "revert to DRAFT on rejection" judgement call as `BankTransfersService`/`DepositsService`. */
  async onApprovalDecided(
    em: EntityManager,
    withdrawalId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<BankWithdrawalEntity> {
    const withdrawal = await this.withdrawalRepository.findByIdOrFail(withdrawalId, em);
    if (withdrawal.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`bank_withdrawal ${withdrawalId} is not PENDING_APPROVAL (status=${withdrawal.status})`);
    }
    withdrawal.status = approved ? "APPROVED" : "DRAFT";
    if (!approved) withdrawal.approvalRef = null;
    withdrawal.updatedBy = actorId;
    return this.withdrawalRepository.save(withdrawal, em);
  }

  /** Requires `APPROVED`. Debits "Undeposited Funds", credits the source bank account — the mirror of `DepositsService.post()`. */
  async post(em: EntityManager, withdrawalId: string, postedBy: string): Promise<BankWithdrawalEntity> {
    const withdrawal = await this.withdrawalRepository.findByIdOrFail(withdrawalId, em);
    if (withdrawal.status !== "APPROVED") {
      throw new ValidationException(
        `Only an APPROVED bank withdrawal can be posted (withdrawal ${withdrawalId} status=${withdrawal.status})`,
      );
    }

    const account = await this.bankAccountRepository.findByIdOrFail(withdrawal.accountId, em);
    const undepositedFunds = await resolveUndepositedFundsAccount(this.glAccountRepository, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "banking",
      sourceDocType: "bank_withdrawal",
      sourceDocId: withdrawal.id,
      narration: `Bank withdrawal from ${account.name}${withdrawal.slipRef ? ` (slip ${withdrawal.slipRef})` : ""}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: withdrawal.approvalRef,
      lines: [
        {
          accountId: undepositedFunds.id,
          debit: withdrawal.amount,
          credit: Money.ZERO,
          memo: "Undeposited Funds (cash drawn)",
          entityRefType: "bank_withdrawal",
          entityRefId: withdrawal.id,
        },
        {
          accountId: account.glAccountId,
          debit: Money.ZERO,
          credit: withdrawal.amount,
          memo: `Withdrawal from ${account.name}`,
          entityRefType: "bank_withdrawal",
          entityRefId: withdrawal.id,
        },
      ],
    });

    const number = await this.numberingService.allocate(em, "BANK_WITHDRAWAL");
    withdrawal.number = number;
    withdrawal.status = "POSTED";
    withdrawal.journalId = journal.id;
    withdrawal.updatedBy = postedBy;
    return this.withdrawalRepository.save(withdrawal, em);
  }

  async acknowledgeBySender(id: string, actorId: string): Promise<BankWithdrawalEntity> {
    const withdrawal = await this.withdrawalRepository.findByIdOrFail(id);
    withdrawal.ackBySender = actorId;
    withdrawal.ackBySenderAt = new Date();
    withdrawal.updatedBy = actorId;
    return this.withdrawalRepository.save(withdrawal);
  }

  async acknowledgeByReceiver(id: string, actorId: string): Promise<BankWithdrawalEntity> {
    const withdrawal = await this.withdrawalRepository.findByIdOrFail(id);
    withdrawal.ackByReceiver = actorId;
    withdrawal.ackByReceiverAt = new Date();
    withdrawal.updatedBy = actorId;
    return this.withdrawalRepository.save(withdrawal);
  }
}
