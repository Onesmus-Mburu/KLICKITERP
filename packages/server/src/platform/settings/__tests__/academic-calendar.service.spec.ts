import { DataSource, EntityManager } from "typeorm";
import { AcademicCalendarService } from "../application/academic-calendar.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";

describe("AcademicCalendarService", () => {
  let dataSource: DataSource;
  let academicYearRepository: {
    findByName: jest.Mock;
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findCurrent: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let termRepository: {
    findByYearAndSeq: jest.Mock;
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findCurrent: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let outboxWriter: { write: jest.Mock };
  let service: AcademicCalendarService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    academicYearRepository = {
      findByName: jest.fn(async () => null),
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findCurrent: jest.fn(async () => null),
      list: jest.fn(),
      create: jest.fn(async (data: unknown) => ({ id: "year-new", ...(data as object) })),
      save: jest.fn(async (entity: unknown) => entity),
    };
    termRepository = {
      findByYearAndSeq: jest.fn(async () => null),
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findCurrent: jest.fn(async () => null),
      list: jest.fn(),
      create: jest.fn(async (data: unknown) => ({ id: "term-new", ...(data as object) })),
      save: jest.fn(async (entity: unknown) => entity),
    };
    outboxWriter = { write: jest.fn() };

    service = new AcademicCalendarService(
      dataSource,
      academicYearRepository as never,
      termRepository as never,
      outboxWriter as never,
    );
  });

  describe("setCurrentYear — exactly-one-current (uq_set_year_current_p)", () => {
    it("unsets the previous current year before setting the new one, inside one transaction", async () => {
      const previous = { id: "year-1", isCurrent: true };
      const target = { id: "year-2", isCurrent: false };
      academicYearRepository.findByIdOrFail.mockResolvedValue(target);
      academicYearRepository.findCurrent.mockResolvedValue(previous);

      const result = await service.setCurrentYear("year-2", "actor-1");

      expect(academicYearRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "year-1", isCurrent: false }),
        expect.anything(),
      );
      expect(academicYearRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "year-2", isCurrent: true }),
        expect.anything(),
      );
      expect(result.isCurrent).toBe(true);
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });

    it("is a no-op unset when there is no previous current year", async () => {
      const target = { id: "year-1", isCurrent: false };
      academicYearRepository.findByIdOrFail.mockResolvedValue(target);
      academicYearRepository.findCurrent.mockResolvedValue(null);

      await service.setCurrentYear("year-1", null);

      expect(academicYearRepository.save).toHaveBeenCalledTimes(1);
      expect(academicYearRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "year-1", isCurrent: true }),
        expect.anything(),
      );
    });

    it("rejects a duplicate academic year name on create", async () => {
      academicYearRepository.findByName.mockResolvedValue({ id: "existing" });
      await expect(
        service.createYear({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }, null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects createYear when startsOn is not before endsOn", async () => {
      await expect(
        service.createYear({ name: "2026", startsOn: "2026-12-31", endsOn: "2026-01-01" }, null),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(academicYearRepository.create).not.toHaveBeenCalled();
    });

    it("rejects createYear when startsOn equals endsOn", async () => {
      await expect(
        service.createYear({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-01-01" }, null),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects updateYear when the post-change dates are inverted", async () => {
      academicYearRepository.findByIdOrFail.mockResolvedValue({
        id: "year-1",
        name: "2026",
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
      });
      await expect(service.updateYear("year-1", { startsOn: "2027-01-01" }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(academicYearRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("setCurrentTerm — exactly-one-current (uq_set_term_current_p, global across all years)", () => {
    it("unsets the previous current term before setting the new one, inside one transaction", async () => {
      const previous = { id: "term-1", isCurrent: true };
      const target = { id: "term-2", isCurrent: false };
      termRepository.findByIdOrFail.mockResolvedValue(target);
      termRepository.findCurrent.mockResolvedValue(previous);

      const result = await service.setCurrentTerm("term-2", "actor-1");

      expect(termRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "term-1", isCurrent: false }),
        expect.anything(),
      );
      expect(termRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "term-2", isCurrent: true }),
        expect.anything(),
      );
      expect(result.isCurrent).toBe(true);
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateTerm — billing_locked guard", () => {
    it("rejects changing seq/startsOn/endsOn while billing_locked=true", async () => {
      termRepository.findByIdOrFail.mockResolvedValue({ id: "term-1", name: "Term 1", billingLocked: true });

      await expect(service.updateTerm("term-1", { seq: 2 }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
      await expect(service.updateTerm("term-1", { startsOn: "2026-01-01" }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(termRepository.save).not.toHaveBeenCalled();
    });

    it("still allows non-billing-affecting edits (name) while billing_locked=true", async () => {
      const term = { id: "term-1", name: "Term 1", billingLocked: true };
      termRepository.findByIdOrFail.mockResolvedValue(term);

      await service.updateTerm("term-1", { name: "Term One" }, "actor-1");

      expect(termRepository.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Term One" }));
    });

    it("allows any edit once billing_locked=false", async () => {
      const term = { id: "term-1", name: "Term 1", billingLocked: false };
      termRepository.findByIdOrFail.mockResolvedValue(term);

      await service.updateTerm("term-1", { seq: 3 }, "actor-1");

      expect(termRepository.save).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }));
    });
  });

  describe("createTerm/updateTerm — startsOn < endsOn validation", () => {
    it("rejects createTerm when startsOn is not before endsOn", async () => {
      academicYearRepository.findByIdOrFail.mockResolvedValue({ id: "year-1" });
      await expect(
        service.createTerm(
          { academicYearId: "year-1", name: "Term 1", seq: 1, startsOn: "2026-04-30", endsOn: "2026-01-01" },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(termRepository.create).not.toHaveBeenCalled();
    });

    it("rejects updateTerm when the post-change dates are inverted", async () => {
      termRepository.findByIdOrFail.mockResolvedValue({
        id: "term-1",
        name: "Term 1",
        billingLocked: false,
        startsOn: "2026-01-01",
        endsOn: "2026-04-30",
      });
      await expect(service.updateTerm("term-1", { startsOn: "2026-05-01" }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(termRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentTermWithYear", () => {
    it("returns null when there is no current term", async () => {
      termRepository.findCurrent.mockResolvedValue(null);
      expect(await service.getCurrentTermWithYear()).toBeNull();
      expect(academicYearRepository.findByIdOrFail).not.toHaveBeenCalled();
    });

    it("joins the current term to its academic year", async () => {
      termRepository.findCurrent.mockResolvedValue({ id: "term-1", academicYearId: "year-1", seq: 2 });
      academicYearRepository.findByIdOrFail.mockResolvedValue({ id: "year-1", name: "2026" });

      const result = await service.getCurrentTermWithYear();

      expect(result).toEqual({
        term: { id: "term-1", academicYearId: "year-1", seq: 2 },
        year: { id: "year-1", name: "2026" },
      });
    });
  });
});
