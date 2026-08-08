import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { ApprovalEngineService } from "../../../platform/approvals";
import { GlAccountEntity, GlAccountRepository, PostingService } from "../../../accounting";
import { NumberingService } from "../../../platform/settings";
import { StudentLedgerService } from "../../students";
import { BillRefundMethod, BillRefundVoucherEntity } from "../domain/bill-refund-voucher.entity";
import { BillRefundVoucherRepository } from "../infrastructure/bill-refund-voucher.repository";
import { resolveControlAccount } from "./gl-control-accounts.util";

/** `appr_workflow_def.domain_code` this module registers for refund-voucher approval (FR-BILL-052.1's "approval chain REFUNDS"). */
export const REFUNDS_APPROVAL_DOMAIN_CODE = "REFUNDS";

/** Ordinary (non-control) GL account codes `resolvePayoutAccount()` resolves for CASH/BANK payouts — the same `COA_TEMPLATE` codes the 0900 seed migration already seeds (Module 7). A documented judgement call: unlike M-Pesa (which has a real `MPESA_CLEARING` control_domain to resolve against), plain cash/bank payout accounts have no control-domain tag in the DDL, so this service resolves them by their well-known seeded `code` instead. */
const CASH_ACCOUNT_CODE = "1010";
const BANK_ACCOUNT_CODE = "1020";

export interface CreateRefundVoucherInput {
  studentId: string;
  amount: Money;
  method: BillRefundMethod;
  payee: Record<string, unknown>;
}

/**
 * `bill_refund_voucher` — BR-BILL-12/FR-BILL-052.1: "a refund may be paid
 * only from an actual credit balance, never creating a negative receivable."
 *
 * **`create()` — the credit-balance validation.** Reads
 * `StudentLedgerService.getStatement(studentId)`'s running balance (the last
 * row's `runningBalance`, computed `SUM(debit - credit)` in chronological
 * order — see that repository's doc comment). A POSITIVE running balance
 * means the student still owes the school (ordinary AR); a NEGATIVE running
 * balance means the student has overpaid/has unapplied credit sitting on
 * their sub-ledger (e.g. from a posted credit note or an overpayment once
 * Payments/Module 10 exists) — the "credit balance" this method validates
 * against is `-runningBalance` when negative, else zero. `amount` must not
 * exceed that credit; a student with a zero or positive running balance can
 * request no refund at all (`amount > 0` always fails the check since credit
 * available is `Money.ZERO`).
 *
 * **Workflow**: `DRAFT -[submitForApproval]-> PENDING_APPROVAL
 * -[onApprovalDecided]-> APPROVED_UNPAID | CANCELLED -[markPaid]-> PAID`.
 * `BillRefundVoucherStatus` also carries a standalone `APPROVED` value the
 * DDL defines but this pass's flow does not transit through — per the task
 * brief's own wording ("on approve: posts P-12... status='APPROVED_UNPAID'"),
 * `onApprovalDecided()` posts the GL journal and lands directly on
 * `APPROVED_UNPAID` in one step, skipping a separate `APPROVED`-but-not-yet-
 * posted intermediate state (documented, not an oversight — `APPROVED`
 * remains available for a future pass that wants to split "decision" from
 * "posting" into two distinct actions).
 *
 * **`onApprovalDecided()` — P-12.** On approval: debits the AR-Student
 * control account for `amount` (bringing the student's negative/credit
 * running balance back toward zero — the DDL's P-12 posting-map row names
 * the debit side "Student prepayments / AR credit"; this pass resolves it
 * against the `AR_STUDENT` control domain rather than `PREPAYMENT`, since
 * `std_ledger_entry`/every other student-facing posting in this module keys
 * off `AR_STUDENT` — a documented judgement call, revisit if a dedicated
 * wallet/prepayment ledger is introduced), credits the resolved Cash/Bank/
 * M-Pesa-clearing payout account (`resolvePayoutAccount()`, keyed off
 * `method`) for the same amount — the exact P-12 shape
 * (docs/phase-2/01-functional-requirements.md). Allocates `number` via
 * `NumberingService.allocate(em, 'BILL_REFUND_VOUCHER')`, appends a
 * `std_ledger_entry` debit (increasing the student's balance back toward
 * zero, mirroring the GL side). On rejection: `status='CANCELLED'` — no GL
 * activity, no ledger entry (nothing was ever paid out).
 *
 * **`markPaid()`** is a documented interim placeholder: for `CASH`/`BANK`
 * this is effectively "cashier confirms the payout was handed over/wired";
 * for `MPESA_B2C` the REAL completion should be driven by a Payments/
 * Module 10 M-Pesa B2C result callback that doesn't exist yet (Module 10
 * isn't built) — `markPaid()` stands in for that callback until it exists,
 * same "interim manual trigger" shape as `onApprovalDecided()` itself. A
 * future Module 10 pass should wire the real B2C result callback to call
 * either `markPaid()` (success) or a new "revert to APPROVED_UNPAID on
 * failure" method (FR-BILL-052.1's own wording: "callback either finalizes
 * or reverts to APPROVED_UNPAID") — not built here, out of scope (Payments
 * doesn't exist yet to call back from).
 *
 * **`cancel()`** — from any pre-`PAID` status (`DRAFT`/`PENDING_APPROVAL`/
 * `APPROVED_UNPAID`) to `CANCELLED`. Once GL activity has posted
 * (`APPROVED_UNPAID`), cancelling does NOT reverse the P-12 journal — a
 * documented gap: a cancelled-after-posting refund voucher would need a
 * compensating reversal, which this pass does not implement (no caller in
 * this pass's scope reaches that state before `markPaid()` in practice; flag
 * for a future pass if operationally needed).
 */
@Injectable()
export class RefundVouchersService {
  constructor(
    private readonly refundVoucherRepository: BillRefundVoucherRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly studentLedgerService: StudentLedgerService,
    private readonly approvalEngine: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateRefundVoucherInput, initiatedBy: string): Promise<BillRefundVoucherEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("bill_refund_voucher.amount must be positive (ck_bill_refund_voucher_amount_positive)");
    }

    const statement = await this.studentLedgerService.getStatement(input.studentId);
    const runningBalance = statement.length > 0 ? statement[statement.length - 1].runningBalance : Money.ZERO;
    const creditAvailable = runningBalance.isNegative() ? runningBalance.negate() : Money.ZERO;
    if (input.amount.compare(creditAvailable) > 0) {
      throw new ValidationException(
        `FR-BILL-052.1: refund amount ${input.amount.toDecimalString()} exceeds student ${input.studentId}'s credit balance ${creditAvailable.toDecimalString()} — a refund may never create a negative AR balance (BR-BILL-12)`,
      );
    }

    const voucherId = generateUuidV7();
    return this.refundVoucherRepository.create({
      id: voucherId,
      // `number varchar(30)` (migration 0070) can't hold "DRAFT-" (6) + a full UUID (36) = 42
      // chars — truncate the hyphen-stripped UUID to fit.
      number: `DRAFT-${voucherId.replace(/-/g, "").slice(0, 24)}`,
      studentId: input.studentId,
      amount: input.amount,
      method: input.method,
      payee: input.payee ?? {},
      status: "DRAFT",
      approvalRef: null,
      journalId: null,
      b2cTransactionId: null,
      createdBy: initiatedBy,
      updatedBy: initiatedBy,
    });
  }

  async findByIdOrFail(id: string): Promise<BillRefundVoucherEntity> {
    return this.refundVoucherRepository.findByIdOrFail(id);
  }

  async listByStudent(studentId: string): Promise<BillRefundVoucherEntity[]> {
    return this.refundVoucherRepository.listByStudent(studentId);
  }

  async submitForApproval(voucherId: string, initiatorId: string): Promise<BillRefundVoucherEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const voucher = await this.refundVoucherRepository.findByIdOrFail(voucherId, manager);
      if (voucher.status !== "DRAFT") {
        throw new ValidationException(`Only a DRAFT bill_refund_voucher can be submitted for approval (status=${voucher.status})`);
      }

      const instance = await this.approvalEngine.submit(manager, {
        domainCode: REFUNDS_APPROVAL_DOMAIN_CODE,
        entityType: "bill_refund_voucher",
        entityId: voucher.id,
        amount: voucher.amount,
        initiatorId,
      });

      voucher.status = "PENDING_APPROVAL";
      voucher.approvalRef = instance.id;
      voucher.updatedBy = initiatorId;
      return this.refundVoucherRepository.save(voucher, manager);
    });
  }

  /** See class doc comment "onApprovalDecided() — P-12". */
  async onApprovalDecided(voucherId: string, approved: boolean, actorId: string | null): Promise<BillRefundVoucherEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const voucher = await this.refundVoucherRepository.findByIdOrFail(voucherId, manager);
      if (voucher.status !== "PENDING_APPROVAL") {
        throw new ValidationException(`bill_refund_voucher ${voucherId} is not PENDING_APPROVAL (status=${voucher.status})`);
      }

      if (!approved) {
        voucher.status = "CANCELLED";
        voucher.updatedBy = actorId;
        return this.refundVoucherRepository.save(voucher, manager);
      }

      const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", manager);
      const payoutAccount = await this.resolvePayoutAccount(voucher.method, manager);

      const journal = await this.postingService.post(manager, {
        journalDate: new Date().toISOString().slice(0, 10),
        sourceModule: "billing",
        sourceDocType: "bill_refund_voucher",
        sourceDocId: voucher.id,
        narration: `P-12 credit-balance refund (${voucher.method}) for student ${voucher.studentId}`,
        journalType: "MANUAL",
        postedBy: actorId ?? "system",
        lines: [
          {
            accountId: arStudent.id,
            debit: voucher.amount,
            credit: Money.ZERO,
            memo: "P-12 refund",
            entityRefType: "bill_refund_voucher",
            entityRefId: voucher.id,
          },
          {
            accountId: payoutAccount.id,
            debit: Money.ZERO,
            credit: voucher.amount,
            memo: "P-12 refund payout",
            entityRefType: "bill_refund_voucher",
            entityRefId: voucher.id,
          },
        ],
      });

      const number = await this.numberingService.allocate(manager, "BILL_REFUND_VOUCHER");
      voucher.number = number;
      voucher.status = "APPROVED_UNPAID";
      voucher.journalId = journal.id;
      voucher.updatedBy = actorId;
      const saved = await this.refundVoucherRepository.save(voucher, manager);

      await this.studentLedgerService.appendEntry(manager, {
        studentId: voucher.studentId,
        entryDate: new Date().toISOString().slice(0, 10),
        docType: "BILL_REFUND_VOUCHER",
        docId: voucher.id,
        docNumber: number,
        debit: voucher.amount,
        credit: Money.ZERO,
        memo: `Refund approved (${voucher.method})`,
      });

      return saved;
    });
  }

  /** See class doc comment "markPaid()" — interim placeholder for the real M-Pesa B2C result callback (Module 10, not built yet). */
  async markPaid(voucherId: string, b2cTransactionId: string | null, actorId: string | null): Promise<BillRefundVoucherEntity> {
    const voucher = await this.refundVoucherRepository.findByIdOrFail(voucherId);
    if (voucher.status !== "APPROVED_UNPAID") {
      throw new ValidationException(`Only an APPROVED_UNPAID bill_refund_voucher can be marked PAID (status=${voucher.status})`);
    }
    voucher.status = "PAID";
    if (b2cTransactionId) {
      voucher.b2cTransactionId = b2cTransactionId;
    }
    voucher.updatedBy = actorId;
    return this.refundVoucherRepository.save(voucher);
  }

  /** See class doc comment "cancel()". */
  async cancel(voucherId: string, actorId: string | null): Promise<BillRefundVoucherEntity> {
    const voucher = await this.refundVoucherRepository.findByIdOrFail(voucherId);
    if (voucher.status === "PAID" || voucher.status === "CANCELLED") {
      throw new ValidationException(`bill_refund_voucher ${voucherId} cannot be cancelled from status=${voucher.status}`);
    }
    voucher.status = "CANCELLED";
    voucher.updatedBy = actorId;
    return this.refundVoucherRepository.save(voucher);
  }

  private async resolvePayoutAccount(method: BillRefundMethod, manager: EntityManager): Promise<GlAccountEntity> {
    switch (method) {
      case "CASH":
        return this.glAccountRepository.findByCodeOrFail(CASH_ACCOUNT_CODE, manager);
      case "BANK":
        return this.glAccountRepository.findByCodeOrFail(BANK_ACCOUNT_CODE, manager);
      case "MPESA_B2C":
        return resolveControlAccount(this.glAccountRepository, "MPESA_CLEARING", manager);
    }
  }
}
