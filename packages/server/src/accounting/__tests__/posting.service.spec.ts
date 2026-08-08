import { EntityManager } from "typeorm";
import { PostingService, PostJournalDraft } from "../application/posting.service";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { Money } from "../../shared/money/money";
import { GlAccountEntity } from "../domain/gl-account.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";
import { GlPeriodAccountTotalEntity } from "../domain/gl-period-account-total.entity";

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return {
    id: "acc-1",
    code: "1010",
    name: "Test Account",
    class: "ASSET",
    parentId: "root-1",
    isPostable: true,
    isControl: false,
    controlDomain: null,
    isActive: true,
    taxTreatment: null,
    ...overrides,
  } as GlAccountEntity;
}

function makePeriod(overrides: Partial<GlPeriodEntity>): GlPeriodEntity {
  return {
    id: "period-1",
    fiscalYearId: "fy-1",
    seq: 1,
    startsOn: "2026-01-01",
    endsOn: "2026-01-31",
    status: "OPEN",
    ...overrides,
  } as GlPeriodEntity;
}

function makePeriodAccountTotal(overrides: Partial<GlPeriodAccountTotalEntity>): GlPeriodAccountTotalEntity {
  return {
    id: "pat-1",
    periodId: "period-1",
    accountId: "acc-1",
    costCenterId: null,
    debitTotal: Money.ZERO,
    creditTotal: Money.ZERO,
    ...overrides,
  } as GlPeriodAccountTotalEntity;
}

function baseDraft(overrides: Partial<PostJournalDraft> = {}): PostJournalDraft {
  return {
    journalDate: "2026-01-15",
    sourceModule: "TEST",
    narration: "test posting",
    journalType: "MANUAL",
    postedBy: "user-1",
    lines: [
      { accountId: "acc-cash", debit: Money.fromInt(100), credit: Money.ZERO },
      { accountId: "acc-revenue", debit: Money.ZERO, credit: Money.fromInt(100) },
    ],
    ...overrides,
  };
}

describe("PostingService", () => {
  let journalRepository: { create: jest.Mock; findById: jest.Mock; findByIdOrFail: jest.Mock };
  let journalLineRepository: { createMany: jest.Mock; listByJournal: jest.Mock };
  let periodAccountTotalRepository: { findOneForUpdate: jest.Mock; save: jest.Mock; create: jest.Mock };
  let accountRepository: { findById: jest.Mock };
  let periodRepository: { findCurrentForDate: jest.Mock; findByIdOrFail: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let queryRunner: { query: jest.Mock };
  let em: EntityManager;
  let service: PostingService;

  const cashAccount = makeAccount({ id: "acc-cash", code: "1010" });
  const revenueAccount = makeAccount({ id: "acc-revenue", code: "4010" });
  const accountsById: Record<string, GlAccountEntity> = {
    "acc-cash": cashAccount,
    "acc-revenue": revenueAccount,
  };

  beforeEach(() => {
    journalRepository = {
      create: jest.fn(async (data) => ({ ...data })),
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
    };
    journalLineRepository = {
      createMany: jest.fn(async (data: unknown[]) => data.map((line, i) => ({ ...(line as object), id: `line-${i}` }))),
      listByJournal: jest.fn(),
    };
    periodAccountTotalRepository = {
      findOneForUpdate: jest.fn(async () => null),
      save: jest.fn(async (e) => e),
      create: jest.fn(async (d) => d),
    };
    accountRepository = {
      findById: jest.fn(async (id: string) => accountsById[id] ?? null),
    };
    periodRepository = {
      findCurrentForDate: jest.fn(async () => makePeriod({})),
      findByIdOrFail: jest.fn(async () => makePeriod({})),
    };
    numberingService = { allocate: jest.fn(async () => "GL-000001") };
    queryRunner = { query: jest.fn(async () => undefined) };
    em = { queryRunner } as unknown as EntityManager;

    service = new PostingService(
      journalRepository as never,
      journalLineRepository as never,
      periodAccountTotalRepository as never,
      accountRepository as never,
      periodRepository as never,
      numberingService as never,
    );
  });

  describe("post — validation", () => {
    it("rejects an unbalanced journal (Σdebit !== Σcredit)", async () => {
      const draft = baseDraft({
        lines: [
          { accountId: "acc-cash", debit: Money.fromInt(100), credit: Money.ZERO },
          { accountId: "acc-revenue", debit: Money.ZERO, credit: Money.fromInt(90) },
        ],
      });
      await expect(service.post(em, draft)).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line with both debit and credit zero", async () => {
      const draft = baseDraft({
        lines: [
          { accountId: "acc-cash", debit: Money.ZERO, credit: Money.ZERO },
          { accountId: "acc-revenue", debit: Money.ZERO, credit: Money.ZERO },
        ],
      });
      await expect(service.post(em, draft)).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line with both debit and credit nonzero", async () => {
      const draft = baseDraft({
        lines: [{ accountId: "acc-cash", debit: Money.fromInt(10), credit: Money.fromInt(10) }],
      });
      await expect(service.post(em, draft)).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a negative amount", async () => {
      const draft = baseDraft({
        lines: [{ accountId: "acc-cash", debit: Money.fromInt(-10), credit: Money.ZERO }],
      });
      await expect(service.post(em, draft)).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when a referenced account does not exist", async () => {
      const draft = baseDraft({
        lines: [
          { accountId: "acc-missing", debit: Money.fromInt(100), credit: Money.ZERO },
          { accountId: "acc-revenue", debit: Money.ZERO, credit: Money.fromInt(100) },
        ],
      });
      await expect(service.post(em, draft)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects posting to a non-postable (header) account", async () => {
      accountRepository.findById.mockImplementation(async (id: string) =>
        id === "acc-cash" ? makeAccount({ id: "acc-cash", isPostable: false, parentId: null }) : accountsById[id],
      );
      await expect(service.post(em, baseDraft())).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects posting to an inactive account", async () => {
      accountRepository.findById.mockImplementation(async (id: string) =>
        id === "acc-cash" ? makeAccount({ id: "acc-cash", isActive: false }) : accountsById[id],
      );
      await expect(service.post(em, baseDraft())).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("post — period policy", () => {
    it("rejects posting into a HARD_CLOSED period", async () => {
      periodRepository.findCurrentForDate.mockResolvedValue(makePeriod({ status: "HARD_CLOSED" }));
      await expect(service.post(em, baseDraft())).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an ordinary MANUAL posting into a SOFT_CLOSED period", async () => {
      periodRepository.findCurrentForDate.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      await expect(service.post(em, baseDraft({ journalType: "MANUAL" }))).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a SYSTEM posting into a SOFT_CLOSED period", async () => {
      periodRepository.findCurrentForDate.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      await expect(service.post(em, baseDraft({ journalType: "SYSTEM" }))).rejects.toBeInstanceOf(ValidationException);
    });

    it("allows a CLOSING posting into a SOFT_CLOSED period", async () => {
      periodRepository.findCurrentForDate.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      await expect(service.post(em, baseDraft({ journalType: "CLOSING" }))).resolves.toBeDefined();
    });

    it("allows an OPENING posting into a SOFT_CLOSED period", async () => {
      periodRepository.findCurrentForDate.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      await expect(service.post(em, baseDraft({ journalType: "OPENING" }))).resolves.toBeDefined();
    });
  });

  describe("post — writer guard", () => {
    it("issues SET LOCAL application_name on the EntityManager's QueryRunner before writing", async () => {
      await service.post(em, baseDraft());
      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining("SET LOCAL application_name = 'kfe-posting-service'"),
      );
    });

    it("throws when the EntityManager has no attached QueryRunner (not called inside a transaction)", async () => {
      const bareEm = {} as EntityManager;
      await expect(service.post(bareEm, baseDraft())).rejects.toThrow(/QueryRunner/);
    });
  });

  describe("post — gl_period_account_total increment math", () => {
    it("creates a new row (debit_total/credit_total = the posted amounts) when none exists yet", async () => {
      await service.post(em, baseDraft());

      expect(periodAccountTotalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acc-cash", debitTotal: Money.fromInt(100), creditTotal: Money.ZERO }),
        em,
      );
      expect(periodAccountTotalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acc-revenue", debitTotal: Money.ZERO, creditTotal: Money.fromInt(100) }),
        em,
      );
    });

    it("increments an existing row in place rather than creating a new one", async () => {
      const existing = makePeriodAccountTotal({
        accountId: "acc-cash",
        debitTotal: Money.fromInt(50),
        creditTotal: Money.ZERO,
      });
      periodAccountTotalRepository.findOneForUpdate.mockImplementation(async (_p, accountId: string) =>
        accountId === "acc-cash" ? existing : null,
      );

      await service.post(em, baseDraft());

      expect(periodAccountTotalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ debitTotal: Money.fromInt(150), creditTotal: Money.ZERO }),
        em,
      );
      expect(periodAccountTotalRepository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acc-cash" }),
        em,
      );
    });

    it("pre-aggregates multiple lines on the same (account, cost center) before writing a single row", async () => {
      const draft = baseDraft({
        lines: [
          { accountId: "acc-cash", debit: Money.fromInt(30), credit: Money.ZERO },
          { accountId: "acc-cash", debit: Money.fromInt(20), credit: Money.ZERO },
          { accountId: "acc-revenue", debit: Money.ZERO, credit: Money.fromInt(50) },
        ],
      });

      await service.post(em, draft);

      // findOneForUpdate is called exactly once per distinct (account, cost center) key.
      const cashCalls = periodAccountTotalRepository.findOneForUpdate.mock.calls.filter(
        (call: unknown[]) => call[1] === "acc-cash",
      );
      expect(cashCalls).toHaveLength(1);
      expect(periodAccountTotalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acc-cash", debitTotal: Money.fromInt(50) }),
        em,
      );
    });
  });

  describe("post — result shape", () => {
    it("returns the journal with lines loaded", async () => {
      const result = await service.post(em, baseDraft());
      expect(result.number).toBe("GL-000001");
      expect(result.lines).toHaveLength(2);
    });

    it("defaults sourceDocType/sourceDocId when omitted", async () => {
      const result = await service.post(em, baseDraft());
      expect(result.sourceDocType).toBe("GL_MANUAL");
      expect(result.sourceDocId).toBe(result.id);
    });
  });

  describe("reverse", () => {
    it("posts a new REVERSING journal with every line's debit/credit swapped", async () => {
      const originalJournal = {
        id: "orig-journal-1",
        number: "GL-000099",
        sourceModule: "TEST",
        sourceDocType: "GL_MANUAL",
        sourceDocId: "orig-journal-1",
      };
      const originalLines = [
        { accountId: "acc-cash", costCenterId: null, debit: Money.fromInt(100), credit: Money.ZERO, memo: null, entityRefType: null, entityRefId: null },
        { accountId: "acc-revenue", costCenterId: null, debit: Money.ZERO, credit: Money.fromInt(100), memo: null, entityRefType: null, entityRefId: null },
      ];
      journalRepository.findByIdOrFail.mockResolvedValue(originalJournal);
      journalLineRepository.listByJournal.mockResolvedValue(originalLines);

      const reversal = await service.reverse(em, "orig-journal-1", "reversing entry", "user-2");

      expect(reversal.journalType).toBe("REVERSING");
      expect(reversal.reversalOfId).toBe("orig-journal-1");
      expect(reversal.lines[0]).toMatchObject({ accountId: "acc-cash", debit: Money.ZERO, credit: Money.fromInt(100) });
      expect(reversal.lines[1]).toMatchObject({ accountId: "acc-revenue", debit: Money.fromInt(100), credit: Money.ZERO });
    });

    it("rejects reversing a journal with no lines", async () => {
      journalRepository.findByIdOrFail.mockResolvedValue({ id: "empty-journal" });
      journalLineRepository.listByJournal.mockResolvedValue([]);
      await expect(service.reverse(em, "empty-journal", "x", "user-2")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
