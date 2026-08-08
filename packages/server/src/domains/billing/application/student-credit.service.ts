import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillStudentCreditEntryRepository } from "../infrastructure/bill-student-credit-entry.repository";
import { BillStudentCreditRepository } from "../infrastructure/bill-student-credit.repository";
import { BillStudentCreditEntity } from "../domain/bill-student-credit.entity";
import { BillStudentCreditEntryEntity } from "../domain/bill-student-credit-entry.entity";

export interface IssueStudentCreditInput {
  /** The `pay_receipt` whose overpayment produced this credit — always a real, already-inserted receipt id (see `ReceiptsService.captureReceipt()`'s own call site). */
  receiptId: string;
  actorId: string;
}

export interface ConsumeStudentCreditInput {
  /** Set only when this consumption ties to exactly one invoice — `applyStudentCreditToInvoices()`'s own aggregate (possibly multi-invoice) consumption leaves this `null`, mirroring `wall_transaction`'s "one row per aggregate operation" shape. */
  invoiceId?: string | null;
  receiptId?: string | null;
  actorId: string;
}

export interface NetOutIssuedCreditInput {
  /** The ORIGINAL receipt being reversed (already exists in the DB by the time `reverseReceipt()` calls this — no ordering/FK problem, unlike the not-yet-inserted contra receipt would be). */
  receiptId: string;
  actorId: string;
}

/**
 * Phase 6 Slice 12 (Part D — Credit Balance Forward). THE owner of
 * `bill_student_credit`/`bill_student_credit_entry` (docs/phase-1/SRS.md
 * `FR-PAY-004`; the `P-10` posting-map row in
 * docs/phase-2/01-functional-requirements.md). Mirrors
 * `WalletTransactionsService`'s own design discipline closely (the plan's
 * explicit instruction — "follow the wallet module's own established
 * patterns closely, it is the direct precedent for everything here"): every
 * method takes the CALLER's own `EntityManager` (composable, no
 * `runInTransaction` of its own — `ReceiptsService`'s methods call these
 * inside their own already-open transaction) and does its own row-locking
 * via `BillStudentCreditRepository.findByStudentIdForUpdate()`, the exact
 * `WallWalletRepository.findByIdForUpdate()` pessimistic-lock pattern.
 *
 * **Every WRITE here is driven from `domains/payments`' `ReceiptsService`**
 * (`issue()` from `captureReceipt()`'s overpayment step, `consume()` from
 * `applyStudentCreditToInvoices()`, `netOutIssuedCredit()` from
 * `reverseReceipt()`'s reversal-safety guard) — `domains/billing` owns the
 * table (matches the `bill_` prefix and FR-PAY-004's purpose), but has no
 * reason to write to it on its own initiative; nothing in `domains/billing`
 * itself ever produces an overpayment or reverses a receipt.
 *
 * **Lazy provisioning, same "check-then-create, no retry-on-conflict"
 * precedent `WalletsService.getOrCreateWallet()` already establishes**: the
 * first `issue()` for a student creates their `bill_student_credit` row on
 * the spot (balance starts at 0, then immediately incremented) — no
 * separate "provision a credit account" step exists or is needed, unlike
 * Wallet's opt-in `POST /wallets/students/:id`. A theoretical race between
 * two concurrent first-ever `issue()` calls for the same brand-new student
 * is accepted, unhandled, the same documented gap `getOrCreateWallet()`
 * already carries — not introduced fresh here.
 */
@Injectable()
export class StudentCreditService {
  constructor(
    private readonly creditRepository: BillStudentCreditRepository,
    private readonly entryRepository: BillStudentCreditEntryRepository,
  ) {}

  /** Plain find-or-create, UNLOCKED — a small, independently-useful public-surface addition (same "kept even though not every caller needs it yet" precedent `UsersService.hasRole()` documents in `module-deps.json`), not used internally by `issue()`/`consume()` (both need a LOCKED read-or-create, see their own bodies). */
  async getOrCreate(em: EntityManager, studentId: string): Promise<BillStudentCreditEntity> {
    const existing = await this.creditRepository.findByStudentId(studentId, em);
    if (existing) return existing;
    return this.creditRepository.create({ studentId, balance: Money.ZERO }, em);
  }

  /**
   * Pure, UNLOCKED balance read — Part E's student-detail "Credit Balance"
   * card. Deliberately does NOT provision a row for a student who has never
   * had any credit (`Money.ZERO` instead) — a read should never have a
   * write side effect, unlike `issue()`'s legitimate lazy-provision-on-first-use.
   */
  async getBalance(studentId: string, em?: EntityManager): Promise<Money> {
    const row = await this.creditRepository.findByStudentId(studentId, em);
    return row ? row.balance : Money.ZERO;
  }

  /**
   * LOCKED balance read — `ReceiptsService.applyStudentCreditToInvoices()`'s
   * own driving mechanism, the direct analog of `sweepToInvoices()`'s
   * `wallet.balance + wallet.overdraftLimit` starting point: it needs to
   * know the real, held-for-the-rest-of-this-transaction available balance
   * BEFORE looping across the caller-given invoices (to compute
   * `take = min(remaining, invoice.balance)` per invoice), and only calls
   * `consume()` once, at the end, for the real aggregate total actually
   * applied. Takes no lock (nothing to lock) when the student has no
   * `bill_student_credit` row at all yet — correctly returns `Money.ZERO`,
   * never provisions a row for a student with nothing to sweep.
   */
  async getBalanceForUpdate(em: EntityManager, studentId: string): Promise<Money> {
    const row = await this.creditRepository.findByStudentIdForUpdate(em, studentId);
    return row ? row.balance : Money.ZERO;
  }

  /**
   * Row-locks (creating the row first, at balance 0, if this is the
   * student's very first credit activity of any kind), increments
   * `balance`, inserts an `ISSUE` entry referencing the overpaying receipt.
   * Called by `ReceiptsService.captureReceipt()` only when its resolved
   * `prepaymentTotal.isPositive()` — i.e. only for money with genuinely no
   * open invoice anywhere for this student to apply to (BR-PAY-02/03's
   * existing FIFO allocation already sweeps a receipt across EVERY one of
   * the student's open invoices before any remainder ever reaches
   * `toPrepayment` — confirmed by reading `AllocationService
   * .resolveAllocations()` before writing this pass, not assumed — so this
   * path is exactly and only the "no other invoice to collect from" case
   * the user's own request describes).
   */
  async issue(em: EntityManager, studentId: string, amount: Money, input: IssueStudentCreditInput): Promise<BillStudentCreditEntryEntity> {
    this.assertPositive(amount, "issue");

    let row = await this.creditRepository.findByStudentIdForUpdate(em, studentId);
    if (!row) {
      row = await this.creditRepository.create(
        { studentId, balance: Money.ZERO, createdBy: input.actorId, updatedBy: input.actorId },
        em,
      );
    }
    row.balance = row.balance.add(amount);
    row.updatedBy = input.actorId;
    await this.creditRepository.save(row, em);

    return this.entryRepository.create(
      {
        studentId,
        type: "ISSUE",
        amount,
        balanceAfter: row.balance,
        receiptId: input.receiptId,
        invoiceId: null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      em,
    );
  }

  /**
   * Row-locks, DEFENSE-IN-DEPTH re-checks `balance >= amount` (even though
   * `ReceiptsService.applyStudentCreditToInvoices()` should only ever
   * request an already-bounded amount — the caller derives `amount` FROM
   * this same locked balance in the first place, so this should never
   * actually trip by construction, the same "defense-in-depth, not the
   * primary mechanism" role `WalletTransactionsService.assertFloor()` plays
   * throughout that module), decrements, logs a `CONSUME` entry. Throws
   * `ValidationException` (never silently clamps) if the balance is
   * genuinely insufficient — `ck_bill_student_credit_balance_nonneg` backs
   * this at the DB layer regardless.
   */
  async consume(em: EntityManager, studentId: string, amount: Money, input: ConsumeStudentCreditInput): Promise<BillStudentCreditEntryEntity> {
    this.assertPositive(amount, "consume");

    const row = await this.creditRepository.findByStudentIdForUpdate(em, studentId);
    const available = row ? row.balance : Money.ZERO;
    if (available.compare(amount) < 0) {
      throw new ValidationException(
        `StudentCreditService.consume: student ${studentId} credit balance ${available.toDecimalString()} ` +
          `is insufficient to consume ${amount.toDecimalString()}`,
      );
    }

    row!.balance = row!.balance.subtract(amount);
    row!.updatedBy = input.actorId;
    await this.creditRepository.save(row!, em);

    return this.entryRepository.create(
      {
        studentId,
        type: "CONSUME",
        amount,
        balanceAfter: row!.balance,
        receiptId: input.receiptId ?? null,
        invoiceId: input.invoiceId ?? null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      em,
    );
  }

  /**
   * `ReceiptsService.reverseReceipt()`'s reversal-safety guard for an
   * ORDINARY (e.g. CASH) receipt that happened to produce a `toPrepayment`
   * allocation (an overpayment) when it was captured — its own split method
   * is not `WALLET`/`CREDIT_BALANCE`, so it is NOT blocked by
   * `NON_REVERSIBLE_RECEIPT_SPLIT_METHODS`, but reversing it must also net
   * back out the credit it issued as a side effect, or the credit balance
   * would silently desync from the ledger (the exact class of risk Part A's
   * `NON_REVERSIBLE_RECEIPT_SPLIT_METHODS` guard exists to prevent for the
   * WALLET/CREDIT_BALANCE-funded case — this is the ordinary-receipt analog
   * of that same risk).
   *
   * **The exact guard algorithm (per the plan's own specification)**: locks
   * the student's row, checks `balance >= amount`; if true, decrements and
   * logs a `CONSUME` entry referencing the ORIGINAL (being-reversed) receipt
   * — not the not-yet-inserted contra receipt, which would violate
   * `fk_bill_student_credit_entry_receipt_id` if referenced before its own
   * `pay_receipt` row exists (foreign keys in this codebase are checked at
   * statement time, never deferred — no precedent for a deferrable FK
   * constraint exists anywhere in this codebase, only deferrable
   * CONSTRAINT TRIGGERs like `trg_pay_splits_sum`, confirmed before choosing
   * this design); if false — some of the credit was already spent via
   * `ReceiptsService.applyStudentCreditToInvoices()`'s own `consume()` call
   * elsewhere — throws the exact specified `ValidationException` message,
   * unchanged, so the caller (`reverseReceipt()`) can call this FIRST,
   * before any other mutation, and a thrown exception here leaves nothing
   * partially done.
   */
  async netOutIssuedCredit(
    em: EntityManager,
    studentId: string,
    amount: Money,
    input: NetOutIssuedCreditInput,
  ): Promise<BillStudentCreditEntryEntity> {
    this.assertPositive(amount, "netOutIssuedCredit");

    const row = await this.creditRepository.findByStudentIdForUpdate(em, studentId);
    const available = row ? row.balance : Money.ZERO;
    if (available.compare(amount) < 0) {
      throw new ValidationException(
        `Cannot reverse this receipt — KES ${amount.toDecimalString()} of the credit balance it created has already ` +
          "been applied to other invoices. Contact an administrator for a manual correction.",
      );
    }

    row!.balance = row!.balance.subtract(amount);
    row!.updatedBy = input.actorId;
    await this.creditRepository.save(row!, em);

    return this.entryRepository.create(
      {
        studentId,
        type: "CONSUME",
        amount,
        balanceAfter: row!.balance,
        receiptId: input.receiptId,
        invoiceId: null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      em,
    );
  }

  private assertPositive(amount: Money, action: string): void {
    if (!amount.isPositive()) {
      throw new ValidationException(`StudentCreditService.${action}: amount must be positive`);
    }
  }
}
