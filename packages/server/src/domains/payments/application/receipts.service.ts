import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { NumberingService } from "../../../platform/settings";
// Barrel imports (application-layer services/repositories, not entity
// files) — safe, same precedent `InvoicingService`/`ConcessionsService`
// establish importing `domains/students`' barrel. `domains/billing` and
// `domains/students` are both in `domains/payments`' `mayImport` list
// (module-deps.json).
import { StdLedgerEntryRepository, StdStudentRepository, StudentLedgerService } from "../../students";
import { BillInstallmentRepository, BillInvoiceRepository, resolveControlAccount, StudentCreditService } from "../../billing";
// Phase 6 Slice 16 (Part 1) — barrel import (application-layer service, not
// an entity-decorator target), the exact same one-directional-dependency
// shape `domains/billing`'s own new `platform/document-verification`
// exception uses (see `module-deps.json`'s updated `domains/payments`
// entry). `DocumentVerificationModule` is imported into `PaymentsModule`
// below for this to resolve at runtime.
import { DocumentVerificationService } from "../../../platform/document-verification";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitMethod } from "../domain/pay-receipt-split.entity";
import { PayCashierSessionRepository } from "../infrastructure/pay-cashier-session.repository";
import { PayChequeRepository } from "../infrastructure/pay-cheque.repository";
import { PayReceiptAllocationRepository } from "../infrastructure/pay-receipt-allocation.repository";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";
import { PayReceiptSplitRepository } from "../infrastructure/pay-receipt-split.repository";
import { AllocationService } from "./allocation.service";
import { resolveClearingAccount } from "./payment-clearing-accounts.util";

export interface CaptureReceiptChequeDetailsInput {
  bankName: string;
  chequeNo: string;
  chequeDate: string;
  drawer: string;
}

export interface CaptureReceiptSplitInput {
  method: PayReceiptSplitMethod;
  amount: Money;
  /** BANK/BANK_TRANSFER only — a forward reference to `bank_account` (Module 16, not built). Stored as given, no FK validation (foundation-pass gap). */
  bankAccountId?: string | null;
  /** BANK/BANK_TRANSFER deposit slip ref, or CARD/POS terminal ref. */
  externalRef?: string | null;
  /** Required when `method='CHEQUE'`. */
  chequeDetails?: CaptureReceiptChequeDetailsInput;
  /** MPESA_* pass-through only — Pass B's M-Pesa service pre-resolves and supplies this; NOT validated to exist in this pass. */
  mpesaTransactionId?: string | null;
}

export interface CaptureReceiptInput {
  studentId: string;
  payerName: string;
  payerPhone?: string | null;
  receiptDate: string;
  /** The receipt's declared total — `splits` must sum to exactly this (BR-PAY-01). */
  total: Money;
  splits: CaptureReceiptSplitInput[];
  cashierId: string;
  /** Required when any split is `CASH` (BR-PAY-04). */
  sessionId?: string | null;
  idempotencyKey?: string | null;
  /**
   * Phase 6 Slice 8 (Part 3) — "Collect Fees" directed multi-invoice
   * collection. Threaded straight through to
   * `AllocationService.resolveAllocations()`'s own `invoiceIds` — see that
   * interface's doc comment. Omitted by every pre-existing caller (cheques,
   * suspense, M-Pesa, bulk-allocation, the plain cashier capture form), so
   * their behavior is byte-for-byte unchanged.
   */
  invoiceIds?: string[];
}

export type ReceiptReversalReasonCode = "ERROR" | "BOUNCE" | "DUPLICATE" | "FRAUD";

/** `NumberingService` docType for reversal receipts — its first 3 characters uppercase (`RVS`) auto-derive the `RVS-` number prefix via `defaultPrefixFor()`, with no change needed to `NumberingService` itself. */
const REVERSAL_RECEIPT_DOC_TYPE = "RVS_PAY_RECEIPT";
const RECEIPT_DOC_TYPE = "PAY_RECEIPT";

/**
 * Phase 6 Slice 12 (Part A) — `reverseReceipt()`'s reversal-safety guard.
 * Split methods listed here fund a receipt from a subledger balance
 * (student wallet, and — Part D — student credit balance) that a plain
 * "swap every debit/credit of the original journal" reversal cannot undo:
 * the money already moved via that subledger's OWN journal/ledger entry
 * BEFORE the receipt was ever created (`ReceiptsService
 * .recordWalletFundedReceipt()` posts nothing itself), so reversing the
 * receipt would restore the GL's AR_STUDENT/WALLET balance while leaving the
 * wallet's own `wall_wallet.balance` (or, Part D, the student's credit
 * balance) completely untouched — a silent, real GL/subledger desync. This
 * is the exact risk this whole dispatch exists to close; see migration
 * `0233`'s own doc comment for the other half (making `journal_id` nullable
 * in the first place).
 *
 * `"CREDIT_BALANCE"` is not yet a real `PayReceiptSplitMethod` value (Part
 * D's job, per the plan's own Part D — `bill_student_credit`/
 * `ck_pay_receipt_split_method` extension) — declared as a plain
 * `readonly string[]`, not `readonly PayReceiptSplitMethod[]`, specifically
 * so Part D can append the new enum member to this array without this guard
 * itself (or its call site below) needing to change at all.
 */
export const NON_REVERSIBLE_RECEIPT_SPLIT_METHODS: readonly string[] = ["WALLET", "CREDIT_BALANCE"];

export interface RecordWalletFundedReceiptAllocationInput {
  invoiceId: string;
  amount: Money;
}

export interface RecordWalletFundedReceiptInput {
  studentId: string;
  payerName: string;
  receiptDate: string;
  /** Per-invoice breakdown of what the wallet/credit-balance sweep actually applied — never empty, every amount positive (BR-PAY-01/03 mirrored via the trigger-satisfying inserts below, not re-validated here since the caller already validated each application against the real invoice). */
  allocations: RecordWalletFundedReceiptAllocationInput[];
  cashierId: string;
  /** Cross-reference only (narration on the mirrored `std_ledger_entry`) — the real cross-reference lives the OTHER way, via `wall_transaction.receipt_id`, set by the caller (`WalletTransactionsService`) right after this method returns. */
  walletTransactionId: string;
}

/** Phase 6 Slice 12 (Part D) — `applyStudentCreditToInvoices()`'s input, output allocation/shortfall rows, and result shape — the same shape `WalletTransactionsService.sweepToInvoices()`'s own types establish (`SweepToInvoicesInput`/`SweepToInvoicesAllocationResult`/`SweepToInvoicesShortfallResult`/`SweepToInvoicesResult`), so Part E's frontend can consume both sweep flavors with a near-identical shape. No `transactionId` field here — unlike a wallet sweep, there is no separate `wall_transaction`-style row; the receipt IS the record. */
export interface ApplyStudentCreditToInvoicesInput {
  studentId: string;
  /** Caller-ordered (typically oldest-due-first) — the credit balance is applied to these in the GIVEN order, never re-sorting. */
  invoiceIds: string[];
}

export interface ApplyStudentCreditAllocationResult {
  invoiceId: string;
  amount: Money;
}

export interface ApplyStudentCreditShortfallResult {
  invoiceId: string;
  /** The invoice's own `balance` still outstanding after this application — nonzero either because the credit balance ran out before reaching it, or only partially covered it. */
  remainingBalance: Money;
}

export interface ApplyStudentCreditToInvoicesResult {
  /** Zero (with `allocations`/`shortfall` both reflecting that) when the student had no credit balance to apply, or every listed invoice was already fully paid — a clean, non-error outcome, never a degenerate empty GL posting. */
  totalApplied: Money;
  allocations: ApplyStudentCreditAllocationResult[];
  /** Null when `totalApplied` is zero — no receipt/journal was posted. */
  receiptId: string | null;
  shortfall: ApplyStudentCreditShortfallResult[];
}

/**
 * Module 10 PASS B — `appr_workflow_def.domain_code` for BR-PAY-08's
 * reversal approval chain. `ReceiptsService.reverseReceipt()` itself still
 * does not call `ApprovalEngineService` (see the class doc comment
 * "Does NOT call ApprovalEngineService itself") — this constant is exported
 * so `ReceiptsController` (PASS B) and the `0900` seed's single-level
 * workflow registration can both reference the same string, never re-typed
 * as a literal, mirroring `BILLING_CONCESSION_APPROVAL_DOMAIN_CODE`/
 * `BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE`'s precedent in `domains/billing`.
 */
export const PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE = "PAYMENT_REVERSALS";

/**
 * Phase 6 Slice 16 (Part 1) — the `docv_record.document_type` value
 * `captureReceipt()` mints under, and `ReceiptsController`'s "get by id"
 * path looks up by. Deliberately distinct from `RECEIPT_DOC_TYPE` above
 * (`"PAY_RECEIPT"`, `NumberingService`'s series key) — the two constants
 * serve unrelated concerns (a numbering series vs. a document-verification
 * polymorphic type tag) and just happen to both describe "a receipt";
 * conflating them would be a coincidence, not a real shared concept.
 */
export const PAYMENT_RECEIPT_DOCUMENT_TYPE = "PAYMENT_RECEIPT";

/**
 * THE core receipt capture/posting/reversal engine (docs/phase-5 Module 10
 * PASS A). Mirrors `InvoicingService`'s design discipline: every write path
 * takes the caller's own `EntityManager` (composable — Pass B's M-Pesa
 * callback handler and bulk-allocation batch job will call `captureReceipt()`
 * inside their own transactions) and realizes exactly one `PostingService.post()`
 * call per receipt.
 *
 * **`captureReceipt()` algorithm** (FR-PAY-001..012, BR-PAY-01/03/04):
 *  1. Idempotency replay: if `idempotencyKey` is given and a receipt with
 *     that key already exists, return it UNCHANGED — no second effect
 *     (`uq_pay_receipt_idempotency_key`).
 *  2. Validate the student exists; validate splits are non-empty, each
 *     split amount is positive, Σsplits === `total` (BR-PAY-01,
 *     defense-in-depth mirroring `trg_pay_splits_sum`), each method's
 *     mandatory references are present (cheque: bank+number+date+drawer;
 *     bank/bank-transfer: bank account + slip ref; card/POS: terminal ref),
 *     and reject any `WALLET` split outright (Module 11/Wallet not built —
 *     "not yet supported" error, out of scope this pass).
 *  3. If any split is `CASH`, `sessionId` must reference an `OPEN` session
 *     belonging to `cashierId` (BR-PAY-04).
 *  4. For each `CHEQUE` split, create the `pay_cheque` row (`UNCLEARED`) and
 *     remember its id to link on the split row.
 *  5. Resolve allocations via `AllocationService.resolveAllocations()`
 *     (BR-PAY-03 — never leaves a remainder unaccounted for). `input.invoiceIds`
 *     (Phase 6 Slice 8 Part 3), when given, narrows which of the student's
 *     open invoices this receipt may apply to — see that service's own doc
 *     comment for the exact mechanics; omitted, this step is identical to
 *     before that field existed.
 *  6. Build ONE balanced journal realizing P-08 (clearing-account debit per
 *     method, aggregated by clearing account; AR-Student credit for the
 *     invoice-allocated portion) + P-09 (same clearing debit pool,
 *     Student-prepayments credit for the `toPrepayment` portion) and post it
 *     via `PostingService.post()`.
 *  7. Allocate the receipt `number` via `NumberingService.allocate(em,
 *     'PAY_RECEIPT')`.
 *  8. Insert `pay_receipt` + `pay_receipt_split` + `pay_receipt_allocation`
 *     rows. `balance_after` is computed from the student's running ledger
 *     balance immediately BEFORE this call (via `StdLedgerEntryRepository
 *     .getStatementWithRunningBalance(studentId, em)`, read inside this same
 *     transaction) minus `total` — computed arithmetically rather than by a
 *     second post-append query, because `trg_pay_receipt_immutable`
 *     unconditionally freezes `balance_after` after INSERT, so it must be
 *     correct at insert time; since this call appends at most one ledger
 *     entry for this student, "prior balance minus total" is exactly what a
 *     post-append re-query would also yield.
 *  9. Apply each invoice-scoped allocation to the actual `bill_invoice` row
 *     — increment `paid_amount`, decrement `balance`, flip
 *     `status` to `PARTIALLY_PAID`/`PAID` as appropriate. This is the SAME
 *     lever `ConcessionsService.postStandalone()`/`CreditNotesService` use
 *     against an already-`POSTED` invoice (the only two mutable numeric
 *     columns `trg_bill_invoice_immutable` leaves writable) — reused
 *     directly here via `BillInvoiceRepository` (already exported from
 *     `domains/billing`'s public barrel) rather than asking billing to grow
 *     a new dedicated method, since the update is a 3-line pattern with an
 *     existing precedent, not a genuinely new cross-cutting concern.
 *     Also applies the allocated amount against that invoice's
 *     `bill_installment` rows, oldest-`seq`-first up to each installment's
 *     own remaining capacity (`amount - settled_amount`) — a documented
 *     simplification: `pay_receipt_allocation` rows stay invoice-scoped
 *     (this pass does not populate `installment_id` on them), installment
 *     settlement is tracked purely as a `bill_installment.settled_amount`
 *     bookkeeping side effect.
 *  9b. **Phase 6 Slice 12 (Part D)**: when step 6's `prepaymentTotal` is
 *      positive (a real overpayment — BR-PAY-02/03's own FIFO allocation in
 *      step 5 already swept the receipt across EVERY one of the student's
 *      open invoices first, so this is genuinely "nothing left to collect",
 *      the exact FR-PAY-004 case), also calls Billing's new
 *      `StudentCreditService.issue()` to record a matching `ISSUE`
 *      `bill_student_credit_entry` and increment the student's Credit
 *      Balance cache (`bill_student_credit.balance`) — turning the
 *      pre-existing one-way P-09 GL posting into a real, trackable,
 *      per-student balance for the first time. Does NOT change the P-08/P-09
 *      GL posting in step 6 one bit.
 *  10. Append one `std_ledger_entry` via `StudentLedgerService.appendEntry()`
 *      — `credit = total, debit = 0` (a payment reduces what the student
 *      owes).
 *  11. (Folded into step 8 — see that step's note on `balance_after`.)
 *  12. Cashier session totals are NOT updated incrementally here — they are
 *      DERIVED at `CashierSessionsService.closeSession()` time by
 *      re-aggregating this session's posted receipts' splits (see that
 *      service's doc comment). Simpler, and avoids a second hot-row
 *      contention point on every receipt capture.
 *
 * **`reverseReceipt()` — BR-PAY-08.** Generates a contra receipt (number
 * prefix `RVS-`, via a distinct `docType='RVS_PAY_RECEIPT'` so
 * `NumberingService`'s own prefix auto-derivation produces `RVS-` with no
 * change to `NumberingService` itself), unwinds every allocation exactly
 * (reverses the `bill_invoice.paid_amount`/`balance` adjustment and
 * `bill_installment.settled_amount` — the installment unwind walks in
 * REVERSE `seq` order, the exact mirror of `captureReceipt()`'s
 * forward-`seq` application, which exactly undoes a single receipt's effect
 * as long as no other settlement activity touched the same installments in
 * between — a documented best-effort-exact assumption), reverses the GL via
 * `PostingService.reverse()`, sets the original `status='REVERSED'`, and
 * cross-references the two documents via the contra's `reversal_of_id`
 * (the original has no matching forward-pointing column in the DDL — the
 * contra's `reversal_of_id` IS the cross-reference; `findByReversalOfId()`
 * queries it from the original's side). Mirrors the original's splits and
 * allocations onto the contra row (same methods/amounts/targets) so
 * `trg_pay_splits_sum`/`trg_pay_allocations_sum`'s deferred constraints are
 * satisfied for the new row too.
 *
 * Does NOT call `ApprovalEngineService` itself — `approvalRef` is accepted
 * as a pre-approved parameter and simply recorded, matching how
 * `ConcessionsService.requestConcession()` (submits) vs `.postStandalone()`
 * (assumes already-approved) are split in Billing; Pass B wires the
 * `PAYMENT_REVERSALS` approval chain at the controller/workflow level.
 *
 * **`recordWalletFundedReceipt()` — Phase 6 Slice 12 (Part A).** Records a
 * wallet/credit-balance-funded receipt as a pure audit-trail document (no GL
 * posting, `journalId: null` — see migration `0233`) on behalf of
 * `WalletTransactionsService.transferToFees()`/`.sweepToInvoices()`. See
 * that method's own doc comment for the full algorithm and the reasoning
 * behind mirroring `captureReceipt()`'s `balance_after`/`std_ledger_entry`
 * conventions. `reverseReceipt()` refuses to reverse any receipt this method
 * produced (`NON_REVERSIBLE_RECEIPT_SPLIT_METHODS` guard, checked
 * immediately after loading the original splits) — this is deliberate, not
 * an oversight: reversing it would restore the GL's AR_STUDENT/WALLET
 * balance while leaving the wallet's own balance completely untouched, the
 * real financial-correctness risk this whole dispatch exists to close.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly receiptRepository: PayReceiptRepository,
    private readonly splitRepository: PayReceiptSplitRepository,
    private readonly allocationRepository: PayReceiptAllocationRepository,
    private readonly chequeRepository: PayChequeRepository,
    private readonly sessionRepository: PayCashierSessionRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly studentLedgerService: StudentLedgerService,
    private readonly ledgerEntryRepository: StdLedgerEntryRepository,
    private readonly studentRepository: StdStudentRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly installmentRepository: BillInstallmentRepository,
    private readonly allocationService: AllocationService,
    // Phase 6 Slice 12 (Part D) — appended at the END of the existing
    // constructor param list (not interleaved), the exact same discipline
    // Part A's own `WalletTransactionsService` constructor extension
    // documents — keeps every pre-existing positional `new ReceiptsService(...)`
    // call (real code and every prior test file) valid with only an append.
    // `domains/payments' `mayImport` list already includes `domains/billing`
    // (`BillInvoiceRepository`/`BillInstallmentRepository`/
    // `resolveControlAccount` are already injected above), and
    // `PaymentsModule` already imports `BillingModule` — `StudentCreditService`
    // needed no new module-level wiring beyond registering/exporting it from
    // `billing.module.ts`/`domains/billing`'s barrel (confirmed, not assumed).
    private readonly studentCreditService: StudentCreditService,
    // Phase 6 Slice 16 (Part 1) — appended at the END of the existing
    // constructor param list (not interleaved), the exact same discipline
    // Part D's own `studentCreditService` extension above documents — keeps
    // every pre-existing positional `new ReceiptsService(...)` call (real
    // code and every prior test file) valid with only an append.
    private readonly documentVerificationService: DocumentVerificationService,
  ) {}

  async captureReceipt(em: EntityManager, input: CaptureReceiptInput): Promise<PayReceiptEntity> {
    // --- Step 1: idempotency replay ---
    if (input.idempotencyKey) {
      const existing = await this.receiptRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }

    // --- Step 2: validation ---
    await this.studentRepository.findByIdOrFail(input.studentId, em);
    if (!input.total.isPositive()) {
      throw new ValidationException("ReceiptsService.captureReceipt: total must be positive");
    }
    if (input.splits.length === 0) {
      throw new ValidationException("ReceiptsService.captureReceipt: at least one split is required");
    }
    const splitSum = input.splits.reduce((sum, split) => sum.add(split.amount), Money.ZERO);
    if (!splitSum.equals(input.total)) {
      throw new ValidationException(
        `BR-PAY-01: Σsplits ${splitSum.toDecimalString()} must equal receipt total ${input.total.toDecimalString()}`,
      );
    }
    for (const split of input.splits) {
      if (!split.amount.isPositive()) {
        throw new ValidationException(`ReceiptsService.captureReceipt: split amount must be positive (method=${split.method})`);
      }
      this.validateSplitReferences(split);
    }

    // --- Step 3: CASH requires an OPEN session belonging to the cashier (BR-PAY-04) ---
    const hasCash = input.splits.some((split) => split.method === "CASH");
    if (hasCash) {
      if (!input.sessionId) {
        throw new ValidationException("BR-PAY-04: a CASH split requires sessionId (an OPEN cashier session)");
      }
      const session = await this.sessionRepository.findByIdOrFail(input.sessionId, em);
      if (session.status !== "OPEN") {
        throw new ValidationException(`BR-PAY-04: session ${input.sessionId} is not OPEN (status=${session.status})`);
      }
      if (session.cashierId !== input.cashierId) {
        throw new ValidationException(`BR-PAY-04: session ${input.sessionId} does not belong to cashier ${input.cashierId}`);
      }
    }

    const receiptId = generateUuidV7();

    // --- Step 4: CHEQUE splits create pay_cheque rows (UNCLEARED) ---
    const chequeIdByIndex = new Map<number, string>();
    for (let i = 0; i < input.splits.length; i++) {
      const split = input.splits[i];
      if (split.method !== "CHEQUE") continue;
      const details = split.chequeDetails!;
      const cheque = await this.chequeRepository.create(
        {
          bankName: details.bankName,
          chequeNo: details.chequeNo,
          chequeDate: details.chequeDate,
          drawer: details.drawer,
          amount: split.amount,
          status: "UNCLEARED",
          statusChangedAt: null,
          bounceFeeApplied: false,
          createdBy: input.cashierId,
          updatedBy: input.cashierId,
        },
        em,
      );
      chequeIdByIndex.set(i, cheque.id);
    }

    // --- Step 5: resolve allocations (BR-PAY-03) ---
    const allocations = await this.allocationService.resolveAllocations(em, {
      studentId: input.studentId,
      amount: input.total,
      invoiceIds: input.invoiceIds,
    });

    // --- Step 6: ONE balanced journal (P-08 + P-09) ---
    const journalLines: PostJournalLineDraft[] = [];
    const clearingAccountCache = new Map<PayReceiptSplitMethod, string>();
    const clearingTotals = new Map<string, Money>();
    for (const split of input.splits) {
      let accountId = clearingAccountCache.get(split.method);
      if (!accountId) {
        const account = await resolveClearingAccount(this.glAccountRepository, split.method, em);
        accountId = account.id;
        clearingAccountCache.set(split.method, accountId);
      }
      clearingTotals.set(accountId, (clearingTotals.get(accountId) ?? Money.ZERO).add(split.amount));
    }
    for (const [accountId, amount] of clearingTotals) {
      journalLines.push({
        accountId,
        debit: amount,
        credit: Money.ZERO,
        memo: "P-08/P-09 payment received",
        entityRefType: "pay_receipt",
        entityRefId: receiptId,
      });
    }

    const invoiceAllocatedTotal = allocations
      .filter((alloc) => !alloc.toPrepayment)
      .reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);
    const prepaymentTotal = allocations
      .filter((alloc) => alloc.toPrepayment)
      .reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);

    if (invoiceAllocatedTotal.isPositive()) {
      const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);
      journalLines.push({
        accountId: arStudent.id,
        debit: Money.ZERO,
        credit: invoiceAllocatedTotal,
        memo: "P-08 fee payment received",
        entityRefType: "pay_receipt",
        entityRefId: receiptId,
      });
    }
    if (prepaymentTotal.isPositive()) {
      const prepayment = await resolveControlAccount(this.glAccountRepository, "PREPAYMENT", em);
      journalLines.push({
        accountId: prepayment.id,
        debit: Money.ZERO,
        credit: prepaymentTotal,
        memo: "P-09 advance payment (no open invoice)",
        entityRefType: "pay_receipt",
        entityRefId: receiptId,
      });
    }

    const journal = await this.postingService.post(em, {
      journalDate: input.receiptDate,
      sourceModule: "payments",
      sourceDocType: "pay_receipt",
      sourceDocId: receiptId,
      narration: `Receipt captured (student ${input.studentId})`,
      journalType: "MANUAL",
      postedBy: input.cashierId,
      lines: journalLines,
    });

    // --- Step 7: receipt number ---
    const number = await this.numberingService.allocate(em, RECEIPT_DOC_TYPE);

    // --- Step 8: balance_after (see class doc comment) ---
    const balanceAfter = await this.computeBalanceAfterCredit(input.studentId, input.total, em);

    const receipt = await this.receiptRepository.create(
      {
        id: receiptId,
        number,
        studentId: input.studentId,
        payerName: input.payerName,
        payerPhone: input.payerPhone ?? null,
        receiptDate: input.receiptDate,
        total: input.total,
        status: "POSTED",
        reversalOfId: null,
        reversalReason: null,
        approvalRef: null,
        cashierId: input.cashierId,
        sessionId: input.sessionId ?? null,
        journalId: journal.id,
        idempotencyKey: input.idempotencyKey ?? null,
        balanceAfter,
        reprintCount: 0,
        createdBy: input.cashierId,
        updatedBy: input.cashierId,
      },
      em,
    );

    // Phase 6 Slice 16 (Part 1) — mint an opaque verification token for this
    // receipt, inside this same transaction, immediately after the
    // `pay_receipt` row itself is inserted (its FK-less `document_id` target
    // must already exist). Only `captureReceipt()` mints — deliberately NOT
    // called from `recordSubledgerFundedReceipt()` (wallet/credit-balance
    // funded receipts) or `reverseReceipt()`'s contra receipt, so those stay
    // without a token of their own; `findByDocument()` correctly returns
    // `null` for them via `ReceiptsController`'s "get by id" path.
    await this.documentVerificationService.mint(em, {
      documentType: PAYMENT_RECEIPT_DOCUMENT_TYPE,
      documentId: receipt.id,
      documentRef: receipt.number,
      summary: {
        payerName: receipt.payerName,
        total: receipt.total.toDecimalString(),
        receiptDate: receipt.receiptDate,
        receiptNumber: receipt.number,
      },
    });

    for (let i = 0; i < input.splits.length; i++) {
      const split = input.splits[i];
      await this.splitRepository.create(
        {
          receiptId,
          method: split.method,
          amount: split.amount,
          bankAccountId: split.bankAccountId ?? null,
          chequeId: chequeIdByIndex.get(i) ?? null,
          mpesaTransactionId: split.mpesaTransactionId ?? null,
          externalRef: split.externalRef ?? null,
          createdBy: input.cashierId,
          updatedBy: input.cashierId,
        },
        em,
      );
    }

    for (const alloc of allocations) {
      await this.allocationRepository.create(
        {
          receiptId,
          invoiceId: alloc.invoiceId ?? null,
          installmentId: alloc.installmentId ?? null,
          toPrepayment: alloc.toPrepayment,
          amount: alloc.amount,
          createdBy: input.cashierId,
          updatedBy: input.cashierId,
        },
        em,
      );
    }

    // --- Step 9: apply invoice-scoped allocations to bill_invoice/bill_installment ---
    for (const alloc of allocations) {
      if (alloc.toPrepayment || !alloc.invoiceId) continue;
      await this.applyInvoiceAllocation(em, alloc.invoiceId, alloc.amount, input.cashierId);
    }

    // --- Step 9b: Phase 6 Slice 12 (Part D) — issue a Credit Balance entry
    // for the overpaid remainder (P-10, FR-PAY-004). `prepaymentTotal` was
    // already computed in step 6 (unchanged, still used there for the
    // existing P-09 GL posting) — reused here, not recomputed. This does NOT
    // change the P-08/P-09 GL posting above one bit; it only turns the
    // existing one-way `toPrepayment` GL credit into a real, trackable,
    // per-student balance for the first time. Placed AFTER the `receipt` row
    // is actually inserted (a few lines up) — `bill_student_credit_entry
    // .receipt_id`'s real DB-level FK constraint is checked at statement
    // time, not deferred (see that table's own migration `0236` doc
    // comment), so the target row must already exist.
    if (prepaymentTotal.isPositive()) {
      await this.studentCreditService.issue(em, input.studentId, prepaymentTotal, {
        receiptId,
        actorId: input.cashierId,
      });
    }

    // --- Step 10: student ledger entry ---
    await this.studentLedgerService.appendEntry(em, {
      studentId: input.studentId,
      entryDate: input.receiptDate,
      docType: RECEIPT_DOC_TYPE,
      docId: receiptId,
      docNumber: number,
      debit: Money.ZERO,
      credit: input.total,
      memo: "Receipt posted",
    });

    return receipt;
  }

  /**
   * Phase 6 Slice 12 (Part A) — records a wallet/credit-balance-funded
   * receipt as a PURE audit-trail document. Called by
   * `WalletTransactionsService.transferToFees()`/`.sweepToInvoices()` (and,
   * Part D, Billing's `applyStudentCreditToInvoices()`-equivalent) AFTER
   * their own GL posting + `bill_invoice`/`bill_installment` application
   * already succeeded — this method does NOT call `PostingService.post()`
   * (the real GL effect already happened via the caller's own journal) and
   * does NOT touch `bill_invoice`/`bill_installment` (already done by the
   * caller). `journalId` is deliberately `null` (migration `0233`).
   *
   * Mirrors `captureReceipt()`'s own conventions for everything else, for
   * consistency (a wallet-funded receipt should read identically to an
   * ordinary one everywhere it's displayed/reported):
   *  - Same `NumberingService.allocate(em, RECEIPT_DOC_TYPE)` numbering
   *    sequence (`PAY-######`) — NOT a separate series; this is a real
   *    receipt, just one funded from a subledger instead of an external
   *    payment method.
   *  - Same `balance_after` convention (`computeBalanceAfterCredit()` —
   *    prior running student-ledger balance minus this receipt's total).
   *  - Same one `std_ledger_entry` append (`StudentLedgerService
   *    .appendEntry()`, credit=total/debit=0) `captureReceipt()`'s own step
   *    10 makes — judged cheap and safe to mirror here too: it is a single
   *    extra insert with no side effect beyond the student's own statement
   *    (the running-balance view `getRunningBalance()`/`balance_after` both
   *    already depend on), and OMITTING it would leave the student's
   *    statement silently missing a real payment that every other funding
   *    method (cash/bank/cheque/M-Pesa) always records — a worse and more
   *    surprising gap than the one extra row costs. Decision documented here
   *    explicitly per the dispatch's own instruction to record the judgement
   *    call either way.
   *
   * Diverges from `captureReceipt()` deliberately in exactly three ways:
   * no `AllocationService.resolveAllocations()` call (the caller already
   * decided the exact per-invoice split — a wallet/credit sweep only ever
   * applies UP TO what's owed, never overpays, so every allocation row here
   * is `toPrepayment: false`), no GL posting, and exactly one `WALLET`
   * split of the full total (never split across methods — a sweep is
   * single-method by construction).
   */
  async recordWalletFundedReceipt(em: EntityManager, input: RecordWalletFundedReceiptInput): Promise<PayReceiptEntity> {
    return this.recordSubledgerFundedReceipt(em, {
      studentId: input.studentId,
      payerName: input.payerName,
      receiptDate: input.receiptDate,
      allocations: input.allocations,
      cashierId: input.cashierId,
      method: "WALLET",
      journalId: null,
      ledgerMemo: `Wallet-funded receipt (wallet transaction ${input.walletTransactionId})`,
    });
  }

  /**
   * Phase 6 Slice 12 (Part D) — the shared body `recordWalletFundedReceipt()`
   * (above) and `applyStudentCreditToInvoices()` (below) both delegate to,
   * generalized over exactly the three things that differ between a
   * WALLET-funded and a CREDIT_BALANCE-funded receipt: the split `method`,
   * whether a real `journalId` exists (`null` for WALLET — the wallet's own
   * journal already carries the real GL effect; a real id for
   * CREDIT_BALANCE — `applyStudentCreditToInvoices()` posts a genuinely new
   * P-10 journal of its own), and the `std_ledger_entry` memo text. Every
   * other line of the two pre-existing methods' bodies (Part A's
   * `recordWalletFundedReceipt()`, before this pass) was byte-for-byte
   * identical, so this generalization was the DRY choice over a second,
   * near-duplicate method — see this dispatch's own report for the full
   * "why generalize vs. duplicate" reasoning.
   *
   * **Deliberately preserves `recordWalletFundedReceipt()`'s PUBLIC
   * signature exactly as Part A left it** (`RecordWalletFundedReceiptInput`
   * is completely unchanged) — `WalletTransactionsService`
   * (`wallet-transactions.service.ts`) is an off-limits, already-merged Part
   * A file for this dispatch; its existing call site
   * (`this.receiptsService.recordWalletFundedReceipt(em, {...})`, no
   * `method`/`journalId` fields) continues to compile and behave
   * byte-for-byte identically with zero edits there, confirmed by this
   * generalization routing it through this private helper with `method:
   * "WALLET"`/`journalId: null` hardcoded at the call site above, not
   * threaded through as new public-input fields.
   *
   * Accepts an optional pre-generated `id` — `applyStudentCreditToInvoices()`
   * needs the receipt's real id BEFORE this method runs (to stamp it as the
   * P-10 journal's `sourceDocId`/`entityRefId`, mirroring `captureReceipt()`'s
   * own `receiptId`-generated-early convention), whereas
   * `recordWalletFundedReceipt()` has no such coupling and continues to let
   * a fresh id be minted here, exactly as before.
   */
  private async recordSubledgerFundedReceipt(
    em: EntityManager,
    input: {
      id?: string;
      studentId: string;
      payerName: string;
      receiptDate: string;
      allocations: RecordWalletFundedReceiptAllocationInput[];
      cashierId: string;
      method: "WALLET" | "CREDIT_BALANCE";
      journalId: string | null;
      ledgerMemo: string;
    },
  ): Promise<PayReceiptEntity> {
    if (input.allocations.length === 0) {
      throw new ValidationException("ReceiptsService.recordSubledgerFundedReceipt: at least one allocation is required");
    }
    const total = input.allocations.reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);
    if (!total.isPositive()) {
      throw new ValidationException("ReceiptsService.recordSubledgerFundedReceipt: allocations must sum to a positive total");
    }
    for (const alloc of input.allocations) {
      if (!alloc.amount.isPositive()) {
        throw new ValidationException(
          `ReceiptsService.recordSubledgerFundedReceipt: allocation amount must be positive (invoice ${alloc.invoiceId})`,
        );
      }
    }

    const receiptId = input.id ?? generateUuidV7();
    const number = await this.numberingService.allocate(em, RECEIPT_DOC_TYPE);
    const balanceAfter = await this.computeBalanceAfterCredit(input.studentId, total, em);

    const receipt = await this.receiptRepository.create(
      {
        id: receiptId,
        number,
        studentId: input.studentId,
        payerName: input.payerName,
        payerPhone: null,
        receiptDate: input.receiptDate,
        total,
        status: "POSTED",
        reversalOfId: null,
        reversalReason: null,
        approvalRef: null,
        cashierId: input.cashierId,
        sessionId: null,
        journalId: input.journalId,
        idempotencyKey: null,
        balanceAfter,
        reprintCount: 0,
        createdBy: input.cashierId,
        updatedBy: input.cashierId,
      },
      em,
    );

    await this.splitRepository.create(
      {
        receiptId,
        method: input.method,
        amount: total,
        bankAccountId: null,
        chequeId: null,
        mpesaTransactionId: null,
        externalRef: null,
        createdBy: input.cashierId,
        updatedBy: input.cashierId,
      },
      em,
    );

    for (const alloc of input.allocations) {
      await this.allocationRepository.create(
        {
          receiptId,
          invoiceId: alloc.invoiceId,
          installmentId: null,
          toPrepayment: false,
          amount: alloc.amount,
          createdBy: input.cashierId,
          updatedBy: input.cashierId,
        },
        em,
      );
    }

    await this.studentLedgerService.appendEntry(em, {
      studentId: input.studentId,
      entryDate: input.receiptDate,
      docType: RECEIPT_DOC_TYPE,
      docId: receiptId,
      docNumber: number,
      debit: Money.ZERO,
      credit: total,
      memo: input.ledgerMemo,
    });

    return receipt;
  }

  /**
   * Phase 6 Slice 12 (Part D) — applies a student's Credit Balance
   * (`bill_student_credit`, FR-PAY-004) across a caller-ordered list of
   * invoices (typically the newly-generated invoice(s) for one student,
   * oldest-due-first), stopping the moment the credit balance is exhausted.
   * Same overall shape as `WalletTransactionsService.sweepToInvoices()`
   * (Part A) — multi-invoice, caller-ordered, stops mid-list — but, UNLIKE
   * that method's null-journal audit-only receipt, this one is a genuinely
   * NEW GL posting: locks the student's credit balance
   * (`StudentCreditService.getBalanceForUpdate()`), posts ONE new P-10
   * journal (debit `PREPAYMENT`, credit `AR_STUDENT`, for the total actually
   * applied — docs/phase-2/01-functional-requirements.md's own P-10 row,
   * documented since Phase 2, never implemented until this pass), applies
   * each invoice-scoped allocation via the existing private
   * `applyInvoiceAllocation()` (reused directly, not duplicated), creates
   * ONE receipt + ONE `CREDIT_BALANCE` split + N allocations with a REAL
   * `journalId` (not null), and logs ONE aggregate `CONSUME`
   * `bill_student_credit_entry` for the total (`StudentCreditService
   * .consume()`) — mirroring `sweepToInvoices()`'s own "one aggregate
   * ledger row, not one per invoice" shape.
   *
   * No approval-threshold concept applies here (confirmed against the plan's
   * own Part D description before writing this — unlike
   * `WalletTransactionsService.transferToFees()`/`.sweepToInvoices()`'s
   * `assertBelowThresholdOrApproved()` gate, FR-WALL-013.1 is a Wallet-only
   * business rule; nothing in FR-PAY-004 or the P-10 posting-map row
   * describes an equivalent for Credit Balance).
   */
  async applyStudentCreditToInvoices(
    em: EntityManager,
    input: ApplyStudentCreditToInvoicesInput,
    actorId: string,
  ): Promise<ApplyStudentCreditToInvoicesResult> {
    if (input.invoiceIds.length === 0) {
      throw new ValidationException("ReceiptsService.applyStudentCreditToInvoices: invoiceIds must not be empty");
    }

    let remaining = await this.studentCreditService.getBalanceForUpdate(em, input.studentId);

    const allocations: ApplyStudentCreditAllocationResult[] = [];
    const shortfall: ApplyStudentCreditShortfallResult[] = [];

    for (const invoiceId of input.invoiceIds) {
      const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
      if (invoice.studentId !== input.studentId) {
        throw new ValidationException(
          `ReceiptsService.applyStudentCreditToInvoices: invoice ${invoiceId} belongs to a different student ` +
            `than ${input.studentId}`,
        );
      }
      if (!invoice.balance.isPositive()) continue; // already fully paid/void — nothing for this to do

      // Captured BEFORE applyInvoiceAllocation() runs — that private helper
      // mutates `invoice.balance` in place, the exact same real bug class
      // Part A's own sweepToInvoices() caught and documented; computing
      // `stillOwed` from the pre-mutation value here avoids reintroducing it.
      const balanceBeforeApply = invoice.balance;
      const take = remaining.isPositive() ? minMoney(remaining, balanceBeforeApply) : Money.ZERO;
      if (take.isPositive()) {
        await this.applyInvoiceAllocation(em, invoiceId, take, actorId);
        remaining = remaining.subtract(take);
        allocations.push({ invoiceId, amount: take });
      }

      const stillOwed = balanceBeforeApply.subtract(take);
      if (stillOwed.isPositive()) {
        shortfall.push({ invoiceId, remainingBalance: stillOwed });
      }
    }

    const totalApplied = allocations.reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);
    if (!totalApplied.isPositive()) {
      return { totalApplied: Money.ZERO, allocations: [], receiptId: null, shortfall };
    }

    const receiptId = generateUuidV7();
    const prepayment = await resolveControlAccount(this.glAccountRepository, "PREPAYMENT", em);
    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);
    const journal = await this.postingService.post(em, {
      journalDate: todayIsoDate(),
      sourceModule: "payments",
      sourceDocType: "pay_receipt",
      sourceDocId: receiptId,
      narration: `P-10 credit balance applied across ${allocations.length} invoice(s) (student ${input.studentId})`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: prepayment.id, debit: totalApplied, credit: Money.ZERO, entityRefType: "pay_receipt", entityRefId: receiptId },
        { accountId: arStudent.id, debit: Money.ZERO, credit: totalApplied, entityRefType: "pay_receipt", entityRefId: receiptId },
      ],
    });

    const student = await this.studentRepository.findByIdOrFail(input.studentId, em);
    const receipt = await this.recordSubledgerFundedReceipt(em, {
      id: receiptId,
      studentId: input.studentId,
      payerName: `${student.firstName} ${student.lastName}`,
      receiptDate: todayIsoDate(),
      allocations,
      cashierId: actorId,
      method: "CREDIT_BALANCE",
      journalId: journal.id,
      ledgerMemo: "Credit balance applied to invoice(s)",
    });

    await this.studentCreditService.consume(em, input.studentId, totalApplied, {
      invoiceId: null,
      receiptId: receipt.id,
      actorId,
    });

    return { totalApplied, allocations, receiptId: receipt.id, shortfall };
  }

  /**
   * `approvalRef` is `string | null` — Module 10 PASS B's `ChequesService.bounce()`
   * calls this with `null` for its single-split-receipt path: a cheque
   * bounce is a system-triggered correction (the bank returned the
   * instrument), not a discretionary manual reversal, so it does not go
   * through the `PAYMENT_REVERSALS` approval chain the way
   * `ReceiptsController`'s explicit `/reverse` endpoint does (see this
   * class's own doc comment "Does NOT call ApprovalEngineService itself").
   * `pay_receipt.approval_ref` is a nullable, FK-less `uuid` column, so
   * `null` is a legitimate value here, not a workaround.
   */
  async reverseReceipt(
    em: EntityManager,
    receiptId: string,
    reasonCode: ReceiptReversalReasonCode,
    approvalRef: string | null,
    reversedBy: string,
  ): Promise<PayReceiptEntity> {
    const original = await this.receiptRepository.findByIdOrFail(receiptId, em);
    if (original.status !== "POSTED") {
      throw new ValidationException(`ReceiptsService.reverseReceipt: receipt ${receiptId} is not POSTED (status=${original.status})`);
    }

    const originalSplits = await this.splitRepository.listByReceipt(receiptId, em);

    // Phase 6 Slice 12 (Part A) — reversal-safety guard. See
    // NON_REVERSIBLE_RECEIPT_SPLIT_METHODS' own doc comment for the full
    // GL/subledger-desync reasoning this exists to prevent. Placed here,
    // immediately after loading the original splits and BEFORE any
    // reversal logic (allocation unwind, GL reverse, contra receipt) runs.
    if (originalSplits.some((split) => NON_REVERSIBLE_RECEIPT_SPLIT_METHODS.includes(split.method))) {
      throw new ValidationException(
        "This receipt was funded from the student's wallet/credit balance and can't be reversed here — " +
          "it would restore the ledger but not the wallet/credit balance. Contact an administrator for a manual correction.",
      );
    }

    // Defense-in-depth type narrowing: every receipt with journalId===null
    // is, by this pass's own construction (recordWalletFundedReceipt()
    // never sets one), always WALLET/CREDIT_BALANCE-funded and already
    // rejected by the guard immediately above — this makes that invariant
    // explicit and gives PostingService.reverse() below a real `string`
    // rather than reaching for a non-null assertion.
    const journalId = original.journalId;
    if (!journalId) {
      throw new ValidationException(
        `ReceiptsService.reverseReceipt: receipt ${receiptId} has no journal_id to reverse — cannot proceed`,
      );
    }

    const originalAllocations = await this.allocationRepository.listByReceipt(receiptId, em);

    // Phase 6 Slice 12 (Part D) — net out any Credit Balance this receipt
    // issued as a side effect of an overpayment (a `toPrepayment` allocation
    // on an ORDINARY receipt whose own split method is CASH/BANK/etc — the
    // NON_REVERSIBLE_RECEIPT_SPLIT_METHODS guard above only blocks a receipt
    // FUNDED BY wallet/credit-balance, a different case entirely). Reads
    // `originalAllocations` once, for both this and the unwind loop below.
    // Deliberately placed BEFORE the unwind loop, the GL reverse, and every
    // other mutation in this method — `StudentCreditService
    // .netOutIssuedCredit()` locks the row, checks `balance >= amount`, and
    // throws the exact specified `ValidationException` (with NO other
    // mutation having run yet) if some of the credit was already spent
    // elsewhere via `applyStudentCreditToInvoices()` — so a thrown exception
    // here leaves nothing partially done, per the plan's own explicit
    // requirement. References the ORIGINAL receipt's own id on the logged
    // `CONSUME` entry (not the not-yet-created contra) — see
    // `StudentCreditService.netOutIssuedCredit()`'s own doc comment for why.
    const prepaymentTotal = originalAllocations
      .filter((alloc) => alloc.toPrepayment)
      .reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);
    if (prepaymentTotal.isPositive()) {
      await this.studentCreditService.netOutIssuedCredit(em, original.studentId, prepaymentTotal, {
        receiptId: original.id,
        actorId: reversedBy,
      });
    }

    // Unwind allocations exactly (BR-PAY-08).
    for (const alloc of originalAllocations) {
      if (alloc.toPrepayment || !alloc.invoiceId) continue;
      await this.unwindInvoiceAllocation(em, alloc.invoiceId, alloc.amount, reversedBy);
    }

    // Reverse the GL journal (swaps every debit/credit of the original).
    const reversalJournal = await this.postingService.reverse(
      em,
      journalId,
      `Receipt ${original.number} reversed (${reasonCode})`,
      reversedBy,
    );

    const contraId = generateUuidV7();
    const contraNumber = await this.numberingService.allocate(em, REVERSAL_RECEIPT_DOC_TYPE);
    const contraBalanceAfter = await this.computeBalanceAfterDebit(original.studentId, original.total, em);

    const contra = await this.receiptRepository.create(
      {
        id: contraId,
        number: contraNumber,
        studentId: original.studentId,
        payerName: original.payerName,
        payerPhone: original.payerPhone,
        receiptDate: new Date().toISOString().slice(0, 10),
        total: original.total,
        status: "POSTED",
        reversalOfId: original.id,
        reversalReason: reasonCode,
        approvalRef,
        cashierId: reversedBy,
        sessionId: null,
        journalId: reversalJournal.id,
        idempotencyKey: null,
        balanceAfter: contraBalanceAfter,
        reprintCount: 0,
        createdBy: reversedBy,
        updatedBy: reversedBy,
      },
      em,
    );

    for (const split of originalSplits) {
      await this.splitRepository.create(
        {
          receiptId: contraId,
          method: split.method,
          amount: split.amount,
          bankAccountId: split.bankAccountId,
          chequeId: split.chequeId,
          mpesaTransactionId: split.mpesaTransactionId,
          externalRef: split.externalRef,
          createdBy: reversedBy,
          updatedBy: reversedBy,
        },
        em,
      );
    }

    for (const alloc of originalAllocations) {
      await this.allocationRepository.create(
        {
          receiptId: contraId,
          invoiceId: alloc.invoiceId,
          installmentId: alloc.installmentId,
          toPrepayment: alloc.toPrepayment,
          amount: alloc.amount,
          createdBy: reversedBy,
          updatedBy: reversedBy,
        },
        em,
      );
    }

    await this.studentLedgerService.appendEntry(em, {
      studentId: original.studentId,
      entryDate: contra.receiptDate,
      docType: REVERSAL_RECEIPT_DOC_TYPE,
      docId: contraId,
      docNumber: contraNumber,
      debit: original.total,
      credit: Money.ZERO,
      memo: `Receipt ${original.number} reversed (${reasonCode})`,
    });

    original.status = "REVERSED";
    original.reversalReason = reasonCode;
    original.approvalRef = approvalRef;
    original.updatedBy = reversedBy;
    await this.receiptRepository.save(original, em);

    return contra;
  }

  // ---- helpers ----

  private validateSplitReferences(split: CaptureReceiptSplitInput): void {
    switch (split.method) {
      case "WALLET":
        throw new ValidationException(
          "WALLET-method payments are not yet supported by ReceiptsService.captureReceipt() — " +
            "Module 11 (Wallet) is not built yet (Pass B will wire BR-PAY-09's same-transaction wallet debit). " +
            "Resubmit the receipt without a WALLET split.",
        );
      case "CREDIT_BALANCE":
        // Phase 6 Slice 12 (Part D) — same rejection as WALLET, and for the
        // same reason: a CREDIT_BALANCE-method receipt is only ever produced
        // internally by applyStudentCreditToInvoices() (via the private
        // recordSubledgerFundedReceipt() helper, which bypasses this
        // validation path entirely, the same way recordWalletFundedReceipt()
        // always has), never by a cashier manually keying "CREDIT_BALANCE"
        // into an ordinary capture form — that would bypass the real
        // row-locked balance check/P-10 GL posting `StudentCreditService
        // .consume()`/`applyStudentCreditToInvoices()` perform.
        throw new ValidationException(
          "CREDIT_BALANCE-method payments cannot be submitted directly to ReceiptsService.captureReceipt() — " +
            "use POST /payments/receipts/apply-student-credit instead, which correctly locks the balance and posts the P-10 GL entry. " +
            "Resubmit the receipt without a CREDIT_BALANCE split.",
        );
      case "CHEQUE":
        if (!split.chequeDetails) {
          throw new ValidationException("CHEQUE split requires chequeDetails (bankName, chequeNo, chequeDate, drawer)");
        }
        break;
      case "BANK":
      case "BANK_TRANSFER":
        if (!split.bankAccountId || !split.externalRef) {
          throw new ValidationException(`${split.method} split requires bankAccountId and externalRef (deposit slip reference)`);
        }
        break;
      case "CARD":
      case "POS":
        if (!split.externalRef) {
          throw new ValidationException(`${split.method} split requires externalRef (terminal reference)`);
        }
        break;
      case "CASH":
      case "MPESA_STK":
      case "MPESA_C2B":
      case "MPESA_TILL":
        break;
      /* istanbul ignore next -- exhaustive over PayReceiptSplitMethod, unreachable at the type level */
      default: {
        const exhaustive: never = split.method;
        throw new ValidationException(`Unknown PayReceiptSplitMethod: ${String(exhaustive)}`);
      }
    }
  }

  private async applyInvoiceAllocation(em: EntityManager, invoiceId: string, amount: Money, actorId: string): Promise<void> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    invoice.paidAmount = invoice.paidAmount.add(amount);
    invoice.balance = invoice.balance.subtract(amount);
    if (invoice.balance.isZero()) {
      invoice.status = "PAID";
    } else if (invoice.paidAmount.isPositive()) {
      invoice.status = "PARTIALLY_PAID";
    }
    invoice.updatedBy = actorId;
    await this.invoiceRepository.save(invoice, em);

    const installments = await this.installmentRepository.listByInvoice(invoiceId, em);
    let remaining = amount;
    for (const installment of installments) {
      if (remaining.isZero()) break;
      const capacity = installment.amount.subtract(installment.settledAmount);
      if (!capacity.isPositive()) continue;
      const take = minMoney(capacity, remaining);
      installment.settledAmount = installment.settledAmount.add(take);
      installment.updatedBy = actorId;
      await this.installmentRepository.save(installment, em);
      remaining = remaining.subtract(take);
    }
  }

  /** See class doc comment "reverseReceipt() — BR-PAY-08" for the reverse-seq-order unwind rationale. */
  private async unwindInvoiceAllocation(em: EntityManager, invoiceId: string, amount: Money, actorId: string): Promise<void> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (invoice.status === "VOID") {
      throw new Error(
        `ReceiptsService.reverseReceipt: cannot unwind allocation against VOID invoice ${invoiceId} — data integrity issue`,
      );
    }
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

  private async getRunningBalance(studentId: string, em: EntityManager): Promise<Money> {
    const rows = await this.ledgerEntryRepository.getStatementWithRunningBalance(studentId, em);
    return rows.length > 0 ? rows[rows.length - 1].runningBalance : Money.ZERO;
  }

  /** A receipt credits the student ledger (reduces what's owed) — `balance_after = priorBalance - amount`. */
  private async computeBalanceAfterCredit(studentId: string, amount: Money, em: EntityManager): Promise<Money> {
    const prior = await this.getRunningBalance(studentId, em);
    return prior.subtract(amount);
  }

  /** A reversal debits the student ledger (restores what's owed) — `balance_after = priorBalance + amount`. */
  private async computeBalanceAfterDebit(studentId: string, amount: Money, em: EntityManager): Promise<Money> {
    const prior = await this.getRunningBalance(studentId, em);
    return prior.add(amount);
  }
}

function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}

/** Phase 6 Slice 12 (Part D) — `applyStudentCreditToInvoices()`'s own receipt/journal date (this endpoint carries no caller-supplied date, unlike `captureReceipt()`'s `input.receiptDate`) — same `new Date().toISOString().slice(0, 10)` convention `WalletTransactionsService`'s own `todayIso()` helper (and this codebase's several other same-shaped helpers) already use. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
