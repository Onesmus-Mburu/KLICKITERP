import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { BankTransferEntity } from "../domain/bank-transfer.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankTransferRepository, ListBankTransfersFilter } from "../infrastructure/bank-transfer.repository";
import { resolveTransferClearingAccount } from "./gl-banking-accounts.util";

/** `appr_workflow_def.domain_code` this module submits `bank_transfer`s under — the `0900` seed registers a single-level System-Admin workflow under this code (`seedSingleLevelWorkflow()`), same "amount-tiered chains start single-level, real tiers are future work" treatment every prior amount-tiered chain in this codebase has gotten (e.g. `SUPPLIER_PAYMENTS`/`EXPENSES`). */
export const BANK_TRANSFERS_APPROVAL_DOMAIN_CODE = "BANK_TRANSFERS";

export interface CreateBankTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
}

/**
 * BR-BANK-01/P-32 — inter-account transfer, posted as ONE balanced
 * `PostingService.post()` call with 2 legs threaded through the
 * `TRANSFER_CLEARING` control account (`gl-banking-accounts.util.ts`):
 *   1. debit `TRANSFER_CLEARING` / credit source account's `gl_account_id`
 *   2. debit destination account's `gl_account_id` / credit `TRANSFER_CLEARING`
 * `PostingService.post()`'s own `applyPeriodAccountTotals()` step aggregates
 * both `TRANSFER_CLEARING` lines (same account, no cost center) into ONE
 * `gl_period_account_total` delta before writing it — debit=credit=amount,
 * netting to exactly zero. This realizes BR-BANK-01 ("the clearing account
 * must net to zero WITHIN the transfer's own journal") at both the
 * journal-line level (the two individual `TRANSFER_CLEARING` lines) and the
 * period-aggregate level, inside a single balanced journal — no separate
 * "netting" step is needed.
 *
 * `create()`'s `from !== to` check is defense-in-depth ahead of the DB's own
 * `ck_bank_transfer_accounts_distinct` CHECK (per the entity's own doc
 * comment) — rejected here, in the application layer, before the DB even
 * sees the INSERT.
 */
@Injectable()
export class BankTransfersService {
  constructor(
    private readonly transferRepository: BankTransferRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(
    em: EntityManager,
    input: CreateBankTransferInput,
    actorId: string | null,
  ): Promise<BankTransferEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_bank_transfer_amount_positive: amount must be > 0");
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new ValidationException(
        "ck_bank_transfer_accounts_distinct: fromAccountId and toAccountId must differ (defense-in-depth ahead of the DB CHECK)",
      );
    }
    await this.bankAccountRepository.findByIdOrFail(input.fromAccountId, em);
    await this.bankAccountRepository.findByIdOrFail(input.toAccountId, em);

    const transferId = generateUuidV7();
    return this.transferRepository.create(
      {
        id: transferId,
        // `number varchar(30)` (migration 0140) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${transferId.replace(/-/g, "").slice(0, 24)}`,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string): Promise<BankTransferEntity> {
    return this.transferRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankTransfersFilter = {}): Promise<BankTransferEntity[]> {
    return this.transferRepository.list(filter);
  }

  async submitForApproval(em: EntityManager, transferId: string, initiatorId: string): Promise<BankTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "DRAFT") {
      throw new ValidationException(
        `Only a DRAFT bank transfer can be submitted (transfer ${transferId} status=${transfer.status})`,
      );
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: BANK_TRANSFERS_APPROVAL_DOMAIN_CODE,
      entityType: "bank_transfer",
      entityId: transfer.id,
      amount: transfer.amount,
      initiatorId,
    });

    transfer.status = "PENDING_APPROVAL";
    transfer.approvalRef = instance.id;
    transfer.updatedBy = initiatorId;
    return this.transferRepository.save(transfer, em);
  }

  /**
   * Manual-trigger interim pattern (no event dispatcher exists anywhere in
   * this codebase yet). `bank_transfer.status` has no dedicated
   * REJECTED/CANCELLED value in its 4-value enum (`DRAFT|PENDING_APPROVAL|
   * APPROVED|POSTED`) — a rejection reverts the transfer to `DRAFT` so it can
   * be corrected and resubmitted, rather than deleting it (which would lose
   * the audit trail `MutableBaseEntity` otherwise preserves). A documented
   * judgement call, mirroring how every other module with a similarly
   * narrow status enum handles rejection (e.g. `PettyCashService`'s DELETE
   * for `exp_replenishment`, chosen there only because that entity's own
   * enum truly has no earlier state to revert to).
   */
  async onApprovalDecided(
    em: EntityManager,
    transferId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<BankTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`bank_transfer ${transferId} is not PENDING_APPROVAL (status=${transfer.status})`);
    }
    transfer.status = approved ? "APPROVED" : "DRAFT";
    if (!approved) transfer.approvalRef = null;
    transfer.updatedBy = actorId;
    return this.transferRepository.save(transfer, em);
  }

  /** P-32 — requires `APPROVED`. See class doc comment for the exact 2-leg mechanism. */
  async post(em: EntityManager, transferId: string, postedBy: string): Promise<BankTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "APPROVED") {
      throw new ValidationException(
        `Only an APPROVED bank transfer can be posted (transfer ${transferId} status=${transfer.status})`,
      );
    }

    const fromAccount = await this.bankAccountRepository.findByIdOrFail(transfer.fromAccountId, em);
    const toAccount = await this.bankAccountRepository.findByIdOrFail(transfer.toAccountId, em);
    const clearingAccount = await resolveTransferClearingAccount(this.glAccountRepository, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "banking",
      sourceDocType: "bank_transfer",
      sourceDocId: transfer.id,
      narration: `P-32 bank transfer: ${fromAccount.name} -> ${toAccount.name}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: transfer.approvalRef,
      lines: [
        {
          accountId: clearingAccount.id,
          debit: transfer.amount,
          credit: Money.ZERO,
          memo: "P-32 transfer clearing (leg 1 — source side)",
          entityRefType: "bank_transfer",
          entityRefId: transfer.id,
        },
        {
          accountId: fromAccount.glAccountId,
          debit: Money.ZERO,
          credit: transfer.amount,
          memo: `P-32 source account (${fromAccount.name})`,
          entityRefType: "bank_transfer",
          entityRefId: transfer.id,
        },
        {
          accountId: toAccount.glAccountId,
          debit: transfer.amount,
          credit: Money.ZERO,
          memo: `P-32 destination account (${toAccount.name})`,
          entityRefType: "bank_transfer",
          entityRefId: transfer.id,
        },
        {
          accountId: clearingAccount.id,
          debit: Money.ZERO,
          credit: transfer.amount,
          memo: "P-32 transfer clearing (leg 2 — destination side)",
          entityRefType: "bank_transfer",
          entityRefId: transfer.id,
        },
      ],
    });

    const number = await this.numberingService.allocate(em, "BANK_TRANSFER");
    transfer.number = number;
    transfer.status = "POSTED";
    transfer.journalId = journal.id;
    transfer.updatedBy = postedBy;
    return this.transferRepository.save(transfer, em);
  }
}
