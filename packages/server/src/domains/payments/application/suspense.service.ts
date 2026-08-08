import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { StdStudentRepository } from "../../students";
import { CaptureReceiptSplitInput } from "./receipts.service";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";
import { PaySuspenseItemRepository } from "../infrastructure/pay-suspense-item.repository";
import { ReceiptsService } from "./receipts.service";

/**
 * BR-PAY-07 resolution paths for a `pay_suspense_item` — matching it
 * retroactively to a student (`matchToStudent()`), or an approval-gated
 * refund (`refundSuspenseItem()`). Both take the caller's own
 * `EntityManager` (composable — `SuspenseController`'s endpoints open the
 * transaction).
 */
@Injectable()
export class SuspenseService {
  constructor(
    private readonly suspenseRepository: PaySuspenseItemRepository,
    private readonly receiptsService: ReceiptsService,
    private readonly studentRepository: StdStudentRepository,
  ) {}

  /**
   * Creates a receipt retroactively via `ReceiptsService.captureReceipt()`,
   * using the suspense item's own `received_at` as the new receipt's
   * `receiptDate` (so it lands in the student's ledger on the date the money
   * actually arrived, not the date it was matched) — FR-PAY-009.1 "noted".
   * The DDL's `resolution_note text` column carries an explicit statement of
   * that original timestamp too, since `pay_receipt.receipt_date` alone
   * doesn't say "this was a retroactive suspense match" to a later reader —
   * a documented judgement call that recording it in both places is more
   * useful than relying on the receipt date alone.
   */
  async matchToStudent(em: EntityManager, suspenseItemId: string, studentId: string, matchedBy: string): Promise<PaySuspenseItemEntity> {
    const item = await this.suspenseRepository.findByIdOrFail(suspenseItemId, em);
    if (item.state !== "OPEN") {
      throw new ValidationException(`BR-PAY-07: pay_suspense_item ${suspenseItemId} is not OPEN (state=${item.state})`);
    }
    const student = await this.studentRepository.findByIdOrFail(studentId, em);

    const split = resolveSuspenseSplit(item);
    const receipt = await this.receiptsService.captureReceipt(em, {
      studentId,
      payerName: `${student.firstName} ${student.lastName}`,
      receiptDate: item.receivedAt.toISOString().slice(0, 10),
      total: item.amount,
      splits: [split],
      cashierId: matchedBy,
      idempotencyKey: `suspense-match-${item.id}`,
    });

    item.state = "MATCHED";
    item.resolvedReceiptId = receipt.id;
    item.resolvedBy = matchedBy;
    item.resolvedAt = new Date();
    item.resolutionNote =
      `Matched to student ${studentId} (receipt ${receipt.number}) on ${new Date().toISOString()}; ` +
      `original received_at=${item.receivedAt.toISOString()} was used as the receipt's own receiptDate.`;
    item.updatedBy = matchedBy;
    return this.suspenseRepository.save(item, em);
  }

  /**
   * BR-PAY-07's other resolution path — "resolvable... by an approval-gated
   * refund; suspense may never be silently written off". `approvalRef` is
   * required and simply recorded into `resolution_note` (this pass does not
   * itself call `ApprovalEngineService` — same "pre-approved parameter"
   * split `ReceiptsService.reverseReceipt()` documents; the controller layer
   * is responsible for having obtained approval first). Does NOT itself post
   * a B2C payout or bank transfer — that is a manual follow-up via
   * `MpesaService.initiateB2c()` or an off-system bank transfer, explicitly
   * out of scope to auto-wire here (no reliable msisdn/bank-account is
   * guaranteed to exist on every suspense item's `raw` payload).
   */
  async refundSuspenseItem(em: EntityManager, suspenseItemId: string, approvalRef: string, resolvedBy: string): Promise<PaySuspenseItemEntity> {
    const item = await this.suspenseRepository.findByIdOrFail(suspenseItemId, em);
    if (item.state !== "OPEN") {
      throw new ValidationException(`BR-PAY-07: pay_suspense_item ${suspenseItemId} is not OPEN (state=${item.state})`);
    }
    if (!approvalRef) {
      throw new ValidationException("BR-PAY-07: refunding a suspense item requires an approval reference");
    }

    item.state = "REFUNDED";
    item.resolvedBy = resolvedBy;
    item.resolvedAt = new Date();
    item.resolutionNote =
      `Approval-gated refund (approvalRef=${approvalRef}) recorded on ${new Date().toISOString()}. ` +
      "Actual payout (B2C or bank transfer) is a manual follow-up, out of scope here — see SuspenseService.refundSuspenseItem()'s doc comment.";
    item.updatedBy = resolvedBy;
    return this.suspenseRepository.save(item, em);
  }

  async listOpen(): Promise<PaySuspenseItemEntity[]> {
    return this.suspenseRepository.findOpen();
  }

  async findByIdOrFail(id: string): Promise<PaySuspenseItemEntity> {
    return this.suspenseRepository.findByIdOrFail(id);
  }
}

/**
 * Maps a suspense item's `source` to a postable `pay_receipt_split`.
 * `MPESA_C2B` (FR-PAY-009.1's primary target) needs no extra references.
 * `BANK`/`OTHER` reuse the item's own `external_ref` as a placeholder
 * `bank_account_id` too — safe only because `pay_receipt_split.bank_account_id`
 * carries NO FK validation in this pass (Module 16/Banking not built — see
 * that column's own doc comment), a documented, narrow judgement call rather
 * than a real bank-account lookup this schema can't yet support.
 */
function resolveSuspenseSplit(item: PaySuspenseItemEntity): CaptureReceiptSplitInput {
  switch (item.source) {
    case "C2B":
      return { method: "MPESA_C2B", amount: item.amount, externalRef: item.externalRef };
    case "BANK":
    case "OTHER":
    default:
      return { method: "BANK_TRANSFER", amount: item.amount, bankAccountId: item.externalRef, externalRef: item.externalRef };
  }
}
