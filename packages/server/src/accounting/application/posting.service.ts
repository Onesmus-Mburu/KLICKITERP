import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { NumberingService } from "../../platform/settings";
import { generateUuidV7 } from "../../shared/ids/uuid7";
import { Money } from "../../shared/money/money";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { GlJournalType } from "../domain/gl-journal.entity";
import { GlJournalEntity } from "../domain/gl-journal.entity";
import { GlJournalLineEntity } from "../domain/gl-journal-line.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";
import { GlAccountRepository } from "../infrastructure/gl-account.repository";
import { GlJournalLineRepository } from "../infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalRepository } from "../infrastructure/gl-period-account-total.repository";
import { GlPeriodRepository } from "../infrastructure/gl-period.repository";

/** Postgres unique_violation SQLSTATE — see `NumberingService.allocate()` for the same pattern. */
const PG_UNIQUE_VIOLATION = "23505";

/** The `application_name` `trg_gl_writer_guard` (migration `0060`) requires on the session before it admits a write to `gl_journal`/`gl_journal_line`/`gl_period_account_total`. */
export const POSTING_SERVICE_APPLICATION_NAME = "kfe-posting-service";

export interface PostJournalLineDraft {
  accountId: string;
  costCenterId?: string | null;
  debit: Money;
  credit: Money;
  memo?: string | null;
  entityRefType?: string | null;
  entityRefId?: string | null;
}

export interface PostJournalDraft {
  journalDate: string;
  sourceModule: string;
  /**
   * Optional — `gl_journal.source_doc_type`/`.source_doc_id` are NOT NULL
   * columns in the DDL (no sub-ledger link is nullable at the DB layer), so
   * when a caller omits these (e.g. a genuine MANUAL journal entry with no
   * backing domain document) `post()` falls back to `sourceDocType =
   * "GL_MANUAL"` and `sourceDocId = <the newly minted journal's own id>` —
   * a self-referencing placeholder, documented here rather than relaxing
   * the DDL's NOT NULL constraint.
   */
  sourceDocType?: string;
  sourceDocId?: string;
  narration: string;
  journalType: GlJournalType;
  reversalOfId?: string | null;
  approvalRef?: string | null;
  postedBy: string;
  /** Resolved via `GlPeriodRepository.findCurrentForDate(journalDate)` when omitted. */
  periodId?: string;
  /**
   * Not part of the task brief's `PostJournalDraft` shape — added so a
   * caller can pre-supply a journal number (e.g. a future idempotent-replay
   * path). Normally omitted, in which case `post()` always allocates a
   * fresh number via `NumberingService.allocate(em, "GL_JOURNAL")`.
   */
  number?: string;
  lines: PostJournalLineDraft[];
}

/** `post()`'s return shape — `GlJournalEntity` has no `@OneToMany` back to its lines (see that entity's doc comment), so this is a plain application-layer composite, not a persisted relation. */
export interface GlJournalWithLines extends GlJournalEntity {
  lines: GlJournalLineEntity[];
}

/**
 * THE sole path to writing GL data (docs/phase-5/PROGRESS.md Module 7) —
 * every future domain module (billing, payments, wallet, procurement,
 * inventory, expenses, payroll, banking, fixed-assets) calls `post()` inside
 * its OWN transaction to record a journal, mirroring how
 * `NumberingService.allocate()`/`ApprovalEngineService.submit()` take the
 * caller's `EntityManager` and open no transaction of their own.
 *
 * **The writer-guard mechanism**: `trg_gl_writer_guard` (migration `0060`)
 * rejects any write to `gl_journal`/`gl_journal_line`/`gl_period_account_total`
 * unless the session's `application_name = 'kfe-posting-service'`. Step 6 of
 * `post()` reaches the caller's `EntityManager.queryRunner` (present because
 * `em` MUST belong to an open transaction — `runInTransaction`/`tx()` always
 * attaches one) and issues `SET LOCAL application_name = 'kfe-posting-service'`
 * on it directly. `SET LOCAL` is transaction-scoped (resets automatically at
 * COMMIT/ROLLBACK) and safe with pooled connections — it never leaks the
 * setting onto a connection some other, unrelated transaction later borrows
 * from the pool.
 *
 * **SOFT_CLOSED policy** (the DDL/triggers only encode HARD_CLOSED
 * enforcement — `trg_gl_period_open` — leaving SOFT_CLOSED semantics to the
 * application layer, a documented judgement call): ordinary `MANUAL`/
 * `SYSTEM`/`REVERSING` postings are rejected into a SOFT_CLOSED period (the
 * intent of a soft close is "no more ordinary activity, pending the
 * period-end review"), while `CLOSING`/`OPENING` journal types are allowed
 * (they're the period-close workflow's own adjusting/opening entries and
 * necessarily happen after the period has gone SOFT_CLOSED).
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly journalRepository: GlJournalRepository,
    private readonly journalLineRepository: GlJournalLineRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
    private readonly accountRepository: GlAccountRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly numberingService: NumberingService,
  ) {}

  /**
   * Posts a balanced journal. MUST be called with an `EntityManager`
   * belonging to the caller's own open transaction (see class doc comment).
   * Steps 1-10 per docs/phase-5 Module 7 task brief:
   *  1. every line has exactly one nonzero side, neither side negative;
   *  2. Σdebit === Σcredit;
   *  3. every referenced account exists, is_postable, is_active;
   *  4. resolve + validate the period (HARD_CLOSED always rejected;
   *     SOFT_CLOSED rejected for ordinary journal types, see class doc);
   *  5. allocate the journal number (unless pre-supplied);
   *  6. `SET LOCAL application_name` so the writer-guard admits steps 7-9;
   *  7. insert `gl_journal`;
   *  8. insert `gl_journal_line` rows;
   *  9. upsert-or-increment `gl_period_account_total` rows;
   *  10. return the journal with lines loaded.
   */
  async post(em: EntityManager, draft: PostJournalDraft): Promise<GlJournalWithLines> {
    this.validateLineSides(draft.lines);
    this.validateBalanced(draft.lines);
    await this.validateAccounts(em, draft.lines);
    const period = await this.resolvePeriod(em, draft);

    const number = draft.number ?? (await this.numberingService.allocate(em, "GL_JOURNAL"));

    await this.setWriterGuardApplicationName(em);

    const journalId = generateUuidV7();
    const journal = await this.journalRepository.create(
      {
        id: journalId,
        number,
        journalDate: draft.journalDate,
        periodId: period.id,
        sourceModule: draft.sourceModule,
        sourceDocType: draft.sourceDocType ?? "GL_MANUAL",
        sourceDocId: draft.sourceDocId ?? journalId,
        narration: draft.narration,
        journalType: draft.journalType,
        reversalOfId: draft.reversalOfId ?? null,
        approvalRef: draft.approvalRef ?? null,
        postedBy: draft.postedBy,
        postedAt: new Date(),
      },
      em,
    );

    const lines = await this.journalLineRepository.createMany(
      draft.lines.map((line, index) => ({
        journalId: journal.id,
        lineNo: index + 1,
        accountId: line.accountId,
        costCenterId: line.costCenterId ?? null,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? null,
        entityRefType: line.entityRefType ?? null,
        entityRefId: line.entityRefId ?? null,
      })),
      em,
    );

    await this.applyPeriodAccountTotals(em, period.id, draft.lines);

    return Object.assign(journal, { lines }) as GlJournalWithLines;
  }

  /**
   * Loads the original journal + lines and posts a new `REVERSING` journal
   * with every line's debit/credit swapped. Dated "today" (the reversal's
   * own posting date, a judgement call — not the original journal's date)
   * so period resolution naturally lands it in whatever period is currently
   * open; carries forward the original's `sourceModule`/`sourceDocType`/
   * `sourceDocId` so the reversal stays traceable to the same source
   * document. MUST be called with an `EntityManager` belonging to the
   * caller's own open transaction, same as `post()`.
   */
  async reverse(
    em: EntityManager,
    journalId: string,
    narration: string,
    postedBy: string,
  ): Promise<GlJournalWithLines> {
    const original = await this.journalRepository.findByIdOrFail(journalId, em);
    const originalLines = await this.journalLineRepository.listByJournal(journalId, em);
    if (originalLines.length === 0) {
      throw new ValidationException(`PostingService.reverse: journal ${journalId} has no lines to reverse`);
    }

    const reversalDate = new Date().toISOString().slice(0, 10);

    return this.post(em, {
      journalDate: reversalDate,
      sourceModule: original.sourceModule,
      sourceDocType: original.sourceDocType,
      sourceDocId: original.sourceDocId,
      narration,
      journalType: "REVERSING",
      reversalOfId: original.id,
      postedBy,
      lines: originalLines.map((line) => ({
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        debit: line.credit,
        credit: line.debit,
        memo: line.memo,
        entityRefType: line.entityRefType,
        entityRefId: line.entityRefId,
      })),
    });
  }

  // ---- Steps 1-2: line-shape + balance validation (defense-in-depth) ----

  private validateLineSides(lines: PostJournalLineDraft[]): void {
    if (lines.length === 0) {
      throw new ValidationException("PostingService.post: a journal must have at least one line");
    }
    lines.forEach((line, index) => {
      if (line.debit.isNegative() || line.credit.isNegative()) {
        throw new ValidationException(
          `PostingService.post: line ${index + 1} has a negative amount (mirrors ck_gl_journal_line_nonneg)`,
        );
      }
      const debitNonZero = !line.debit.isZero();
      const creditNonZero = !line.credit.isZero();
      if (debitNonZero === creditNonZero) {
        throw new ValidationException(
          `PostingService.post: line ${index + 1} must have exactly one nonzero side (mirrors ck_gl_journal_line_one_side)`,
        );
      }
    });
  }

  private validateBalanced(lines: PostJournalLineDraft[]): void {
    const totalDebit = lines.reduce((sum, line) => sum.add(line.debit), Money.ZERO);
    const totalCredit = lines.reduce((sum, line) => sum.add(line.credit), Money.ZERO);
    if (!totalDebit.equals(totalCredit)) {
      throw new ValidationException(
        `PostingService.post: journal is not balanced — debit ${totalDebit.toDecimalString()} != credit ${totalCredit.toDecimalString()} (mirrors trg_gl_journal_balanced, BR-GEN-02)`,
      );
    }
  }

  // ---- Step 3: account existence/postability/activity (real business rule) ----

  private async validateAccounts(em: EntityManager, lines: PostJournalLineDraft[]): Promise<void> {
    const uniqueAccountIds = [...new Set(lines.map((line) => line.accountId))];
    for (const accountId of uniqueAccountIds) {
      const account = await this.accountRepository.findById(accountId, em);
      if (!account) {
        throw new NotFoundException("GlAccount", accountId);
      }
      if (!account.isPostable) {
        throw new ValidationException(
          `PostingService.post: account ${account.code} is not postable (header account) — cannot be posted to`,
        );
      }
      if (!account.isActive) {
        throw new ValidationException(`PostingService.post: account ${account.code} is inactive`);
      }
    }
  }

  // ---- Step 4: period resolution + status policy ----

  private async resolvePeriod(em: EntityManager, draft: PostJournalDraft): Promise<GlPeriodEntity> {
    const period = draft.periodId
      ? await this.periodRepository.findByIdOrFail(draft.periodId, em)
      : await this.periodRepository.findCurrentForDate(draft.journalDate, em);

    if (!period) {
      throw new ValidationException(`PostingService.post: no gl_period covers journal_date ${draft.journalDate}`);
    }
    if (period.status === "HARD_CLOSED") {
      throw new ValidationException(
        `PostingService.post: period ${period.id} is HARD_CLOSED — no postings allowed (mirrors trg_gl_period_open, BR-GEN-04)`,
      );
    }
    if (period.status === "SOFT_CLOSED") {
      const allowedDuringSoftClose: GlJournalType[] = ["CLOSING", "OPENING"];
      if (!allowedDuringSoftClose.includes(draft.journalType)) {
        throw new ValidationException(
          `PostingService.post: period ${period.id} is SOFT_CLOSED — only CLOSING/OPENING journal types may post (see class doc "SOFT_CLOSED policy")`,
        );
      }
    }
    return period;
  }

  // ---- Step 6: writer-guard gate ----

  private async setWriterGuardApplicationName(em: EntityManager): Promise<void> {
    const queryRunner = em.queryRunner;
    if (!queryRunner) {
      throw new Error(
        "PostingService.post: EntityManager has no attached QueryRunner — post()/reverse() must be called " +
          "inside an open transaction (see shared/database/tx.ts runInTransaction), never with a plain manager",
      );
    }
    await queryRunner.query(`SET LOCAL application_name = '${POSTING_SERVICE_APPLICATION_NAME}'`);
  }

  // ---- Step 9: gl_period_account_total upsert-or-increment (N-6) ----

  private async applyPeriodAccountTotals(
    em: EntityManager,
    periodId: string,
    lines: PostJournalLineDraft[],
  ): Promise<void> {
    // Aggregate first — a single journal can post multiple lines to the same
    // (account_id, cost_center_id) pair, and `uq_gl_period_account_total_period_account_cc`
    // means only one row may exist per (period, account, cost_center); each
    // distinct key is applied to the DB exactly once, with all its lines'
    // amounts pre-summed in memory.
    const aggregates = new Map<string, { accountId: string; costCenterId: string | null; debit: Money; credit: Money }>();
    for (const line of lines) {
      const costCenterId = line.costCenterId ?? null;
      const key = `${line.accountId}::${costCenterId ?? ""}`;
      const existing = aggregates.get(key);
      if (existing) {
        existing.debit = existing.debit.add(line.debit);
        existing.credit = existing.credit.add(line.credit);
      } else {
        aggregates.set(key, { accountId: line.accountId, costCenterId, debit: line.debit, credit: line.credit });
      }
    }

    for (const aggregate of aggregates.values()) {
      await this.upsertPeriodAccountTotal(
        em,
        periodId,
        aggregate.accountId,
        aggregate.costCenterId,
        aggregate.debit,
        aggregate.credit,
      );
    }
  }

  /**
   * Locked read-then-increment, falling back to insert-on-first-use with a
   * unique-violation retry — the exact same shape as
   * `NumberingService.allocate()`'s `createSeriesOnFirstUse()`, applied here
   * so two concurrent postings to the same `(period_id, account_id,
   * cost_center_id)` triple can never both observe "no row yet" and both
   * attempt to INSERT it.
   */
  private async upsertPeriodAccountTotal(
    em: EntityManager,
    periodId: string,
    accountId: string,
    costCenterId: string | null,
    debit: Money,
    credit: Money,
  ): Promise<void> {
    const existing = await this.periodAccountTotalRepository.findOneForUpdate(periodId, accountId, costCenterId, em);
    if (existing) {
      existing.debitTotal = existing.debitTotal.add(debit);
      existing.creditTotal = existing.creditTotal.add(credit);
      await this.periodAccountTotalRepository.save(existing, em);
      return;
    }

    try {
      await this.periodAccountTotalRepository.create(
        { periodId, accountId, costCenterId, debitTotal: debit, creditTotal: credit },
        em,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const row = await this.periodAccountTotalRepository.findOneForUpdate(periodId, accountId, costCenterId, em);
      if (!row) {
        throw new Error(
          `PostingService.post: gl_period_account_total row missing for ${periodId}/${accountId}/${costCenterId ?? "null"} ` +
            "after losing the create race — data corruption",
        );
      }
      row.debitTotal = row.debitTotal.add(debit);
      row.creditTotal = row.creditTotal.add(credit);
      await this.periodAccountTotalRepository.save(row, em);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
