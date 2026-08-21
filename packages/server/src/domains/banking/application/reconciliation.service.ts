import { Injectable } from "@nestjs/common";
import { EntityManager, In } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import {
  GlAccountRepository,
  GlJournalEntity,
  GlJournalLineEntity,
  GlPeriodAccountTotalRepository,
  GlPeriodEntity,
  GlPeriodRepository,
  PostingService,
} from "../../../accounting";
import { BankReconciliationEntity } from "../domain/bank-reconciliation.entity";
import { BankReconMatchEntity } from "../domain/bank-recon-match.entity";
import { BankStatementLineEntity } from "../domain/bank-statement-line.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankReconciliationRepository, ListBankReconciliationsFilter } from "../infrastructure/bank-reconciliation.repository";
import { BankReconMatchRepository } from "../infrastructure/bank-recon-match.repository";
import { BankStatementLineRepository } from "../infrastructure/bank-statement-line.repository";
import { resolveBankChargesExpenseAccount, resolveInterestIncomeAccount } from "./gl-banking-accounts.util";

export interface StartReconciliationInput {
  accountId: string;
  periodId: string;
}

export interface AutoMatchSuggestion {
  statementLineId: string;
  journalLineId: string;
  amount: string;
}

export interface AutoMatchResult {
  pass1Matches: number;
  pass2Matches: number;
  suggestions: AutoMatchSuggestion[];
}

export interface CreateAdjustmentInput {
  kind: "CHARGE" | "INTEREST";
  amount: Money;
}

/**
 * THE core matching engine (FR-BANK-004.1) — bank reconciliation workspace
 * lifecycle: `start()` -> `autoMatch()` (3 passes) -> `manualMatch()`/
 * `createAdjustment()` for whatever the auto-match passes didn't resolve ->
 * `lock()` (BR-BANK-03's statement snapshot) -> optionally `reopen()`.
 *
 * **Book balance** (`start()`/`lock()`) — queried via
 * `GlPeriodAccountTotalRepository.listByAccount()`, summed across every
 * `gl_period` in the SAME fiscal year with `seq <= ` the target period's own
 * `seq` (a running "balance as of this period's end" — `gl_period_account_total`
 * only stores PER-PERIOD totals, never a running balance column). This is a
 * documented approximation: it does not carry forward any prior FISCAL
 * YEAR's closing balance, since no opening-balance journal exists anywhere
 * in this codebase yet (Module 7's own long-standing documented gap — see
 * `accounting`'s "Accounting Core module design notes", item (5)). For a
 * bank account's first fiscal year (the only case any environment built
 * against this codebase's seed data can exercise today) this is exact.
 *
 * **Bank balance** — the sum of every imported `bank_statement_line`'s net
 * signed amount (`debit - credit`) for the account with `line_date <=` the
 * target period's `ends_on`, i.e. every statement line dated on/before the
 * period's close, regardless of which `bank_statement_import` batch or
 * calendar date it was actually imported on.
 *
 * **`autoMatch()`'s 3-pass algorithm** (against the account's unmatched
 * `bank_statement_line` rows and its unreconciled `gl_journal_line` rows —
 * lines posted to this `bank_account.gl_account_id` with no existing
 * `bank_recon_match`, found via `findUnreconciledJournalLines()`):
 *  - **Pass 1** (exact ref match): a statement line with a non-null
 *    `external_ref` is matched against an unreconciled journal line whose
 *    PARENT `gl_journal.number` equals that ref exactly (the journal's own
 *    document number — the closest thing a `gl_journal_line` has to an
 *    externally-visible reference, since the line itself carries no ref
 *    column) — the strongest signal FR-BANK-004.1 describes, so pass 1 also
 *    requires the two sides' net signed amounts to match exactly (a
 *    documented strengthening: two entries sharing a reference should also
 *    share an amount by construction; this guards against matching an
 *    unrelated line that merely happens to reuse the same document number
 *    for an entirely different amount).
 *  - **Pass 2** (exact amount + date within ±3 days): for whatever pass 1
 *    left unmatched, matches on net signed amount equality AND the parent
 *    journal's `journal_date` falling within 3 calendar days of the
 *    statement line's own `line_date` (either direction).
 *  - **Pass 3** (amount-only): for whatever remains after passes 1-2,
 *    returns every remaining unreconciled journal line whose net signed
 *    amount matches, as plain SUGGESTIONS (`AutoMatchSuggestion[]`) — no
 *    `bank_recon_match` row is created and no statement line's `recon_state`
 *    changes; `manualMatch()` is the caller's next step to apply a chosen
 *    suggestion.
 * A journal line claimed by an earlier pass (in-memory, this single
 * `autoMatch()` call) is never offered again to a later pass or as a
 * suggestion; passes 1-2 flip the statement line to `MATCHED` immediately
 * inside the same DB transaction as their own match-row insert.
 *
 * **`createAdjustment()`** realizes P-33 (bank charges: debit Bank Charges
 * Expense, credit Bank) or its mirror for `INTEREST` (debit Bank, credit
 * Interest Income) as ONE `PostingService.post()` call, creating a
 * `bank_recon_match` with `adjustment_journal_id` set (no `journal_line_id`
 * — this is a NEW entry, not a match against an existing one) and flipping
 * the statement line to `ADJUSTED`.
 *
 * **`lock()`** (BR-BANK-03) recomputes both balances fresh and builds an
 * `outstanding` jsonb snapshot of whatever is STILL unmatched/unreconciled
 * on either side at lock time — the reconciliation statement FR-BANK-004.1
 * describes.
 *
 * **`reopen()`** — `bank_reconciliation` has no dedicated `reason` column
 * anywhere in the DDL. Rather than silently discard the caller-supplied
 * reason (FR-BANK-004.1 explicitly calls for `banking:reconciliation:reopen`
 * + a reason), this method exploits `trg_bank_reconciliation_immutable`'s
 * own documented escape hatch — `outstanding` MAY change in the SAME UPDATE
 * statement that transitions `status` to `REOPENED` — to append `{reason,
 * actorId, at}` onto a `reopenHistory` array inside the existing
 * `outstanding` jsonb blob, a real, persisted audit trail rather than an
 * invented column.
 *
 * **UPDATE (2026-08-21) — BR-BANK-03 is now wired, both directions.**
 * `accounting`'s `FiscalYearsService.hardClosePeriod()` now requires every
 * active `bank_account` to have a `LOCKED` reconciliation for that period
 * (via a raw SQL check — `accounting` cannot import `domains/banking`
 * without creating a real circular dependency, see that method's own doc
 * comment). `reopen()` below now ALSO refuses to reopen a reconciliation
 * whose period is already `HARD_CLOSED` — the necessary reverse-direction
 * complement, closing a loophole that would otherwise let someone silently
 * defeat the forward check right after satisfying it.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly reconciliationRepository: BankReconciliationRepository,
    private readonly matchRepository: BankReconMatchRepository,
    private readonly statementLineRepository: BankStatementLineRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
    private readonly postingService: PostingService,
  ) {}

  async start(
    em: EntityManager,
    input: StartReconciliationInput,
    initiatedBy: string,
  ): Promise<BankReconciliationEntity> {
    const account = await this.bankAccountRepository.findByIdOrFail(input.accountId, em);
    const period = await this.periodRepository.findByIdOrFail(input.periodId, em);

    const existing = await this.reconciliationRepository.findByAccountAndPeriod(account.id, period.id, em);
    if (existing) {
      throw new ConflictException(
        `A bank_reconciliation already exists for account ${account.id}/period ${period.id} (status=${existing.status})`,
      );
    }

    const bookBalance = await this.computeBookBalance(em, account.glAccountId, period);
    const bankBalance = await this.computeBankBalance(em, account.id, period.endsOn);

    try {
      return await this.reconciliationRepository.create(
        {
          accountId: account.id,
          periodId: period.id,
          status: "IN_PROGRESS",
          bookBalance,
          bankBalance,
          outstanding: {},
          lockedBy: null,
          lockedAt: null,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A bank_reconciliation already exists for account ${account.id}/period ${period.id} (uq_bank_reconciliation_account_period)`,
        );
      }
      throw error;
    }
  }

  async findByIdOrFail(id: string): Promise<BankReconciliationEntity> {
    return this.reconciliationRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankReconciliationsFilter = {}): Promise<BankReconciliationEntity[]> {
    return this.reconciliationRepository.list(filter);
  }

  async listMatches(reconciliationId: string): Promise<BankReconMatchEntity[]> {
    return this.matchRepository.listByReconciliation(reconciliationId);
  }

  /** See class doc comment "autoMatch()'s 3-pass algorithm". */
  async autoMatch(em: EntityManager, reconciliationId: string): Promise<AutoMatchResult> {
    const reconciliation = await this.reconciliationRepository.findByIdOrFail(reconciliationId, em);
    if (reconciliation.status !== "IN_PROGRESS") {
      throw new ValidationException(
        `bank_reconciliation ${reconciliationId} is not IN_PROGRESS (status=${reconciliation.status})`,
      );
    }
    const account = await this.bankAccountRepository.findByIdOrFail(reconciliation.accountId, em);

    const unmatchedLines = await this.statementLineRepository.findUnmatchedForAccount(account.id, em);
    const unreconciledJournalLines = await this.findUnreconciledJournalLines(em, account.glAccountId);
    const journalsById = await this.loadJournals(em, unreconciledJournalLines.map((line) => line.journalId));

    const remainingLines = [...unmatchedLines];
    const claimedJournalLineIds = new Set<string>();

    let pass1Matches = 0;
    for (const line of [...remainingLines]) {
      if (!line.externalRef) continue;
      const candidate = unreconciledJournalLines.find((jl) => {
        if (claimedJournalLineIds.has(jl.id)) return false;
        const journal = journalsById.get(jl.journalId);
        if (!journal || journal.number !== line.externalRef) return false;
        return netAmount(jl.debit, jl.credit).equals(netAmount(line.debit, line.credit));
      });
      if (candidate) {
        await this.createMatch(em, reconciliation.id, line, candidate.id);
        claimedJournalLineIds.add(candidate.id);
        removeFromArray(remainingLines, line);
        pass1Matches += 1;
      }
    }

    let pass2Matches = 0;
    for (const line of [...remainingLines]) {
      const candidate = unreconciledJournalLines.find((jl) => {
        if (claimedJournalLineIds.has(jl.id)) return false;
        const journal = journalsById.get(jl.journalId);
        if (!journal) return false;
        if (!netAmount(jl.debit, jl.credit).equals(netAmount(line.debit, line.credit))) return false;
        return withinDays(journal.journalDate, line.lineDate, 3);
      });
      if (candidate) {
        await this.createMatch(em, reconciliation.id, line, candidate.id);
        claimedJournalLineIds.add(candidate.id);
        removeFromArray(remainingLines, line);
        pass2Matches += 1;
      }
    }

    const suggestions: AutoMatchSuggestion[] = [];
    for (const line of remainingLines) {
      const lineAmount = netAmount(line.debit, line.credit);
      for (const jl of unreconciledJournalLines) {
        if (claimedJournalLineIds.has(jl.id)) continue;
        if (netAmount(jl.debit, jl.credit).equals(lineAmount)) {
          suggestions.push({ statementLineId: line.id, journalLineId: jl.id, amount: lineAmount.toDecimalString() });
        }
      }
    }

    return { pass1Matches, pass2Matches, suggestions };
  }

  /** Applies one chosen pairing (e.g. a pass-3 suggestion, or a purely manual pick). BR-BANK-02's UQ backstop — no pre-check, catch-and-rethrow. */
  async manualMatch(
    em: EntityManager,
    reconciliationId: string,
    statementLineId: string,
    journalLineId: string,
  ): Promise<BankReconMatchEntity> {
    const reconciliation = await this.reconciliationRepository.findByIdOrFail(reconciliationId, em);
    if (reconciliation.status !== "IN_PROGRESS") {
      throw new ValidationException(
        `bank_reconciliation ${reconciliationId} is not IN_PROGRESS (status=${reconciliation.status})`,
      );
    }
    const line = await this.statementLineRepository.findByIdOrFail(statementLineId, em);

    try {
      const match = await this.matchRepository.create(
        { reconciliationId: reconciliation.id, statementLineId: line.id, journalLineId, adjustmentJournalId: null },
        em,
      );
      line.reconState = "MATCHED";
      await this.statementLineRepository.save(line, em);
      return match;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `BR-BANK-02: statement line ${statementLineId} or journal line ${journalLineId} is already matched ` +
            "(uq_bank_recon_match_statement_line / uq_bank_recon_match_journal_line)",
        );
      }
      throw error;
    }
  }

  /** P-33 (CHARGE) or its INTEREST mirror — see class doc comment. */
  async createAdjustment(
    em: EntityManager,
    reconciliationId: string,
    statementLineId: string,
    input: CreateAdjustmentInput,
    postedBy: string,
  ): Promise<BankReconMatchEntity> {
    const reconciliation = await this.reconciliationRepository.findByIdOrFail(reconciliationId, em);
    if (reconciliation.status !== "IN_PROGRESS") {
      throw new ValidationException(
        `bank_reconciliation ${reconciliationId} is not IN_PROGRESS (status=${reconciliation.status})`,
      );
    }
    if (!input.amount.isPositive()) {
      throw new ValidationException("ReconciliationService.createAdjustment: amount must be > 0");
    }
    const line = await this.statementLineRepository.findByIdOrFail(statementLineId, em);
    const account = await this.bankAccountRepository.findByIdOrFail(reconciliation.accountId, em);
    const isCharge = input.kind === "CHARGE";
    const contraAccount = isCharge
      ? await resolveBankChargesExpenseAccount(this.glAccountRepository, em)
      : await resolveInterestIncomeAccount(this.glAccountRepository, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "banking",
      sourceDocType: "bank_reconciliation",
      sourceDocId: reconciliation.id,
      narration: isCharge
        ? `P-33 bank charges (reconciliation adjustment, ${account.name})`
        : `Bank interest income (reconciliation adjustment, ${account.name})`,
      journalType: "MANUAL",
      postedBy,
      lines: isCharge
        ? [
            {
              accountId: contraAccount.id,
              debit: input.amount,
              credit: Money.ZERO,
              memo: "P-33 bank charges expense",
              entityRefType: "bank_statement_line",
              entityRefId: line.id,
            },
            {
              accountId: account.glAccountId,
              debit: Money.ZERO,
              credit: input.amount,
              memo: `P-33 ${account.name}`,
              entityRefType: "bank_statement_line",
              entityRefId: line.id,
            },
          ]
        : [
            {
              accountId: account.glAccountId,
              debit: input.amount,
              credit: Money.ZERO,
              memo: `Interest income (${account.name})`,
              entityRefType: "bank_statement_line",
              entityRefId: line.id,
            },
            {
              accountId: contraAccount.id,
              debit: Money.ZERO,
              credit: input.amount,
              memo: "Interest income",
              entityRefType: "bank_statement_line",
              entityRefId: line.id,
            },
          ],
    });

    const match = await this.matchRepository.create(
      {
        reconciliationId: reconciliation.id,
        statementLineId: line.id,
        journalLineId: null,
        adjustmentJournalId: journal.id,
      },
      em,
    );
    line.reconState = "ADJUSTED";
    await this.statementLineRepository.save(line, em);
    return match;
  }

  /** BR-BANK-03 — see class doc comment. */
  async lock(em: EntityManager, reconciliationId: string, lockedBy: string): Promise<BankReconciliationEntity> {
    const reconciliation = await this.reconciliationRepository.findByIdOrFail(reconciliationId, em);
    if (reconciliation.status !== "IN_PROGRESS") {
      throw new ValidationException(
        `bank_reconciliation ${reconciliationId} is not IN_PROGRESS (status=${reconciliation.status})`,
      );
    }
    const account = await this.bankAccountRepository.findByIdOrFail(reconciliation.accountId, em);
    const period = await this.periodRepository.findByIdOrFail(reconciliation.periodId, em);

    const bookBalance = await this.computeBookBalance(em, account.glAccountId, period);
    const bankBalance = await this.computeBankBalance(em, account.id, period.endsOn);

    const unmatchedLines = await this.statementLineRepository.findUnmatchedForAccount(account.id, em);
    const unreconciledJournalLines = await this.findUnreconciledJournalLines(em, account.glAccountId);

    const outstanding = {
      unmatchedStatementLines: unmatchedLines.map((line) => ({
        id: line.id,
        lineDate: line.lineDate,
        amount: netAmount(line.debit, line.credit).toDecimalString(),
        description: line.description,
      })),
      unreconciledJournalLines: unreconciledJournalLines.map((line) => ({
        id: line.id,
        journalId: line.journalId,
        amount: netAmount(line.debit, line.credit).toDecimalString(),
      })),
    };

    reconciliation.bookBalance = bookBalance;
    reconciliation.bankBalance = bankBalance;
    reconciliation.outstanding = outstanding;
    reconciliation.status = "LOCKED";
    reconciliation.lockedBy = lockedBy;
    reconciliation.lockedAt = new Date();
    reconciliation.updatedBy = lockedBy;
    return this.reconciliationRepository.save(reconciliation, em);
  }

  /**
   * See class doc comment "reopen()" for the `outstanding.reopenHistory`
   * persistence mechanism.
   *
   * **BR-BANK-03's own reverse loophole, closed alongside the forward
   * direction (`FiscalYearsService.hardClosePeriod()`)**: without this
   * check, a reconciliation could be locked, its period hard-closed (now
   * that hard-close genuinely requires a LOCKED reconciliation), and then
   * STILL reopened afterward — silently defeating the very guarantee
   * BR-BANK-03 exists to provide, since the reconciliation would claim
   * `REOPENED`/not-finalized while its own period is permanently frozen at
   * the GL level. `periodRepository` was already a real, existing
   * dependency of this service (used by `lock()`), so this needed no new
   * cross-module wiring.
   */
  async reopen(em: EntityManager, reconciliationId: string, reason: string, actorId: string): Promise<BankReconciliationEntity> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationException("ReconciliationService.reopen: a non-empty reason is required (banking:reconciliation:reopen)");
    }
    const reconciliation = await this.reconciliationRepository.findByIdOrFail(reconciliationId, em);
    if (reconciliation.status !== "LOCKED") {
      throw new ValidationException(
        `Only a LOCKED bank_reconciliation can be reopened (reconciliation ${reconciliationId} status=${reconciliation.status})`,
      );
    }
    const period = await this.periodRepository.findByIdOrFail(reconciliation.periodId, em);
    if (period.status === "HARD_CLOSED") {
      throw new ValidationException(
        `Cannot reopen bank_reconciliation ${reconciliationId} — its period ${period.id} is already HARD_CLOSED (BR-BANK-03: reopening would defeat the reconciliation guarantee hard-close already relied on)`,
      );
    }

    const existingOutstanding = (reconciliation.outstanding ?? {}) as Record<string, unknown>;
    const reopenHistory = Array.isArray(existingOutstanding.reopenHistory) ? existingOutstanding.reopenHistory : [];
    reconciliation.outstanding = {
      ...existingOutstanding,
      reopenHistory: [...reopenHistory, { reason, actorId, at: new Date().toISOString() }],
    };
    reconciliation.status = "REOPENED";
    reconciliation.updatedBy = actorId;
    return this.reconciliationRepository.save(reconciliation, em);
  }

  // ---- helpers ----------------------------------------------------------

  private async createMatch(
    em: EntityManager,
    reconciliationId: string,
    line: BankStatementLineEntity,
    journalLineId: string,
  ): Promise<void> {
    await this.matchRepository.create(
      { reconciliationId, statementLineId: line.id, journalLineId, adjustmentJournalId: null },
      em,
    );
    line.reconState = "MATCHED";
    await this.statementLineRepository.save(line, em);
  }

  private async computeBookBalance(em: EntityManager, glAccountId: string, period: GlPeriodEntity): Promise<Money> {
    const periods = await this.periodRepository.listByFiscalYear(period.fiscalYearId, em);
    const periodIds = new Set(periods.filter((p) => p.seq <= period.seq).map((p) => p.id));
    const totals = await this.periodAccountTotalRepository.listByAccount(glAccountId, em);
    return totals
      .filter((total) => periodIds.has(total.periodId))
      .reduce((sum, total) => sum.add(total.debitTotal).subtract(total.creditTotal), Money.ZERO);
  }

  private async computeBankBalance(em: EntityManager, accountId: string, asOfDate: string): Promise<Money> {
    const lines = await this.statementLineRepository.list({ accountId }, em);
    return lines
      .filter((line) => line.lineDate <= asOfDate)
      .reduce((sum, line) => sum.add(line.debit).subtract(line.credit), Money.ZERO);
  }

  /** Lines posted to `glAccountId` with no existing `bank_recon_match` row. */
  private async findUnreconciledJournalLines(em: EntityManager, glAccountId: string): Promise<GlJournalLineEntity[]> {
    const allLines = await em
      .getRepository(GlJournalLineEntity)
      .find({ where: { accountId: glAccountId }, order: { createdAt: "ASC" } });
    if (allLines.length === 0) return [];

    const matchedRows: Array<{ journal_line_id: string }> = await em.query(
      `SELECT journal_line_id FROM app.bank_recon_match WHERE journal_line_id = ANY($1::uuid[])`,
      [allLines.map((line) => line.id)],
    );
    const matchedIds = new Set(matchedRows.map((row) => row.journal_line_id));
    return allLines.filter((line) => !matchedIds.has(line.id));
  }

  private async loadJournals(em: EntityManager, journalIds: string[]): Promise<Map<string, GlJournalEntity>> {
    if (journalIds.length === 0) return new Map();
    const uniqueIds = [...new Set(journalIds)];
    const journals = await em.getRepository(GlJournalEntity).find({ where: { id: In(uniqueIds) } });
    return new Map(journals.map((journal) => [journal.id, journal]));
  }
}

function netAmount(debit: Money, credit: Money): Money {
  return debit.subtract(credit);
}

function removeFromArray<T>(array: T[], item: T): void {
  const index = array.indexOf(item);
  if (index >= 0) array.splice(index, 1);
}

function withinDays(dateA: string, dateB: string, maxDays: number): boolean {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDays;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}
