import { DataSource, EntityManager } from "typeorm";
import { FiscalYearsService } from "../application/fiscal-years.service";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { GlFiscalYearEntity } from "../domain/gl-fiscal-year.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";

function makeFiscalYear(overrides: Partial<GlFiscalYearEntity>): GlFiscalYearEntity {
  return {
    id: "fy-1",
    name: "2026",
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    status: "OPEN",
    ...overrides,
  } as GlFiscalYearEntity;
}

function makePeriod(overrides: Partial<GlPeriodEntity>): GlPeriodEntity {
  return {
    id: `period-${overrides.seq ?? 1}`,
    fiscalYearId: "fy-1",
    seq: 1,
    startsOn: "2026-01-01",
    endsOn: "2026-01-31",
    status: "OPEN",
    ...overrides,
  } as GlPeriodEntity;
}

describe("FiscalYearsService", () => {
  let fiscalYearRepository: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let periodRepository: {
    findByIdOrFail: jest.Mock;
    listByFiscalYear: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: DataSource;
  let outboxWriter: { write: jest.Mock };
  let service: FiscalYearsService;
  /** BR-BANK-03's own raw `manager.query()` check — defaults to "no unreconciled active bank accounts", the happy path every pre-existing test expects unchanged. */
  let managerQuery: jest.Mock;

  beforeEach(() => {
    managerQuery = jest.fn(async () => []);
    fiscalYearRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeFiscalYear({})),
      list: jest.fn(),
      create: jest.fn(async (data) => makeFiscalYear(data)),
      save: jest.fn(async (e) => e),
    };
    periodRepository = {
      findByIdOrFail: jest.fn(),
      listByFiscalYear: jest.fn(async () => []),
      create: jest.fn(async (data) => makePeriod(data)),
      save: jest.fn(async (e) => e),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({ query: managerQuery } as unknown as EntityManager),
      ),
    } as unknown as DataSource;
    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new FiscalYearsService(fiscalYearRepository as never, periodRepository as never, dataSource, outboxWriter as never);
  });

  describe("create — period auto-generation", () => {
    it("rejects a duplicate name", async () => {
      fiscalYearRepository.findByName.mockResolvedValue(makeFiscalYear({}));
      await expect(
        service.create({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }, "actor-1"),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("creates exactly periodCount periods (default 12), contiguous, spanning the exact range", async () => {
      await service.create({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }, "actor-1");

      expect(periodRepository.create).toHaveBeenCalledTimes(12);
      const calls = periodRepository.create.mock.calls.map((call) => call[0]);
      expect(calls[0].seq).toBe(1);
      expect(calls[0].startsOn).toBe("2026-01-01");
      expect(calls[11].seq).toBe(12);
      expect(calls[11].endsOn).toBe("2026-12-31");
      // Contiguous: each period's startsOn is the day after the previous period's endsOn.
      for (let i = 1; i < calls.length; i++) {
        const prevEnd = new Date(`${calls[i - 1].endsOn}T00:00:00Z`);
        const thisStart = new Date(`${calls[i].startsOn}T00:00:00Z`);
        expect(thisStart.getTime() - prevEnd.getTime()).toBe(24 * 60 * 60 * 1000);
      }
    });

    it("honors a custom periodCount", async () => {
      await service.create({ name: "2027", startsOn: "2027-01-01", endsOn: "2027-12-31", periodCount: 4 }, "actor-1");
      expect(periodRepository.create).toHaveBeenCalledTimes(4);
    });

    it("rejects a periodCount larger than the number of days in range", async () => {
      await expect(
        service.create({ name: "2028", startsOn: "2028-01-01", endsOn: "2028-01-03", periodCount: 12 }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("sequential period-close enforcement", () => {
    it("hardClosePeriod rejects an OPEN period (must be SOFT_CLOSED first)", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "OPEN" }));
      await expect(service.hardClosePeriod("period-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("hardClosePeriod succeeds from SOFT_CLOSED", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      const result = await service.hardClosePeriod("period-1", "actor-1");
      expect(result.status).toBe("HARD_CLOSED");
      expect(outboxWriter.write).toHaveBeenCalled();
    });

    it("BR-BANK-03: hardClosePeriod rejects when an active bank account has no LOCKED reconciliation for this period", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      managerQuery.mockResolvedValue([{ id: "acc-1", name: "Main Operating Account" }]);
      await expect(service.hardClosePeriod("period-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      expect(periodRepository.save).not.toHaveBeenCalled();
    });

    it("BR-BANK-03: hardClosePeriod succeeds when every active bank account already has a LOCKED reconciliation", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED" }));
      managerQuery.mockResolvedValue([]);
      const result = await service.hardClosePeriod("period-1", "actor-1");
      expect(result.status).toBe("HARD_CLOSED");
      expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining("bank_reconciliation"), ["period-1"]);
    });

    it("softClosePeriod rejects an already HARD_CLOSED period", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "HARD_CLOSED" }));
      await expect(service.softClosePeriod("period-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("openPeriod rejects a HARD_CLOSED period (final)", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "HARD_CLOSED" }));
      await expect(service.openPeriod("period-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("fiscal year status derivation", () => {
    it("stays OPEN when no period is HARD_CLOSED", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "OPEN", fiscalYearId: "fy-1" }));
      periodRepository.listByFiscalYear.mockResolvedValue([
        makePeriod({ seq: 1, status: "SOFT_CLOSED" }),
        makePeriod({ seq: 2, status: "OPEN" }),
      ]);
      fiscalYearRepository.findByIdOrFail.mockResolvedValue(makeFiscalYear({ status: "OPEN" }));

      await service.softClosePeriod("period-1", "actor-1");
      expect(fiscalYearRepository.save).not.toHaveBeenCalled();
    });

    it("moves to CLOSING when at least one but not all periods are HARD_CLOSED", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED", fiscalYearId: "fy-1" }));
      periodRepository.listByFiscalYear.mockResolvedValue([
        makePeriod({ seq: 1, status: "HARD_CLOSED" }),
        makePeriod({ seq: 2, status: "OPEN" }),
      ]);
      fiscalYearRepository.findByIdOrFail.mockResolvedValue(makeFiscalYear({ status: "OPEN" }));

      await service.hardClosePeriod("period-1", "actor-1");

      expect(fiscalYearRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "CLOSING" }), expect.objectContaining({ query: managerQuery }));
    });

    it("moves to LOCKED when every period is HARD_CLOSED", async () => {
      periodRepository.findByIdOrFail.mockResolvedValue(makePeriod({ status: "SOFT_CLOSED", fiscalYearId: "fy-1" }));
      periodRepository.listByFiscalYear.mockResolvedValue([makePeriod({ seq: 1, status: "HARD_CLOSED" })]);
      fiscalYearRepository.findByIdOrFail.mockResolvedValue(makeFiscalYear({ status: "CLOSING" }));

      await service.hardClosePeriod("period-1", "actor-1");

      expect(fiscalYearRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "LOCKED" }), expect.objectContaining({ query: managerQuery }));
    });
  });
});
