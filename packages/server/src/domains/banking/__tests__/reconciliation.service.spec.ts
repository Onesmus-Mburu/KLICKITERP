import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity, GlJournalEntity, GlJournalLineEntity, GlPeriodEntity } from "../../../accounting";
import { ReconciliationService } from "../application/reconciliation.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankReconciliationEntity } from "../domain/bank-reconciliation.entity";
import { BankStatementLineEntity } from "../domain/bank-statement-line.entity";

function makeAccount(): BankAccountEntity {
  return { id: "acc-1", name: "Main Bank", glAccountId: "gl-acc-1" } as BankAccountEntity;
}

function makeReconciliation(overrides: Partial<BankReconciliationEntity> = {}): BankReconciliationEntity {
  return {
    id: "recon-1",
    accountId: "acc-1",
    periodId: "period-1",
    status: "IN_PROGRESS",
    bookBalance: Money.ZERO,
    bankBalance: Money.ZERO,
    outstanding: {},
    lockedBy: null,
    lockedAt: null,
    ...overrides,
  } as BankReconciliationEntity;
}

function makeStatementLine(overrides: Partial<BankStatementLineEntity> = {}): BankStatementLineEntity {
  return {
    id: "line-1",
    importId: "import-1",
    accountId: "acc-1",
    lineDate: "2026-01-10",
    description: "Deposit",
    debit: Money.fromInt(100),
    credit: Money.ZERO,
    externalRef: null,
    dedupeHash: "hash-1",
    reconState: "UNMATCHED",
    ...overrides,
  } as BankStatementLineEntity;
}

function makeJournalLine(overrides: Partial<GlJournalLineEntity> = {}): GlJournalLineEntity {
  return {
    id: "jl-1",
    journalId: "journal-1",
    lineNo: 1,
    accountId: "gl-acc-1",
    costCenterId: null,
    debit: Money.fromInt(100),
    credit: Money.ZERO,
    memo: null,
    ...overrides,
  } as GlJournalLineEntity;
}

function makeJournal(overrides: Partial<GlJournalEntity> = {}): GlJournalEntity {
  return { id: "journal-1", number: "GLJ-000001", journalDate: "2026-01-10", ...overrides } as GlJournalEntity;
}

describe("ReconciliationService", () => {
  let reconciliationRepository: {
    findByIdOrFail: jest.Mock;
    findByAccountAndPeriod: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    list: jest.Mock;
  };
  let matchRepository: { create: jest.Mock; listByReconciliation: jest.Mock };
  let statementLineRepository: { findUnmatchedForAccount: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock; list: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCodeOrFail: jest.Mock };
  let periodRepository: { findByIdOrFail: jest.Mock; listByFiscalYear: jest.Mock };
  let periodAccountTotalRepository: { listByAccount: jest.Mock };
  let postingService: { post: jest.Mock };
  let service: ReconciliationService;

  let journalLinesForAccount: GlJournalLineEntity[];
  let journalsById: Map<string, GlJournalEntity>;
  let matchedJournalLineIdRows: Array<{ journal_line_id: string }>;

  function makeEm(): EntityManager {
    return {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === GlJournalLineEntity) {
          return { find: jest.fn(async () => journalLinesForAccount) };
        }
        if (entity === GlJournalEntity) {
          return { find: jest.fn(async () => [...journalsById.values()]) };
        }
        throw new Error(`unexpected entity in test em.getRepository: ${String(entity)}`);
      }),
      query: jest.fn(async () => matchedJournalLineIdRows),
    } as unknown as EntityManager;
  }

  beforeEach(() => {
    journalLinesForAccount = [];
    journalsById = new Map();
    matchedJournalLineIdRows = [];

    reconciliationRepository = {
      findByIdOrFail: jest.fn(async () => makeReconciliation()),
      findByAccountAndPeriod: jest.fn(async () => null),
      create: jest.fn(async (data) => makeReconciliation(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    matchRepository = { create: jest.fn(async (data) => ({ id: "match-1", ...data })), listByReconciliation: jest.fn(async () => []) };
    statementLineRepository = {
      findUnmatchedForAccount: jest.fn(async () => []),
      findByIdOrFail: jest.fn(async () => makeStatementLine()),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    bankAccountRepository = { findByIdOrFail: jest.fn(async () => makeAccount()) };
    glAccountRepository = { findByCodeOrFail: jest.fn(async (code: string) => ({ id: `${code}-acc`, code, isActive: true, isPostable: true } as GlAccountEntity)) };
    periodRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "period-1", fiscalYearId: "fy-1", seq: 1, endsOn: "2026-01-31" } as GlPeriodEntity)),
      listByFiscalYear: jest.fn(async () => [{ id: "period-1", seq: 1 }]),
    };
    periodAccountTotalRepository = { listByAccount: jest.fn(async () => []) };
    postingService = { post: jest.fn(async () => ({ id: "adj-journal-1", lines: [] })) };

    service = new ReconciliationService(
      reconciliationRepository as never,
      matchRepository as never,
      statementLineRepository as never,
      bankAccountRepository as never,
      glAccountRepository as never,
      periodRepository as never,
      periodAccountTotalRepository as never,
      postingService as never,
    );
  });

  describe("start()", () => {
    it("rejects when a reconciliation already exists for the account/period", async () => {
      reconciliationRepository.findByAccountAndPeriod.mockResolvedValue(makeReconciliation());
      await expect(service.start(makeEm(), { accountId: "acc-1", periodId: "period-1" }, "actor-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("computes book_balance from gl_period_account_total and bank_balance from statement lines", async () => {
      periodAccountTotalRepository.listByAccount.mockResolvedValue([
        { periodId: "period-1", debitTotal: Money.fromInt(500), creditTotal: Money.fromInt(100) },
      ]);
      statementLineRepository.list.mockResolvedValue([
        makeStatementLine({ lineDate: "2026-01-05", debit: Money.fromInt(200), credit: Money.ZERO }),
        makeStatementLine({ lineDate: "2026-01-20", debit: Money.ZERO, credit: Money.fromInt(50) }),
        makeStatementLine({ lineDate: "2026-02-05", debit: Money.fromInt(9999), credit: Money.ZERO }), // after period end — excluded
      ]);

      const result = await service.start(makeEm(), { accountId: "acc-1", periodId: "period-1" }, "actor-1");
      expect(reconciliationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ bookBalance: Money.fromInt(400), bankBalance: Money.fromInt(150), status: "IN_PROGRESS" }),
        expect.anything(),
      );
      expect(result.status).toBe("IN_PROGRESS");
    });
  });

  describe("autoMatch() — 3-pass algorithm", () => {
    it("pass 1: exact ref + amount match creates a bank_recon_match and flips MATCHED", async () => {
      const line = makeStatementLine({ id: "line-ref", externalRef: "GLJ-000001", debit: Money.fromInt(100), credit: Money.ZERO });
      statementLineRepository.findUnmatchedForAccount.mockResolvedValue([line]);
      journalLinesForAccount = [makeJournalLine({ id: "jl-ref", journalId: "journal-1", debit: Money.fromInt(100), credit: Money.ZERO })];
      journalsById.set("journal-1", makeJournal({ id: "journal-1", number: "GLJ-000001" }));

      const result = await service.autoMatch(makeEm(), "recon-1");

      expect(result.pass1Matches).toBe(1);
      expect(result.pass2Matches).toBe(0);
      expect(result.suggestions).toHaveLength(0);
      expect(matchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ reconciliationId: "recon-1", statementLineId: "line-ref", journalLineId: "jl-ref" }),
        expect.anything(),
      );
      expect(statementLineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ reconState: "MATCHED" }), expect.anything());
    });

    it("pass 2: no ref, but exact amount + date within 3 days matches", async () => {
      const line = makeStatementLine({ id: "line-p2", externalRef: null, lineDate: "2026-01-10", debit: Money.fromInt(250), credit: Money.ZERO });
      statementLineRepository.findUnmatchedForAccount.mockResolvedValue([line]);
      journalLinesForAccount = [makeJournalLine({ id: "jl-p2", journalId: "journal-2", debit: Money.fromInt(250), credit: Money.ZERO })];
      journalsById.set("journal-2", makeJournal({ id: "journal-2", number: "GLJ-999999", journalDate: "2026-01-12" })); // 2 days away

      const result = await service.autoMatch(makeEm(), "recon-1");

      expect(result.pass1Matches).toBe(0);
      expect(result.pass2Matches).toBe(1);
      expect(result.suggestions).toHaveLength(0);
      expect(matchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ statementLineId: "line-p2", journalLineId: "jl-p2" }),
        expect.anything(),
      );
    });

    it("pass 3: amount-only match beyond the ±3 day window returns a SUGGESTION, creates no match", async () => {
      const line = makeStatementLine({ id: "line-p3", externalRef: null, lineDate: "2026-01-10", debit: Money.fromInt(75), credit: Money.ZERO });
      statementLineRepository.findUnmatchedForAccount.mockResolvedValue([line]);
      journalLinesForAccount = [makeJournalLine({ id: "jl-p3", journalId: "journal-3", debit: Money.fromInt(75), credit: Money.ZERO })];
      journalsById.set("journal-3", makeJournal({ id: "journal-3", number: "GLJ-777777", journalDate: "2026-02-01" })); // way outside 3 days

      const result = await service.autoMatch(makeEm(), "recon-1");

      expect(result.pass1Matches).toBe(0);
      expect(result.pass2Matches).toBe(0);
      expect(result.suggestions).toEqual([{ statementLineId: "line-p3", journalLineId: "jl-p3", amount: "75.0000" }]);
      expect(matchRepository.create).not.toHaveBeenCalled();
      expect(statementLineRepository.save).not.toHaveBeenCalled();
    });

    it("rejects a non-IN_PROGRESS reconciliation", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "LOCKED" }));
      await expect(service.autoMatch(makeEm(), "recon-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("manualMatch()", () => {
    it("translates a unique-violation into ConflictException (BR-BANK-02)", async () => {
      matchRepository.create.mockRejectedValue({ code: "23505" });
      await expect(service.manualMatch(makeEm(), "recon-1", "line-1", "jl-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("creates a match and flips the statement line to MATCHED", async () => {
      await service.manualMatch(makeEm(), "recon-1", "line-1", "jl-1");
      expect(statementLineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ reconState: "MATCHED" }), expect.anything());
    });
  });

  describe("createAdjustment() — P-33", () => {
    it("CHARGE: debits Bank Charges Expense, credits the bank account", async () => {
      await service.createAdjustment(makeEm(), "recon-1", "line-1", { kind: "CHARGE", amount: Money.fromInt(25) }, "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "5100-acc", debit: Money.fromInt(25), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "gl-acc-1", debit: Money.ZERO, credit: Money.fromInt(25) }),
          ],
        }),
      );
      expect(statementLineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ reconState: "ADJUSTED" }), expect.anything());
    });

    it("INTEREST: debits the bank account, credits Interest Income (the mirror)", async () => {
      await service.createAdjustment(makeEm(), "recon-1", "line-1", { kind: "INTEREST", amount: Money.fromInt(10) }, "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "gl-acc-1", debit: Money.fromInt(10), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "4040-acc", debit: Money.ZERO, credit: Money.fromInt(10) }),
          ],
        }),
      );
    });
  });

  describe("lock() — BR-BANK-03 snapshot computation", () => {
    it("recomputes balances, snapshots outstanding items, and locks", async () => {
      periodAccountTotalRepository.listByAccount.mockResolvedValue([
        { periodId: "period-1", debitTotal: Money.fromInt(1000), creditTotal: Money.fromInt(200) },
      ]);
      statementLineRepository.list.mockResolvedValue([makeStatementLine({ lineDate: "2026-01-15", debit: Money.fromInt(800), credit: Money.ZERO })]);
      statementLineRepository.findUnmatchedForAccount.mockResolvedValue([makeStatementLine({ id: "unmatched-1" })]);
      journalLinesForAccount = [makeJournalLine({ id: "jl-outstanding" })];
      matchedJournalLineIdRows = [];

      const result = await service.lock(makeEm(), "recon-1", "locker-1");

      expect(result.status).toBe("LOCKED");
      expect(result.bookBalance.equals(Money.fromInt(800))).toBe(true);
      expect(result.bankBalance.equals(Money.fromInt(800))).toBe(true);
      expect(result.lockedBy).toBe("locker-1");
      expect(result.lockedAt).toBeInstanceOf(Date);
      const outstanding = result.outstanding as { unmatchedStatementLines: unknown[]; unreconciledJournalLines: unknown[] };
      expect(outstanding.unmatchedStatementLines).toHaveLength(1);
      expect(outstanding.unreconciledJournalLines).toHaveLength(1);
    });

    it("rejects a non-IN_PROGRESS reconciliation", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "REOPENED" }));
      await expect(service.lock(makeEm(), "recon-1", "locker-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("reopen()", () => {
    it("requires a non-empty reason", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "LOCKED" }));
      await expect(service.reopen(makeEm(), "recon-1", "", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("only allows reopening a LOCKED reconciliation", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "IN_PROGRESS" }));
      await expect(service.reopen(makeEm(), "recon-1", "correcting an error", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("persists the reason inside outstanding.reopenHistory and sets status=REOPENED", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "LOCKED", outstanding: { unmatchedStatementLines: [] } }));
      const result = await service.reopen(makeEm(), "recon-1", "correcting an error", "actor-1");
      expect(result.status).toBe("REOPENED");
      const outstanding = result.outstanding as { reopenHistory: Array<{ reason: string; actorId: string }> };
      expect(outstanding.reopenHistory).toHaveLength(1);
      expect(outstanding.reopenHistory[0]).toEqual(expect.objectContaining({ reason: "correcting an error", actorId: "actor-1" }));
    });

    it("BR-BANK-03: rejects reopening once the reconciliation's own period is HARD_CLOSED", async () => {
      reconciliationRepository.findByIdOrFail.mockResolvedValue(makeReconciliation({ status: "LOCKED" }));
      periodRepository.findByIdOrFail.mockResolvedValue({ id: "period-1", fiscalYearId: "fy-1", seq: 1, endsOn: "2026-01-31", status: "HARD_CLOSED" } as GlPeriodEntity);
      await expect(service.reopen(makeEm(), "recon-1", "correcting an error", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      expect(reconciliationRepository.save).not.toHaveBeenCalled();
    });
  });
});
