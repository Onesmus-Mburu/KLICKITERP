import { NumberingService } from "../application/numbering.service";
import { NUMBERING_SERIES_NEVER_PERIOD_KEY } from "../domain/set-numbering-series.entity";
import { FakeNumberingSeriesRepo, makeFakeEntityManager } from "./support/fake-numbering-series-repo";

describe("NumberingService.allocate — NFR-INT-003 gapless allocator", () => {
  let seriesRepository: { findById: jest.Mock; list: jest.Mock; save: jest.Mock };
  let academicCalendar: { getCurrentTermWithYear: jest.Mock };
  let service: NumberingService;

  beforeEach(() => {
    seriesRepository = { findById: jest.fn(), list: jest.fn(), save: jest.fn(async (e) => e) };
    academicCalendar = { getCurrentTermWithYear: jest.fn(async () => null) };
    service = new NumberingService(seriesRepository as never, academicCalendar as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("auto-create-on-first-use", () => {
    it("creates a NEVER-policy row with sensible defaults and allocates 1, 2, 3 ... sequentially", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      const em = makeFakeEntityManager(fakeRepo);

      const first = await service.allocate(em, "INVOICE");
      const second = await service.allocate(em, "INVOICE");
      const third = await service.allocate(em, "INVOICE");

      expect(first).toBe("INV-000001");
      expect(second).toBe("INV-000002");
      expect(third).toBe("INV-000003");

      const row = fakeRepo.rows.find((r) => r.docType === "INVOICE");
      expect(row).toMatchObject({
        seriesCode: "MAIN",
        resetPolicy: "NEVER",
        periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
        padWidth: 6,
        nextNo: "4",
      });
    });

    it("never throws when no series row exists yet", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      const em = makeFakeEntityManager(fakeRepo);
      await expect(service.allocate(em, "RANDOM_DOC_TYPE")).resolves.toBe("RAN-000001");
    });
  });

  describe("prefix + padding formatting", () => {
    it("formats using the series' own prefix/pad_width, not the defaults", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      fakeRepo.seed({
        docType: "PO",
        seriesCode: "MAIN",
        prefix: "PO-",
        padWidth: 3,
        resetPolicy: "NEVER",
        periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
        nextNo: "7",
      });
      const em = makeFakeEntityManager(fakeRepo);

      expect(await service.allocate(em, "PO")).toBe("PO-007");
      expect(await service.allocate(em, "PO")).toBe("PO-008");
    });
  });

  describe("YEARLY rollover", () => {
    it("uses the existing period_key row within the same year, then creates a new one when the year changes", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      fakeRepo.seed({
        docType: "RECEIPT",
        seriesCode: "MAIN",
        prefix: "RCT-",
        padWidth: 4,
        resetPolicy: "YEARLY",
        periodKey: "2025",
        nextNo: "10",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      });
      const em = makeFakeEntityManager(fakeRepo);

      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-06-01T00:00:00Z"));
      expect(await service.allocate(em, "RECEIPT")).toBe("RCT-0010");
      expect(fakeRepo.rows.find((r) => r.periodKey === "2025")?.nextNo).toBe("11");

      jest.setSystemTime(new Date("2026-01-15T00:00:00Z"));
      expect(await service.allocate(em, "RECEIPT")).toBe("RCT-0001");

      const rows2026 = fakeRepo.rows.filter((r) => r.periodKey === "2026");
      expect(rows2026).toHaveLength(1);
      expect(rows2026[0]).toMatchObject({ prefix: "RCT-", padWidth: 4, resetPolicy: "YEARLY", nextNo: "2" });
      // The prior year's row is untouched by the rollover.
      expect(fakeRepo.rows.find((r) => r.periodKey === "2025")?.nextNo).toBe("11");
    });
  });

  describe("TERMLY rollover", () => {
    it("keys off AcademicCalendarService's current-term lookup and rolls to a new row when the current term changes", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      fakeRepo.seed({
        docType: "PAYSLIP",
        seriesCode: "MAIN",
        prefix: "PSL-",
        padWidth: 5,
        resetPolicy: "TERMLY",
        periodKey: "2026T1",
        nextNo: "1",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      });
      const em = makeFakeEntityManager(fakeRepo);

      academicCalendar.getCurrentTermWithYear.mockResolvedValueOnce({
        term: { id: "term-1", seq: 1 },
        year: { name: "2026" },
      });
      expect(await service.allocate(em, "PAYSLIP")).toBe("PSL-00001");

      academicCalendar.getCurrentTermWithYear.mockResolvedValueOnce({
        term: { id: "term-2", seq: 2 },
        year: { name: "2026" },
      });
      expect(await service.allocate(em, "PAYSLIP")).toBe("PSL-00001");

      const rows = fakeRepo.rows.filter((r) => r.docType === "PAYSLIP");
      expect(rows.map((r) => r.periodKey).sort()).toEqual(["2026T1", "2026T2"]);
    });

    it("throws a ValidationException when TERMLY is configured but no current term is set", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      fakeRepo.seed({
        docType: "PAYSLIP",
        resetPolicy: "TERMLY",
        periodKey: "2026T1",
        prefix: "PSL-",
        padWidth: 5,
        nextNo: "1",
      });
      const em = makeFakeEntityManager(fakeRepo);
      academicCalendar.getCurrentTermWithYear.mockResolvedValue(null);

      await expect(service.allocate(em, "PAYSLIP")).rejects.toThrow(/current term/);
    });
  });

  describe("concurrent first-use race", () => {
    it("falls through to the row a concurrent transaction won the create race for, and still allocates gaplessly", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      const em = makeFakeEntityManager(fakeRepo);
      const winner = fakeRepo.create({
        docType: "GRN",
        seriesCode: "MAIN",
        prefix: "GRN-",
        padWidth: 6,
        resetPolicy: "NEVER",
        periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
        nextNo: "1",
      });
      winner.id = "winner-row";
      fakeRepo.armConcurrentWinner(winner);

      const result = await service.allocate(em, "GRN");

      expect(result).toBe("GRN-000001");
      expect(fakeRepo.rows.find((r) => r.id === "winner-row")?.nextNo).toBe("2");
      expect(fakeRepo.rows).toHaveLength(1); // no duplicate row was created
    });
  });

  describe("upsertSeriesPrefix (Phase 6 Slice 2b item 8 — Students admission-no autogen)", () => {
    it("creates a fresh NEVER-policy row with the given prefix when none exists yet", async () => {
      seriesRepository.list.mockResolvedValue([]);
      const result = await service.upsertSeriesPrefix("STD_ADMISSION", "DSCS-");
      expect(result).toMatchObject({
        docType: "STD_ADMISSION",
        seriesCode: "MAIN",
        prefix: "DSCS-",
        padWidth: 6,
        resetPolicy: "NEVER",
        periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
        nextNo: "1",
      });
      expect(seriesRepository.save).toHaveBeenCalledTimes(1);
    });

    it("updates the prefix of an existing row in place, preserving its next_no", async () => {
      seriesRepository.list.mockResolvedValue([
        {
          id: "row-1",
          docType: "STD_ADMISSION",
          seriesCode: "MAIN",
          prefix: "ADM-",
          padWidth: 6,
          resetPolicy: "NEVER",
          periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
          nextNo: "42",
        },
      ]);
      const result = await service.upsertSeriesPrefix("STD_ADMISSION", "DSCS-");
      expect(result).toMatchObject({ id: "row-1", prefix: "DSCS-", nextNo: "42" });
      expect(seriesRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "row-1", prefix: "DSCS-" }));
    });

    it("a real allocate() call afterward uses the newly-set prefix from the very first allocation", async () => {
      const fakeRepo = new FakeNumberingSeriesRepo();
      const em = makeFakeEntityManager(fakeRepo);
      // Simulate the upsert having created the row directly on the same fake store
      // `allocate()` reads from, proving the two paths agree on shape.
      fakeRepo.seed({
        docType: "STD_ADMISSION",
        seriesCode: "MAIN",
        prefix: "DSCS-",
        padWidth: 6,
        resetPolicy: "NEVER",
        periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
        nextNo: "1",
      });
      expect(await service.allocate(em, "STD_ADMISSION")).toBe("DSCS-000001");
      expect(await service.allocate(em, "STD_ADMISSION")).toBe("DSCS-000002");
    });
  });

  describe("read-only inspection", () => {
    it("previewNext returns N formatted numbers without mutating next_no", async () => {
      seriesRepository.findById.mockResolvedValue({
        id: "series-1",
        prefix: "INV-",
        padWidth: 4,
        nextNo: "41",
      });

      const preview = await service.previewNext("series-1", 3);

      expect(preview).toEqual(["INV-0041", "INV-0042", "INV-0043"]);
    });
  });
});
