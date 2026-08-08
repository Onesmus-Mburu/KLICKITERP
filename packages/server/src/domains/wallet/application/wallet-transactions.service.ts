import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { GlAccountRepository, GlIntegrityRunEntity, GlIntegrityRunRepository, PostingService } from "../../../accounting";
import { SettingsService } from "../../../platform/settings";
// Barrel imports — real runtime dependencies, both already sanctioned by
// `domains/wallet`'s `mayImport` list (`domains/students`/`domains/payments`)
// plus the documented `domains/billing` extension (see
// `wallet-control-accounts.util.ts`'s own import comment).
import { StdGuardianRepository, StdStudentRepository } from "../../students";
import { BillInstallmentRepository, BillInvoiceRepository, resolveControlAccount } from "../../billing";
import { PayReceiptEntity, PayReceiptSplitMethod, ReceiptsService } from "../../payments";
import { WallServicePointRepository } from "../infrastructure/wall-service-point.repository";
import { WallTransactionRepository } from "../infrastructure/wall-transaction.repository";
import { WallWalletRepository } from "../infrastructure/wall-wallet.repository";
import { WallTransactionDirection, WallTransactionEntity, WallTransactionType } from "../domain/wall-transaction.entity";
import { WallWalletEntity } from "../domain/wall-wallet.entity";
import { WalletStatusChangedEvent } from "../events/wallet-status-changed.event";
import { WalletTransactionPostedEvent } from "../events/wallet-transaction-posted.event";
import {
  resolveRefundPayoutAccount,
  resolveTopUpClearingAccount,
  resolveWalletControlAccount,
  WallRefundPayoutMethod,
} from "./wallet-control-accounts.util";

export const WALLET_TRANSFER_APPROVAL_DOMAIN_CODE = "WALLET_TRANSFER";
export const WALLET_REFUND_APPROVAL_DOMAIN_CODE = "WALLET_REFUND";
export const WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE = "WALLET_ADJUSTMENT";

/**
 * `appr_instance.entity_type`/`entity_id` for the two-step submit-then-execute
 * dance (mirrors `ReceiptsController`/`SuspenseController`'s
 * `PAYMENT_REVERSALS` precedent). Deliberately distinct per operation kind
 * (rather than one shared `"wall_wallet"` entityType) — `ApprovalEngineService
 * .getStatus()` resolves the LATEST instance for a given `(entityType,
 * entityId)` pair with no further scoping by `domainCode`, so a wallet with
 * both a pending transfer approval AND a pending refund approval at the same
 * time would be ambiguous under one shared entityType; `entityId` is the
 * wallet id in all three cases.
 */
export const WALLET_TRANSFER_ENTITY_TYPE = "wall_wallet_transfer";
export const WALLET_REFUND_ENTITY_TYPE = "wall_wallet_refund";
export const WALLET_ADJUSTMENT_ENTITY_TYPE = "wall_wallet_adjustment";

/** FR-WALL-013.1 — a wallet-to-wallet/fees transfer above this (Settings key, KES) requires a pre-approved `WALLET_TRANSFER` instance. */
export const WALLET_TRANSFER_APPROVAL_THRESHOLD_SETTING_KEY = "wallet.transfer_approval_threshold";
const DEFAULT_TRANSFER_APPROVAL_THRESHOLD = Money.fromInt(5000);

/** `gl_integrity_run.kind` (varchar(20)) — `reconcile()` reuses accounting's sweep-log table rather than minting a wallet-specific one. See that method's doc comment. */
const WALLET_RECONCILE_KIND = "WALLET_RECONCILE";

export interface TopUpInput {
  walletId: string;
  amount: Money;
  method: PayReceiptSplitMethod;
  /** Optional cross-reference to the `pay_receipt` that funded this top-up (stretch-goal integration point — see class doc comment). */
  receiptId?: string | null;
  idempotencyKey?: string | null;
}

export interface SpendInput {
  walletId: string;
  amount: Money;
  servicePointId: string;
  items?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

export interface TransferToFeesInput {
  walletId: string;
  amount: Money;
  invoiceId: string;
  /** A pre-approved `WALLET_TRANSFER` `appr_instance` id — required only once `amount` exceeds the Settings threshold (see class doc comment). */
  approvalRef?: string | null;
  idempotencyKey?: string | null;
}

export interface SweepToInvoicesInput {
  walletId: string;
  /** Caller-ordered (typically oldest-due-first) — the wallet sweeps into these in the GIVEN order, never re-sorting. */
  invoiceIds: string[];
  /**
   * A pre-approved `WALLET_TRANSFER` `appr_instance` id — required only once
   * the AGGREGATE swept total (across every invoice actually touched)
   * exceeds the transfer approval threshold, the same
   * `assertBelowThresholdOrApproved()` gate `transferToFees()` already uses.
   * Not present in the task brief's own literal `{walletId, invoiceIds,
   * actorId}` signature — added because the brief also explicitly requires
   * this method to enforce that same threshold gate (task brief item 3 +
   * verification item 4), and a gate that can never be satisfied by a real
   * caller would make a legitimately-approved large sweep impossible to
   * complete. Reuses `WALLET_TRANSFER_ENTITY_TYPE`/`WALLET_TRANSFER_APPROVAL_DOMAIN_CODE`
   * keyed by `walletId` — the SAME approval instance `transferToFees()`'s own
   * `.../transfer-to-fees/request` endpoint already knows how to submit, so
   * no new `/request` endpoint was needed for this method's own approval
   * flow (see `WalletTransactionsController.sweepToInvoices()`'s doc
   * comment).
   */
  approvalRef?: string | null;
}

export interface SweepToInvoicesAllocationResult {
  invoiceId: string;
  amount: Money;
}

export interface SweepToInvoicesShortfallResult {
  invoiceId: string;
  /** The invoice's own `balance` still outstanding after this sweep — nonzero either because the wallet ran out before reaching it at all, or because it only partially covered it. */
  remainingBalance: Money;
}

export interface SweepToInvoicesResult {
  /** Zero (with `allocations`/`shortfall` both reflecting that) when the wallet had nothing available to sweep, or every listed invoice was already fully paid — a clean, non-error outcome, never a degenerate empty GL posting. */
  totalSwept: Money;
  allocations: SweepToInvoicesAllocationResult[];
  /** Null when `totalSwept` is zero (no journal/transaction/receipt was posted). */
  receiptId: string | null;
  transactionId: string | null;
  shortfall: SweepToInvoicesShortfallResult[];
}

export interface TransferToWalletInput {
  fromWalletId: string;
  toWalletId: string;
  amount: Money;
  approvalRef?: string | null;
  idempotencyKey?: string | null;
}

export interface TransferToWalletResult {
  outTransaction: WallTransactionEntity;
  inTransaction: WallTransactionEntity;
}

/**
 * BR-WALL-06 payout-target verification shape. `std_guardian.payout_verified`
 * is an opaque `jsonb` column with no documented shape anywhere in the
 * schema docs (carried, unread, since Module 8) — this module's own
 * judgement call interprets it as a map keyed by payout method
 * (`{ CASH: true, BANK: {...}, MPESA_B2C: {...} }`), where a truthy value at
 * `payoutVerified[method]` means that method is verified for this guardian.
 * Documented here rather than silently assumed.
 */
export interface RefundPayoutTarget {
  guardianId: string;
  /** Informational only (e.g. the verified bank account number / phone number) — not re-validated against `payoutVerified`'s inner shape, only the top-level method key is checked. */
  accountRef?: string | null;
}

export interface RefundInput {
  walletId: string;
  amount: Money;
  payoutMethod: WallRefundPayoutMethod;
  payoutTarget: RefundPayoutTarget;
  /** FR-WALL-013.1 — refund > KES 0 ALWAYS requires a pre-approved `WALLET_REFUND` instance; never optional. */
  approvalRef: string;
  idempotencyKey?: string | null;
}

export interface AdjustInput {
  walletId: string;
  amount: Money;
  direction: WallTransactionDirection;
  reasonCode: string;
  idempotencyKey?: string | null;
}

export type CloseWalletDisposition = "REFUND" | "TRANSFER_TO_SIBLING" | "APPLY_TO_FEES";

export interface CloseWalletInput {
  walletId: string;
  disposition: CloseWalletDisposition;
  reason?: string | null;
  /** Required when `disposition='REFUND'`. */
  refund?: { payoutMethod: WallRefundPayoutMethod; payoutTarget: RefundPayoutTarget; approvalRef: string };
  /** Required when `disposition='TRANSFER_TO_SIBLING'`. */
  transferToSiblingWalletId?: string;
  /** Required when `disposition='APPLY_TO_FEES'`. */
  applyToFeesInvoiceId?: string;
  /** `WALLET_TRANSFER` approval ref, only needed if the TRANSFER_TO_SIBLING/APPLY_TO_FEES disposition amount exceeds the transfer threshold. */
  approvalRef?: string | null;
}

/**
 * THE core wallet-balance-moving engine (P-13..P-17, BR-WALL-01..08). Every
 * method takes the caller's own `EntityManager` (composable, no transaction
 * opened here) and does its own row-locking via
 * `WallWalletRepository.findByIdForUpdate()` — the exact discipline
 * `PostingService`/`NumberingService` establish. Every method realizes
 * exactly one balanced `PostingService.post()` call (mirrors
 * `ReceiptsService.captureReceipt()`'s one-journal-per-document shape) and
 * is idempotent when a caller-supplied `idempotencyKey` is given
 * (check-then-return-existing, `ReceiptsService.captureReceipt()`'s pattern).
 *
 * **`applyInvoiceAllocation()` reuse note**: the task brief asks this class
 * to "reuse, don't duplicate" `ReceiptsService`'s invoice-allocation-applying
 * logic — that logic (`ReceiptsService.applyInvoiceAllocation()`) is a
 * *private* method, not exported on `domains/payments`' public surface, so
 * literal reuse isn't possible without growing payments' public API for a
 * 15-line helper. A small local equivalent is built below instead
 * (`applyInvoiceAllocation()`), intentionally kept in lock-step with the
 * original's algorithm (increment `paid_amount`, decrement `balance`, flip
 * `PARTIALLY_PAID`/`PAID`, apply oldest-`seq`-first to `bill_installment`
 * rows) — the same judgement call the task brief explicitly allowed
 * ("else document why you built a small local equivalent").
 *
 * **Stretch goal (payments' WALLET-split gap) — CLOSED, Phase 6 Slice 12
 * (Part A)**: `ReceiptsService.captureReceipt()`'s `validateSplitReferences()`
 * still rejects a caller-submitted `WALLET` split outright (that gap — a
 * cashier manually keying a "WALLET" method into an ordinary capture form —
 * is intentionally NOT what this pass closes); what IS closed is the
 * complementary, actually-needed direction this module owns: `transferToFees()`/
 * the new `sweepToInvoices()` now both call `ReceiptsService
 * .recordWalletFundedReceipt()` (a real, one-directional `domains/wallet` ->
 * `domains/payments` service call, both directions already sanctioned in
 * `module-deps.json`) to leave a genuine receipt behind for money the WALLET
 * side itself already moved, rather than a cashier ever entering `WALLET` as
 * a manual split method on the payments side. See that method's own doc
 * comment, `receipts.service.ts`'s class doc comment
 * ("`recordWalletFundedReceipt()` — Phase 6 Slice 12"), and migration `0233`
 * for the full design (including why the resulting receipt's `journal_id` is
 * null, and why `reverseReceipt()` now refuses to reverse it).
 */
@Injectable()
export class WalletTransactionsService {
  constructor(
    private readonly walletRepository: WallWalletRepository,
    private readonly transactionRepository: WallTransactionRepository,
    private readonly servicePointRepository: WallServicePointRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly settingsService: SettingsService,
    private readonly guardianRepository: StdGuardianRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly installmentRepository: BillInstallmentRepository,
    private readonly integrityRunRepository: GlIntegrityRunRepository,
    private readonly outboxWriter: OutboxWriterService,
    @InjectDataSource() private readonly dataSource: DataSource,
    // Phase 6 Slice 12 (Part A) — both new, appended at the END of the
    // constructor param list deliberately (not interleaved), to keep every
    // pre-existing positional `new WalletTransactionsService(...)` call
    // (real code AND every prior test file) valid with only an append, no
    // reordering. `domains/wallet`'s own `mayImport` list already sanctions
    // both `domains/students` (entity/service-level) and `domains/payments`
    // (service-level, `resolveClearingAccount`/`PayReceiptSplitMethod`
    // already in use) — `ReceiptsService` itself is already exported from
    // `domains/payments`' barrel and already provided/exported by
    // `PaymentsModule`, which `WalletModule` already imports, so no module
    // wiring change was needed beyond this constructor.
    private readonly studentRepository: StdStudentRepository,
    private readonly receiptsService: ReceiptsService,
  ) {}

  /** P-13 — Wallet top-up. Credits the wallet, debits the settlement-channel clearing account. */
  async topUp(em: EntityManager, input: TopUpInput, actorId: string): Promise<WallTransactionEntity> {
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }
    this.assertPositive(input.amount, "topUp");

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    this.assertCanCredit(wallet);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);
    const clearingAccount = await resolveTopUpClearingAccount(this.glAccountRepository, input.method, em);

    const txnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `P-13 wallet top-up (wallet ${wallet.id})`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: clearingAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
        { accountId: walletAccount.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: txnId },
      ],
    });

    wallet.balance = wallet.balance.add(input.amount);
    await this.walletRepository.save(wallet, em);

    return this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "TOPUP",
      amount: input.amount,
      direction: "C",
      journalId: journal.id,
      receiptId: input.receiptId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId,
    });
  }

  /** P-14 — Wallet spend at a service point. Full limit-check gauntlet (status, daily, per-txn, category-block, balance-floor). */
  async spend(em: EntityManager, input: SpendInput, actorId: string): Promise<WallTransactionEntity> {
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }
    this.assertPositive(input.amount, "spend");

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    this.assertCanDebit(wallet);

    const servicePoint = await this.servicePointRepository.findByIdOrFail(input.servicePointId, em);
    if (!servicePoint.isActive) {
      throw new ValidationException(`WalletTransactionsService.spend: service point ${servicePoint.id} is not active`);
    }

    if (wallet.dailyLimit) {
      const spentToday = await this.transactionRepository.sumSpendToday(em, wallet.id);
      if (spentToday.add(input.amount).compare(wallet.dailyLimit) > 0) {
        throw new ValidationException(
          `BR-WALL-02: wallet ${wallet.id} daily SPEND limit ${wallet.dailyLimit.toDecimalString()} would be exceeded ` +
            `(already spent ${spentToday.toDecimalString()} today, this spend adds ${input.amount.toDecimalString()})`,
        );
      }
    }

    const applicableTxnLimit = minMoneyOrNull(wallet.txnLimit, servicePoint.perTxnLimit);
    if (applicableTxnLimit && input.amount.compare(applicableTxnLimit) > 0) {
      throw new ValidationException(
        `BR-WALL-02: spend ${input.amount.toDecimalString()} exceeds the applicable per-transaction limit ${applicableTxnLimit.toDecimalString()} ` +
          `(stricter of wallet.txn_limit and service_point.per_txn_limit)`,
      );
    }

    if (wallet.categoryBlocks.includes(servicePoint.type)) {
      throw new ValidationException(
        `BR-WALL-03: wallet ${wallet.id} has blocked category ${servicePoint.type} (service point ${servicePoint.name})`,
      );
    }

    const newBalance = wallet.balance.subtract(input.amount);
    this.assertFloor(wallet, newBalance);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);

    const txnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `P-14 wallet spend at ${servicePoint.name}`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: walletAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
        {
          accountId: servicePoint.glIncomeAccountId,
          debit: Money.ZERO,
          credit: input.amount,
          entityRefType: "wall_transaction",
          entityRefId: txnId,
        },
      ],
    });
    // No COGS pair (P-14's "+COGS pair if stock item") — Module 13/Inventory
    // is not built yet, so there is no cost-of-goods-sold data source to draw
    // from. Deliberately deferred, documented gap (see PROGRESS.md).

    wallet.balance = newBalance;
    await this.walletRepository.save(wallet, em);

    return this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "SPEND",
      amount: input.amount,
      direction: "D",
      journalId: journal.id,
      servicePointId: servicePoint.id,
      items: input.items ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId,
    });
  }

  /**
   * P-15 — Wallet-to-fees transfer, applied against a `bill_invoice`.
   * Threshold-gated (FR-WALL-013.1). **Phase 6 Slice 12 (Part A)**: after
   * every pre-existing step below succeeds byte-for-byte unchanged (the
   * idempotency-replay path, threshold gate, floor checks, GL posting,
   * invoice allocation), this now ALSO records a real, wallet-funded
   * `pay_receipt` via `attachWalletFundedReceipt()` — closing the "a receipt
   * should be populated" gap this dispatch's own Context section documents.
   * Strictly additive: nothing above this comment changed.
   */
  async transferToFees(em: EntityManager, input: TransferToFeesInput, actorId: string): Promise<WallTransactionEntity> {
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }
    this.assertPositive(input.amount, "transferToFees");
    await this.assertBelowThresholdOrApproved(input.amount, input.approvalRef ?? null, "transferToFees");

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    this.assertCanDebit(wallet);

    const newBalance = wallet.balance.subtract(input.amount);
    this.assertFloor(wallet, newBalance);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);
    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);

    const txnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `P-15 wallet-to-fees transfer (invoice ${input.invoiceId})`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: walletAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
        { accountId: arStudent.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: txnId },
      ],
    });

    wallet.balance = newBalance;
    await this.walletRepository.save(wallet, em);

    await this.applyInvoiceAllocation(em, input.invoiceId, input.amount, actorId);

    const txn = await this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "FEE_TRANSFER",
      amount: input.amount,
      direction: "D",
      journalId: journal.id,
      approvalRef: input.approvalRef ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId,
    });

    await this.attachWalletFundedReceipt(em, wallet, [{ invoiceId: input.invoiceId, amount: input.amount }], txn, actorId);

    return txn;
  }

  /**
   * Phase 6 Slice 12 (Part A) — sweeps a wallet's available balance across a
   * caller-ordered list of invoices (typically the newly-generated
   * invoice(s) for one student, oldest-due-first), stopping the moment the
   * wallet is exhausted. Locks the wallet once (`requireWalletForUpdate()`,
   * same discipline every other method here uses), then loops
   * `input.invoiceIds` IN THE GIVEN ORDER, applying
   * `take = min(remainingBalance, invoice.balance)` to each (reusing the
   * same private `applyInvoiceAllocation()` `transferToFees()` itself uses —
   * skipping any invoice already at zero balance, and skipping the
   * allocation step entirely — but never the invoice load, needed either way
   * to compute a real shortfall — once the wallet has nothing left).
   *
   * Posts exactly ONE aggregated GL journal (debit `WALLET`, credit
   * `AR_STUDENT`, for the TOTAL actually swept across every invoice
   * touched — never one journal per invoice) and inserts exactly ONE
   * `wall_transaction` row (`type: 'FEE_TRANSFER'`, `direction: 'D'`,
   * `amount` = total swept) — both entirely skipped, with a clean
   * `{totalSwept: 0, ...}` result returned instead, when nothing was
   * actually swept (empty wallet, wallet already at floor, or every listed
   * invoice already fully paid) — never a degenerate empty/zero-amount
   * posting (`PostingService.post()`'s own balanced-journal invariant would
   * reject a set of all-zero lines anyway, but this is checked explicitly
   * and early, before any of the GL/journal machinery runs at all).
   *
   * Same `assertBelowThresholdOrApproved()` gate `transferToFees()` already
   * uses, applied to the AGGREGATE swept total (so a large multi-invoice
   * sweep still correctly requires approval once the total — not any single
   * invoice's share — exceeds the real threshold) — see `SweepToInvoicesInput
   * .approvalRef`'s own doc comment for why this parameter exists despite
   * not appearing in the task brief's own literal signature.
   *
   * `remainingBalance` starts at `wallet.balance + wallet.overdraftLimit`
   * (the wallet's real total spendable capacity, mirroring
   * `assertFloor()`'s own `newBalance >= -overdraftLimit` invariant every
   * other debit path here enforces) — NOT `wallet.balance` alone, which
   * would incorrectly refuse to use an overdraft-enabled wallet's real
   * remaining capacity. `assertFloor()` is still called once, defensively,
   * against the final aggregate debit before saving — by construction it can
   * never actually trip (the loop never lets `remainingBalance` go
   * negative), the same "defense-in-depth, not the primary mechanism" role
   * it plays in every sibling method here.
   *
   * A real, deliberate safety check with NO precedent in `transferToFees()`
   * (which trusts its single caller-given `invoiceId` unchecked): each
   * invoice's own `studentId` is verified to match `wallet.studentId` before
   * any allocation is applied — a caller bug threading the wrong invoice id
   * into a multi-invoice list must never debit one student's wallet into a
   * DIFFERENT student's invoice.
   *
   * After successfully sweeping something, calls
   * `attachWalletFundedReceipt()` (shared with `transferToFees()`) with the
   * real per-invoice breakdown, which both creates the `pay_receipt` (via
   * `ReceiptsService.recordWalletFundedReceipt()`) and cross-references the
   * new `wall_transaction.receipt_id`.
   */
  async sweepToInvoices(em: EntityManager, input: SweepToInvoicesInput, actorId: string): Promise<SweepToInvoicesResult> {
    if (input.invoiceIds.length === 0) {
      throw new ValidationException("WalletTransactionsService.sweepToInvoices: invoiceIds must not be empty");
    }

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    this.assertCanDebit(wallet);

    const availableBalance = wallet.balance.add(wallet.overdraftLimit);
    let remaining = availableBalance.isPositive() ? availableBalance : Money.ZERO;

    const allocations: SweepToInvoicesAllocationResult[] = [];
    const shortfall: SweepToInvoicesShortfallResult[] = [];

    for (const invoiceId of input.invoiceIds) {
      const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
      if (invoice.studentId !== wallet.studentId) {
        throw new ValidationException(
          `WalletTransactionsService.sweepToInvoices: invoice ${invoiceId} belongs to a different student than wallet ${wallet.id} (student ${wallet.studentId})`,
        );
      }
      if (!invoice.balance.isPositive()) continue; // already fully paid/void — nothing for this sweep to do

      // Captured BEFORE applyInvoiceAllocation() runs — that private helper
      // mutates `invoice.balance` in place (the same entity instance this
      // loop iteration holds), so computing `stillOwed` from `invoice.balance`
      // AFTER calling it would silently read the already-decremented value
      // instead of the pre-sweep one. A real bug caught live by this
      // method's own Jest spec before it ever shipped.
      const balanceBeforeSweep = invoice.balance;
      const take = remaining.isPositive() ? minMoney(remaining, balanceBeforeSweep) : Money.ZERO;
      if (take.isPositive()) {
        await this.applyInvoiceAllocation(em, invoiceId, take, actorId);
        remaining = remaining.subtract(take);
        allocations.push({ invoiceId, amount: take });
      }

      const stillOwed = balanceBeforeSweep.subtract(take);
      if (stillOwed.isPositive()) {
        shortfall.push({ invoiceId, remainingBalance: stillOwed });
      }
    }

    const totalSwept = allocations.reduce((sum, alloc) => sum.add(alloc.amount), Money.ZERO);

    if (!totalSwept.isPositive()) {
      return { totalSwept: Money.ZERO, allocations: [], receiptId: null, transactionId: null, shortfall };
    }

    await this.assertBelowThresholdOrApproved(totalSwept, input.approvalRef ?? null, "sweepToInvoices");

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);
    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);

    const txnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `P-15 wallet-to-fees sweep across ${allocations.length} invoice(s)`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: walletAccount.id, debit: totalSwept, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
        { accountId: arStudent.id, debit: Money.ZERO, credit: totalSwept, entityRefType: "wall_transaction", entityRefId: txnId },
      ],
    });

    const newBalance = wallet.balance.subtract(totalSwept);
    this.assertFloor(wallet, newBalance); // defense-in-depth — see class doc comment; never actually trips by construction
    wallet.balance = newBalance;
    await this.walletRepository.save(wallet, em);

    const txn = await this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "FEE_TRANSFER",
      amount: totalSwept,
      direction: "D",
      journalId: journal.id,
      approvalRef: input.approvalRef ?? null,
      actorId,
    });

    const receipt = await this.attachWalletFundedReceipt(em, wallet, allocations, txn, actorId);

    return { totalSwept, allocations, receiptId: receipt.id, transactionId: txn.id, shortfall };
  }

  /**
   * P-17 — Wallet-to-wallet transfer. **Lock ordering**: both wallets are
   * locked in ascending-`id`-string order (never call-argument order) — a
   * real correctness detail, since two concurrent transfers moving money in
   * opposite directions between the same pair of wallets (A->B and B->A)
   * would otherwise each hold one lock and block waiting for the other,
   * deadlocking. Locking by a total order that doesn't depend on which side
   * is "from"/"to" guarantees every caller acquires the pair in the same
   * sequence. Same control account both sides (`P-17`'s "same control
   * account both sides, journal balances trivially") — one journal, two
   * lines against the identical `WALLET` control account, still two separate
   * `wall_transaction` rows (`TRANSFER_OUT`/`TRANSFER_IN`) cross-referencing
   * each other via `counterparty_wallet_id`.
   */
  async transferToWallet(em: EntityManager, input: TransferToWalletInput, actorId: string): Promise<TransferToWalletResult> {
    if (input.fromWalletId === input.toWalletId) {
      throw new ValidationException("WalletTransactionsService.transferToWallet: fromWalletId and toWalletId must differ");
    }
    if (input.idempotencyKey) {
      const existingOut = await this.transactionRepository.findByIdempotencyKey(outKey(input.idempotencyKey), em);
      if (existingOut) {
        const legs = await this.transactionRepository.listByJournalId(existingOut.journalId, em);
        const inTransaction = legs.find((l) => l.type === "TRANSFER_IN");
        if (inTransaction) return { outTransaction: existingOut, inTransaction };
      }
    }
    this.assertPositive(input.amount, "transferToWallet");
    await this.assertBelowThresholdOrApproved(input.amount, input.approvalRef ?? null, "transferToWallet");

    const [firstId, secondId] = [input.fromWalletId, input.toWalletId].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const firstWallet = await this.requireWalletForUpdate(em, firstId);
    const secondWallet = await this.requireWalletForUpdate(em, secondId);
    const fromWallet = firstWallet.id === input.fromWalletId ? firstWallet : secondWallet;
    const toWallet = firstWallet.id === input.toWalletId ? firstWallet : secondWallet;

    this.assertCanDebit(fromWallet);
    this.assertCanCredit(toWallet);

    const newFromBalance = fromWallet.balance.subtract(input.amount);
    this.assertFloor(fromWallet, newFromBalance);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);

    const outTxnId = generateUuidV7();
    const inTxnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: outTxnId,
      narration: `P-17 wallet-to-wallet transfer (${fromWallet.id} -> ${toWallet.id})`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: walletAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: outTxnId },
        { accountId: walletAccount.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: inTxnId },
      ],
    });

    fromWallet.balance = newFromBalance;
    toWallet.balance = toWallet.balance.add(input.amount);
    await this.walletRepository.save(fromWallet, em);
    await this.walletRepository.save(toWallet, em);

    const at = new Date();
    const outTransaction = await this.insertTransaction(em, {
      id: outTxnId,
      wallet: fromWallet,
      type: "TRANSFER_OUT",
      amount: input.amount,
      direction: "D",
      journalId: journal.id,
      counterpartyWalletId: toWallet.id,
      approvalRef: input.approvalRef ?? null,
      idempotencyKey: input.idempotencyKey ? outKey(input.idempotencyKey) : null,
      actorId,
      at,
    });
    const inTransaction = await this.insertTransaction(em, {
      id: inTxnId,
      wallet: toWallet,
      type: "TRANSFER_IN",
      amount: input.amount,
      direction: "C",
      journalId: journal.id,
      counterpartyWalletId: fromWallet.id,
      approvalRef: input.approvalRef ?? null,
      idempotencyKey: input.idempotencyKey ? inKey(input.idempotencyKey) : null,
      actorId,
      at,
    });

    return { outTransaction, inTransaction };
  }

  /** P-16 — Wallet refund. ALWAYS requires a pre-approved `WALLET_REFUND` instance (FR-WALL-013.1) and a verified payout target (BR-WALL-06). */
  async refund(em: EntityManager, input: RefundInput, actorId: string): Promise<WallTransactionEntity> {
    if (!input.approvalRef) {
      throw new ValidationException("FR-WALL-013.1: every wallet refund requires a pre-approved WALLET_REFUND approvalRef");
    }
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }
    this.assertPositive(input.amount, "refund");
    await this.assertPayoutTargetVerified(em, input.payoutTarget, input.payoutMethod);

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    this.assertCanDebit(wallet);

    const newBalance = wallet.balance.subtract(input.amount);
    this.assertFloor(wallet, newBalance);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);
    const payoutAccount = await resolveRefundPayoutAccount(this.glAccountRepository, input.payoutMethod, em);

    const txnId = generateUuidV7();
    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `P-16 wallet refund (guardian ${input.payoutTarget.guardianId}, ${input.payoutMethod})`,
      journalType: "MANUAL",
      postedBy: actorId,
      lines: [
        { accountId: walletAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
        { accountId: payoutAccount.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: txnId },
      ],
    });

    wallet.balance = newBalance;
    await this.walletRepository.save(wallet, em);

    return this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "REFUND",
      amount: input.amount,
      direction: "D",
      journalId: journal.id,
      approvalRef: input.approvalRef,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId,
    });
  }

  /** BR-WALL-05 — a manual balance correction. ALWAYS pre-approved (`approvalRef` is a required, non-null parameter). */
  async adjust(em: EntityManager, input: AdjustInput, actorId: string, approvalRef: string): Promise<WallTransactionEntity> {
    if (!approvalRef) {
      throw new ValidationException("BR-WALL-05: every wallet adjustment requires a pre-approved WALLET_ADJUSTMENT approvalRef");
    }
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey, em);
      if (existing) return existing;
    }
    this.assertPositive(input.amount, "adjust");

    const wallet = await this.requireWalletForUpdate(em, input.walletId);
    if (input.direction === "D") {
      this.assertCanDebit(wallet);
    } else {
      this.assertCanCredit(wallet);
    }

    const newBalance = input.direction === "D" ? wallet.balance.subtract(input.amount) : wallet.balance.add(input.amount);
    if (input.direction === "D") this.assertFloor(wallet, newBalance);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository, em);
    const contraAccount = await this.resolveAdjustmentContraAccount(em);

    const txnId = generateUuidV7();
    const lines =
      input.direction === "D"
        ? [
            { accountId: walletAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
            { accountId: contraAccount.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: txnId },
          ]
        : [
            { accountId: contraAccount.id, debit: input.amount, credit: Money.ZERO, entityRefType: "wall_transaction", entityRefId: txnId },
            { accountId: walletAccount.id, debit: Money.ZERO, credit: input.amount, entityRefType: "wall_transaction", entityRefId: txnId },
          ];

    const journal = await this.postingService.post(em, {
      journalDate: todayIso(),
      sourceModule: "wallet",
      sourceDocType: "wall_transaction",
      sourceDocId: txnId,
      narration: `BR-WALL-05 wallet adjustment (${input.reasonCode})`,
      journalType: "MANUAL",
      postedBy: actorId,
      approvalRef,
      lines,
    });

    wallet.balance = newBalance;
    await this.walletRepository.save(wallet, em);

    return this.insertTransaction(em, {
      id: txnId,
      wallet,
      type: "ADJUSTMENT",
      amount: input.amount,
      direction: input.direction,
      journalId: journal.id,
      approvalRef,
      reasonCode: input.reasonCode,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId,
    });
  }

  /** BR-WALL-07 — zeroes the balance via the chosen disposition, then flips `status='CLOSED'` (the DB trigger enforces `balance=0` as final defense-in-depth). Idempotent: a no-op on an already-CLOSED wallet. */
  async closeWallet(em: EntityManager, input: CloseWalletInput, actorId: string): Promise<WallWalletEntity> {
    let wallet = await this.requireWalletForUpdate(em, input.walletId);
    if (wallet.status === "CLOSED") return wallet;

    if (!wallet.balance.isZero()) {
      if (wallet.balance.isNegative()) {
        throw new ValidationException(
          `WalletTransactionsService.closeWallet: wallet ${wallet.id} carries a negative balance ` +
            `(${wallet.balance.toDecimalString()}, an overdraft) — no disposition can inject funds; settle it via adjust() first`,
        );
      }
      const amount = wallet.balance;
      switch (input.disposition) {
        case "REFUND": {
          if (!input.refund) {
            throw new ValidationException("closeWallet: disposition=REFUND requires refund (payoutMethod/payoutTarget/approvalRef)");
          }
          await this.refund(
            em,
            {
              walletId: wallet.id,
              amount,
              payoutMethod: input.refund.payoutMethod,
              payoutTarget: input.refund.payoutTarget,
              approvalRef: input.refund.approvalRef,
            },
            actorId,
          );
          break;
        }
        case "TRANSFER_TO_SIBLING": {
          if (!input.transferToSiblingWalletId) {
            throw new ValidationException("closeWallet: disposition=TRANSFER_TO_SIBLING requires transferToSiblingWalletId");
          }
          await this.transferToWallet(
            em,
            { fromWalletId: wallet.id, toWalletId: input.transferToSiblingWalletId, amount, approvalRef: input.approvalRef ?? null },
            actorId,
          );
          break;
        }
        case "APPLY_TO_FEES": {
          if (!input.applyToFeesInvoiceId) {
            throw new ValidationException("closeWallet: disposition=APPLY_TO_FEES requires applyToFeesInvoiceId");
          }
          await this.transferToFees(
            em,
            { walletId: wallet.id, amount, invoiceId: input.applyToFeesInvoiceId, approvalRef: input.approvalRef ?? null },
            actorId,
          );
          break;
        }
        /* istanbul ignore next -- exhaustive over CloseWalletDisposition, unreachable at the type level */
        default: {
          const exhaustive: never = input.disposition;
          throw new ValidationException(`closeWallet: unknown disposition ${String(exhaustive)}`);
        }
      }
      // Re-fetch — the disposition call above already re-acquired (and
      // released, on commit-pending same-transaction terms) the row lock and
      // mutated `balance`; reading it fresh here avoids working off our
      // stale in-memory copy from before the disposition ran.
      wallet = await this.requireWalletForUpdate(em, input.walletId);
    }

    const fromStatus = wallet.status;
    wallet.status = "CLOSED";
    wallet.statusReason = input.reason ?? `Closed via ${input.disposition} disposition`;
    wallet.updatedBy = actorId;
    const saved = await this.walletRepository.save(wallet, em);

    await this.outboxWriter.write(
      em,
      new WalletStatusChangedEvent(saved.id, {
        walletId: saved.id,
        studentId: saved.studentId,
        fromStatus,
        toStatus: "CLOSED",
        reason: saved.statusReason,
        actorId,
      }),
    );

    return saved;
  }

  /**
   * BR-WALL-08/FR-WALL-012.1 — sums `wall_wallet.balance` across every
   * wallet and compares it against the `WALLET` control account's balance,
   * re-derived directly from `SUM(gl_journal_line.credit - debit)` (the same
   * "re-derive from `gl_journal_line`, don't trust the cache" query style
   * `IntegritySweepService.runSweep()` uses for its own NFR-INT-002 check).
   * Persists the outcome as a `gl_integrity_run` row (`kind='WALLET_RECONCILE'`)
   * — reuses `accounting`'s existing sweep-log table rather than minting a
   * dedicated wallet-only one, since it is already a generic
   * "one completed sweep result" log.
   *
   * **Deferred, honestly**: automatic hourly triggering (no
   * scheduler/worker/cron exists anywhere in this codebase — same
   * "detection logic exists, dispatcher doesn't" pattern as every other
   * module's un-dispatched background job) and "block manual adjustments
   * until the variance is resolved" (would need a settable system-wide flag
   * `adjust()` could check — no such flag mechanism exists yet) are both NOT
   * implemented; this method only detects and records the variance.
   */
  async reconcile(): Promise<GlIntegrityRunEntity> {
    const wallets = await this.walletRepository.listAll();
    const walletTotal = wallets.reduce((sum, w) => sum.add(w.balance), Money.ZERO);

    const walletAccount = await resolveWalletControlAccount(this.glAccountRepository);
    const rows: { balance: string | null }[] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance
      FROM app.gl_journal_line jl
      WHERE jl.account_id = $1
      `,
      [walletAccount.id],
    );
    const glControlBalance = Money.fromDecimalString(rows[0]?.balance ?? "0");
    const variance = walletTotal.subtract(glControlBalance);

    return this.integrityRunRepository.create({
      ranAt: new Date(),
      kind: WALLET_RECONCILE_KIND,
      ok: variance.isZero(),
      findings: {
        walletCount: wallets.length,
        walletTotal: walletTotal.toDecimalString(),
        glControlBalance: glControlBalance.toDecimalString(),
        variance: variance.toDecimalString(),
      },
    });
  }

  async lastReconciliation(): Promise<GlIntegrityRunEntity | null> {
    return this.integrityRunRepository.findLatest(WALLET_RECONCILE_KIND);
  }

  // ---- helpers ----------------------------------------------------------

  private async requireWalletForUpdate(em: EntityManager, walletId: string): Promise<WallWalletEntity> {
    const wallet = await this.walletRepository.findByIdForUpdate(em, walletId);
    if (!wallet) throw new NotFoundException("WallWallet", walletId);
    return wallet;
  }

  private assertPositive(amount: Money, action: string): void {
    if (!amount.isPositive()) {
      throw new ValidationException(`WalletTransactionsService.${action}: amount must be positive`);
    }
  }

  /** BR-WALL-03: LOCKED blocks debits only, FROZEN/CLOSED block everything. */
  private assertCanDebit(wallet: WallWalletEntity): void {
    if (wallet.status !== "ACTIVE") {
      throw new ValidationException(
        `BR-WALL-03: wallet ${wallet.id} status=${wallet.status} — debits require ACTIVE (LOCKED blocks debits, FROZEN/CLOSED block everything)`,
      );
    }
  }

  /** BR-WALL-03: FROZEN/CLOSED block everything; ACTIVE and LOCKED both still accept credits. */
  private assertCanCredit(wallet: WallWalletEntity): void {
    if (wallet.status === "FROZEN" || wallet.status === "CLOSED") {
      throw new ValidationException(
        `BR-WALL-03: wallet ${wallet.id} status=${wallet.status} — credits are blocked (FROZEN blocks everything, CLOSED is terminal)`,
      );
    }
  }

  /** BR-WALL-01 floor, defense-in-depth mirroring `ck_wall_wallet_balance_floor`. */
  private assertFloor(wallet: WallWalletEntity, newBalance: Money): void {
    if (newBalance.compare(wallet.overdraftLimit.negate()) < 0) {
      throw new ValidationException(
        `BR-WALL-01: wallet ${wallet.id} balance floor violated — resulting balance ${newBalance.toDecimalString()} ` +
          `would be below -overdraft_limit (${wallet.overdraftLimit.negate().toDecimalString()})`,
      );
    }
  }

  private async assertBelowThresholdOrApproved(amount: Money, approvalRef: string | null, action: string): Promise<void> {
    const threshold = await this.readTransferThreshold();
    if (amount.compare(threshold) > 0 && !approvalRef) {
      throw new ValidationException(
        `FR-WALL-013.1: WalletTransactionsService.${action}: amount ${amount.toDecimalString()} exceeds the ` +
          `KES ${threshold.toDecimalString()} approval threshold — submit via the WALLET_TRANSFER approval workflow first`,
      );
    }
  }

  private async readTransferThreshold(): Promise<Money> {
    const raw = await this.settingsService.getTyped<string | null>(WALLET_TRANSFER_APPROVAL_THRESHOLD_SETTING_KEY, null);
    return raw ? Money.fromDecimalString(raw) : DEFAULT_TRANSFER_APPROVAL_THRESHOLD;
  }

  /** BR-WALL-06 — see `RefundPayoutTarget`'s doc comment for the `payout_verified` shape judgement call. */
  private async assertPayoutTargetVerified(em: EntityManager, target: RefundPayoutTarget, method: WallRefundPayoutMethod): Promise<void> {
    const guardian = await this.guardianRepository.findByIdOrFail(target.guardianId, em);
    const verified = guardian.payoutVerified as Record<string, unknown> | null;
    if (!verified || !verified[method]) {
      throw new ValidationException(
        `BR-WALL-06: guardian ${target.guardianId} has no verified payout target for method ${method} ` +
          `(std_guardian.payout_verified) — refund rejected`,
      );
    }
  }

  /**
   * BR-WALL-05's "Wallet Adjustment" contra account — this module's own
   * judgement call (task brief: "resolve/seed one — your call on the exact
   * account, document it"). Resolved by `gl_account.code = '5090'` ("Wallet
   * Adjustment Contra", EXPENSE class), seeded by the `0900` migration's
   * `COA_TEMPLATE` extension — modeled the same way
   * `ChequesService.bounce()`'s bounce-fee category resolves against an
   * already-seeded leaf, rather than a `control_domain` lookup (a
   * write-off/correction contra account is not one of the DDL's nine
   * `control_domain` values, so `resolveControlAccount()` doesn't apply
   * here).
   */
  private async resolveAdjustmentContraAccount(em: EntityManager) {
    const account = await this.glAccountRepository.findByCode(WALLET_ADJUSTMENT_CONTRA_ACCOUNT_CODE, em);
    if (!account) {
      throw new NotFoundException("GlAccount(code)", `${WALLET_ADJUSTMENT_CONTRA_ACCOUNT_CODE} — Wallet Adjustment Contra, seed the Chart of Accounts`);
    }
    return account;
  }

  /**
   * Small local equivalent of `ReceiptsService`'s private `applyInvoiceAllocation()`
   * — see class doc comment "applyInvoiceAllocation() reuse note".
   */
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
      const take = capacity.compare(remaining) <= 0 ? capacity : remaining;
      installment.settledAmount = installment.settledAmount.add(take);
      installment.updatedBy = actorId;
      await this.installmentRepository.save(installment, em);
      remaining = remaining.subtract(take);
    }
  }

  /**
   * Phase 6 Slice 12 (Part A) — shared tail for `transferToFees()`/
   * `sweepToInvoices()`, called only AFTER their own GL posting +
   * `bill_invoice`/`bill_installment` application + `wall_transaction`
   * insert have all already succeeded. Calls
   * `ReceiptsService.recordWalletFundedReceipt()` (a real cross-module
   * service call — `domains/wallet` -> `domains/payments`, both directions
   * sanctioned in `module-deps.json`, confirmed before writing this) to
   * leave a genuine `pay_receipt`/`pay_receipt_split`/`pay_receipt_allocation`
   * audit trail for money that already moved via THIS caller's own journal
   * (`recordWalletFundedReceipt()` itself posts nothing — no second
   * posting), then cross-references the just-inserted `wall_transaction`
   * row back to the new receipt via `WallTransactionRepository
   * .updateReceiptId()` (the `receipt_id` FK was always `null` here before
   * this pass). Mutates `txn.receiptId` in place afterward so the entity the
   * CALLER already returns to its own caller reflects the real, just-set
   * value — `insertTransaction()` necessarily ran before the receipt could
   * exist, so the in-memory object it returned still shows `receiptId: null`
   * without this.
   */
  private async attachWalletFundedReceipt(
    em: EntityManager,
    wallet: WallWalletEntity,
    allocations: { invoiceId: string; amount: Money }[],
    txn: WallTransactionEntity,
    actorId: string,
  ): Promise<PayReceiptEntity> {
    const student = await this.studentRepository.findByIdOrFail(wallet.studentId, em);
    const receipt = await this.receiptsService.recordWalletFundedReceipt(em, {
      studentId: wallet.studentId,
      payerName: `${student.firstName} ${student.lastName}`,
      receiptDate: todayIso(),
      allocations,
      cashierId: actorId,
      walletTransactionId: txn.id,
    });
    await this.transactionRepository.updateReceiptId(txn.id, receipt.id, em);
    txn.receiptId = receipt.id;
    return receipt;
  }

  private async insertTransaction(
    em: EntityManager,
    args: {
      id: string;
      wallet: WallWalletEntity;
      type: WallTransactionType;
      amount: Money;
      direction: WallTransactionDirection;
      journalId: string;
      servicePointId?: string | null;
      items?: Record<string, unknown> | null;
      counterpartyWalletId?: string | null;
      receiptId?: string | null;
      approvalRef?: string | null;
      reasonCode?: string | null;
      idempotencyKey?: string | null;
      actorId: string;
      at?: Date;
    },
  ): Promise<WallTransactionEntity> {
    const txn = await this.transactionRepository.create(
      {
        id: args.id,
        walletId: args.wallet.id,
        type: args.type,
        amount: args.amount,
        direction: args.direction,
        balanceAfter: args.wallet.balance,
        servicePointId: args.servicePointId ?? null,
        items: args.items ?? null,
        counterpartyWalletId: args.counterpartyWalletId ?? null,
        receiptId: args.receiptId ?? null,
        journalId: args.journalId,
        approvalRef: args.approvalRef ?? null,
        reasonCode: args.reasonCode ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        actorId: args.actorId,
        at: args.at ?? new Date(),
        createdBy: args.actorId,
        updatedBy: args.actorId,
      },
      em,
    );

    await this.outboxWriter.write(
      em,
      new WalletTransactionPostedEvent(txn.id, {
        walletId: txn.walletId,
        transactionId: txn.id,
        type: txn.type,
        direction: txn.direction,
        amount: txn.amount.toDecimalString(),
        balanceAfter: txn.balanceAfter.toDecimalString(),
        journalId: txn.journalId,
        actorId: args.actorId,
      }),
    );

    return txn;
  }
}

/** `2030`/`WALLET` is the liability control account; `5090` is this module's own choice of contra account for BR-WALL-05 adjustments — see `resolveAdjustmentContraAccount()`'s doc comment. */
const WALLET_ADJUSTMENT_CONTRA_ACCOUNT_CODE = "5090";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function minMoneyOrNull(a: Money | null, b: Money | null): Money | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.compare(b) <= 0 ? a : b;
}

/** Phase 6 Slice 12 (Part A) — `sweepToInvoices()`'s own `take = min(remainingBalance, invoice.balance)` helper (mirrors `ReceiptsService`'s identically-named private helper of the same shape). */
function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}

function outKey(idempotencyKey: string): string {
  return `${idempotencyKey}:out`;
}

function inKey(idempotencyKey: string): string {
  return `${idempotencyKey}:in`;
}
