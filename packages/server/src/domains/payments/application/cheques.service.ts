import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostJournalLineDraft, PostingService } from "../../../accounting";
import { AcademicCalendarService, SettingsService } from "../../../platform/settings";
// Barrel imports — same precedent `ReceiptsService`/`payment-clearing-accounts.util.ts`
// already establish for `domains/billing`'s public surface.
import { BillFeeCategoryRepository, BillInstallmentRepository, BillInvoiceRepository, InvoicingService, resolveControlAccount } from "../../billing";
import { PayChequeEntity } from "../domain/pay-cheque.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PayChequeRepository } from "../infrastructure/pay-cheque.repository";
import { PayReceiptAllocationRepository } from "../infrastructure/pay-receipt-allocation.repository";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";
import { PayReceiptSplitRepository } from "../infrastructure/pay-receipt-split.repository";
import { resolveClearingAccount } from "./payment-clearing-accounts.util";
import { ReceiptsService } from "./receipts.service";

/** Idempotent `bill_fee_category.name` the `0900` seed migration upserts for the cheque-bounce fee — same "shared constant" convention as `LATE_FEE_INCOME_CATEGORY_NAME`. */
export const BOUNCE_FEE_CATEGORY_NAME = "Cheque Bounce Fee";

/** `set_setting.key` for the flat KES bounce-fee amount (FR-PAY-007.1's "optional bounce fee" — no FR text prescribes an exact figure, so this is Settings-configurable rather than hardcoded). */
export const CHEQUE_BOUNCE_FEE_AMOUNT_SETTING_KEY = "payments.cheque_bounce_fee_amount";
const DEFAULT_BOUNCE_FEE_AMOUNT = "500.00";

/**
 * Cheque lifecycle (FR-PAY-007.1) — `clear()` is a trivial status flip;
 * `bounce()` is the genuinely interesting one, realizing P-11 ("Cheque
 * bounced | Debit: AR–Student control (+P-05 if bounce fee) | Credit: Bank
 * (uncleared cheques)").
 *
 * **Single-split vs. multi-split reversal — the judgement call the task
 * brief calls out explicitly.** A cheque's original capture posted a debit
 * to the CHEQUE clearing account (`resolveClearingAccount`, code `1030`,
 * "Cheques in Transit") for exactly the cheque's own amount, aggregated
 * alongside whatever else was on that receipt. Two cases:
 *  - **The cheque was the ONLY split on its receipt** — a full
 *    `ReceiptsService.reverseReceipt()` (via `PostingService.reverse()`,
 *    which swaps every debit/credit of the ORIGINAL journal) is exactly
 *    correct: it undoes precisely the clearing-debit/AR-credit (or
 *    prepayment-credit) pair the cheque itself created, nothing more. This
 *    also gets the full BR-PAY-08 treatment for free — a contra `RVS-`
 *    receipt, cross-referenced, mirrored splits/allocations.
 *  - **The receipt had OTHER splits too** (e.g. CASH 500 + CHEQUE 500 on one
 *    receipt) — calling `reverseReceipt()` would incorrectly unwind the
 *    CASH portion as well, which never bounced. Instead, `bounce()` posts a
 *    NARROW, focused `PostingService.post()` journal for just the cheque's
 *    own amount (debit AR-Student / credit CHEQUE-clearing — the exact P-11
 *    shape) and unwinds only that amount's worth of `bill_invoice`/
 *    `bill_installment` balance, walking the receipt's allocations in
 *    reverse order exactly like `ReceiptsService.reverseReceipt()`'s own
 *    unwind helper does (duplicated here in miniature rather than reaching
 *    into that service's private method — a small, deliberate duplication
 *    over widening `ReceiptsService`'s public surface for one caller). This
 *    narrow path does NOT create a contra receipt or touch `pay_receipt`/
 *    `pay_receipt_split`/`pay_receipt_allocation` rows at all — only the GL
 *    and the invoice/installment balances move; the original receipt's
 *    `total`/splits remain historically accurate (it genuinely was captured
 *    with a cheque split that later bounced, which is exactly what
 *    `pay_cheque.status='BOUNCED'` on the still-referenced split now shows).
 *
 * **Bounce fee** (`applyBounceFee=true`): reuses `InvoicingService`, same
 * "don't duplicate posting logic" precedent `LateFeeBatchesService`/
 * `DebitNotesService` establish — one ADHOC invoice, one line, the
 * `BOUNCE_FEE_CATEGORY_NAME` fee category, posted immediately (P-05).
 *
 * **Deferred, no infrastructure exists yet** (documented, not silently
 * skipped): guardian notification on bounce (FR-PAY-007.1 — no
 * comms-trigger dispatcher exists); a "defaulter flag" / "further cheque
 * acceptance requires supervisor override" (no such student-flag column
 * exists in this schema — not invented here, a real gap for a future pass).
 */
@Injectable()
export class ChequesService {
  constructor(
    private readonly chequeRepository: PayChequeRepository,
    private readonly splitRepository: PayReceiptSplitRepository,
    private readonly receiptRepository: PayReceiptRepository,
    private readonly allocationRepository: PayReceiptAllocationRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly installmentRepository: BillInstallmentRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly receiptsService: ReceiptsService,
    private readonly invoicingService: InvoicingService,
    private readonly academicCalendarService: AcademicCalendarService,
    private readonly settingsService: SettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async clear(chequeId: string): Promise<PayChequeEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const cheque = await this.chequeRepository.findByIdOrFail(chequeId, manager);
      if (cheque.status !== "UNCLEARED") {
        throw new ValidationException(`pay_cheque ${chequeId} is not UNCLEARED (status=${cheque.status})`);
      }
      cheque.status = "CLEARED";
      cheque.statusChangedAt = new Date();
      return this.chequeRepository.save(cheque, manager);
    });
  }

  async bounce(em: EntityManager, chequeId: string, applyBounceFee: boolean, actorId: string): Promise<PayChequeEntity> {
    const cheque = await this.chequeRepository.findByIdOrFail(chequeId, em);
    if (cheque.status !== "UNCLEARED") {
      throw new ValidationException(`pay_cheque ${chequeId} is not UNCLEARED (status=${cheque.status}) — cannot bounce`);
    }

    const linkedSplits = await this.splitRepository.listByChequeId(chequeId, em);
    if (linkedSplits.length === 0) {
      throw new Error(`ChequesService.bounce: pay_cheque ${chequeId} has no linked pay_receipt_split — data integrity issue`);
    }
    const split = linkedSplits[0];
    const receipt = await this.receiptRepository.findByIdOrFail(split.receiptId, em);
    if (receipt.status !== "POSTED") {
      throw new ValidationException(`Receipt ${receipt.number} is not POSTED (status=${receipt.status}) — cannot bounce its cheque`);
    }

    const allSplitsOnReceipt = await this.splitRepository.listByReceipt(receipt.id, em);
    if (allSplitsOnReceipt.length === 1) {
      // System-triggered correction, not a discretionary manual reversal — no approval chain (see reverseReceipt()'s doc comment).
      await this.receiptsService.reverseReceipt(em, receipt.id, "BOUNCE", null, actorId);
    } else {
      await this.reverseChequePortion(em, receipt.id, receipt.studentId, receipt.number, cheque, split, actorId);
    }

    cheque.status = "BOUNCED";
    cheque.statusChangedAt = new Date();
    cheque.updatedBy = actorId;

    if (applyBounceFee) {
      await this.applyBounceFee(em, receipt.studentId, cheque, actorId);
      cheque.bounceFeeApplied = true;
    }

    return this.chequeRepository.save(cheque, em);
  }

  async findByIdOrFail(id: string): Promise<PayChequeEntity> {
    return this.chequeRepository.findByIdOrFail(id);
  }

  async listUncleared(): Promise<PayChequeEntity[]> {
    return this.chequeRepository.findUncleared();
  }

  // ---- narrow, single-split-among-many reversal (see class doc comment) ----

  private async reverseChequePortion(
    em: EntityManager,
    receiptId: string,
    studentId: string,
    receiptNumber: string,
    cheque: PayChequeEntity,
    split: PayReceiptSplitEntity,
    actorId: string,
  ): Promise<void> {
    const chequeAmount = split.amount;

    const allocations = await this.allocationRepository.listByReceipt(receiptId, em);
    let remaining = chequeAmount;
    for (const alloc of [...allocations].reverse()) {
      if (remaining.isZero()) break;
      const take = minMoney(alloc.amount, remaining);
      if (!take.isPositive()) continue;
      if (!alloc.toPrepayment && alloc.invoiceId) {
        await this.unwindInvoiceAllocationPartial(em, alloc.invoiceId, take, actorId);
      }
      remaining = remaining.subtract(take);
    }

    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);
    const chequeClearing = await resolveClearingAccount(this.glAccountRepository, "CHEQUE", em);
    const lines: PostJournalLineDraft[] = [
      {
        accountId: arStudent.id,
        debit: chequeAmount,
        credit: Money.ZERO,
        memo: `P-11 cheque ${cheque.chequeNo} bounced (receipt ${receiptNumber})`,
        entityRefType: "pay_cheque",
        entityRefId: cheque.id,
      },
      {
        accountId: chequeClearing.id,
        debit: Money.ZERO,
        credit: chequeAmount,
        memo: `P-11 cheque ${cheque.chequeNo} bounced (receipt ${receiptNumber})`,
        entityRefType: "pay_cheque",
        entityRefId: cheque.id,
      },
    ];

    await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "payments",
      sourceDocType: "pay_cheque",
      sourceDocId: cheque.id,
      narration: `Cheque ${cheque.chequeNo} bounced — narrow reversal of its portion of receipt ${receiptNumber} (P-11, other splits on that receipt are unaffected)`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines,
    });

    void studentId; // retained for signature symmetry / future ledger-note use
  }

  private async unwindInvoiceAllocationPartial(em: EntityManager, invoiceId: string, amount: Money, actorId: string): Promise<void> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    invoice.paidAmount = invoice.paidAmount.subtract(amount);
    invoice.balance = invoice.balance.add(amount);
    if (invoice.paidAmount.isZero()) {
      invoice.status = "POSTED";
    } else if (invoice.paidAmount.compare(invoice.total) >= 0) {
      invoice.status = "PAID";
    } else {
      invoice.status = "PARTIALLY_PAID";
    }
    invoice.updatedBy = actorId;
    await this.invoiceRepository.save(invoice, em);

    const installments = await this.installmentRepository.listByInvoice(invoiceId, em);
    let remaining = amount;
    for (const installment of [...installments].reverse()) {
      if (remaining.isZero()) break;
      const take = minMoney(installment.settledAmount, remaining);
      if (!take.isPositive()) continue;
      installment.settledAmount = installment.settledAmount.subtract(take);
      installment.updatedBy = actorId;
      await this.installmentRepository.save(installment, em);
      remaining = remaining.subtract(take);
    }
  }

  // ---- bounce fee (P-05, via InvoicingService — see class doc comment) ----

  private async applyBounceFee(em: EntityManager, studentId: string, cheque: PayChequeEntity, actorId: string): Promise<void> {
    const category = await this.feeCategoryRepository.findByName(BOUNCE_FEE_CATEGORY_NAME, em);
    if (!category) {
      throw new NotFoundException(
        "BillFeeCategory",
        `${BOUNCE_FEE_CATEGORY_NAME} — expected the 0900 seed migration to have upserted it`,
      );
    }
    const term = await this.academicCalendarService.getCurrentTerm(em);
    if (!term) {
      throw new ValidationException("ChequesService.bounce: no current term configured — cannot raise a bounce-fee invoice");
    }
    const feeAmountRaw = await this.settingsService.getTyped<string>(CHEQUE_BOUNCE_FEE_AMOUNT_SETTING_KEY, DEFAULT_BOUNCE_FEE_AMOUNT);
    const feeAmount = Money.fromDecimalString(feeAmountRaw);

    const invoice = await this.invoicingService.generateInvoice(em, {
      studentId,
      termId: term.id,
      source: "ADHOC",
      adhocLines: [{ feeCategoryId: category.id, description: `Cheque bounce fee (cheque ${cheque.chequeNo})`, amount: feeAmount }],
      issueDate: new Date().toISOString().slice(0, 10),
      createdBy: actorId,
    });
    await this.invoicingService.postInvoice(em, invoice.id, actorId);
  }
}

function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}
