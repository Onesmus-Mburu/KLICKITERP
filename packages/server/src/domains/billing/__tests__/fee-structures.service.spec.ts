import { DataSource, EntityManager } from "typeorm";
import { FeeStructuresService } from "../application/fee-structures.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";

function makeStructure(overrides: Partial<BillFeeStructureEntity>): BillFeeStructureEntity {
  return {
    id: "structure-1",
    academicYearId: "year-1",
    classId: "class-1",
    streamId: null,
    boarding: null,
    feeGroupId: null,
    version: 1,
    status: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    ...overrides,
  } as BillFeeStructureEntity;
}

function makeLine(overrides: Partial<BillFeeStructureLineEntity>): BillFeeStructureLineEntity {
  return {
    id: "line-1",
    feeStructureId: "structure-1",
    feeCategoryId: "cat-1",
    termId: "term-1",
    dueDate: "2026-06-30",
    amount: Money.fromInt(1000),
    isOptional: false,
    ...overrides,
  } as BillFeeStructureLineEntity;
}

describe("FeeStructuresService", () => {
  let feeStructureRepository: {
    findByIdOrFail: jest.Mock;
    listByYearAndClass: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    findCurrentPublished: jest.Mock;
  };
  let feeStructureLineRepository: {
    findByIdOrFail: jest.Mock;
    listByStructure: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let studentRepository: { findByIdOrFail: jest.Mock };
  let academicCalendarService: { findTermByIdOrFail: jest.Mock };
  let invoiceRepository: { countByFeeStructureId: jest.Mock };
  let feeCategoryRepository: { findByIdOrFail: jest.Mock };
  let classRepository: { findByIdOrFail: jest.Mock };
  let streamRepository: { findById: jest.Mock };
  let documentVerificationService: { mint: jest.Mock; findByDocument: jest.Mock; verify: jest.Mock };
  let dataSource: DataSource;
  let service: FeeStructuresService;

  beforeEach(() => {
    feeStructureRepository = {
      findByIdOrFail: jest.fn(async () => makeStructure({})),
      listByYearAndClass: jest.fn(async () => []),
      create: jest.fn(async (data) => makeStructure(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
      findCurrentPublished: jest.fn(async () => null),
    };
    feeStructureLineRepository = {
      findByIdOrFail: jest.fn(async () => makeLine({})),
      listByStructure: jest.fn(async () => [makeLine({})]),
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    studentRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "student-1", classId: "class-1", streamId: null, boarding: "DAY", feeGroupId: null })),
    };
    academicCalendarService = {
      findTermByIdOrFail: jest.fn(async () => ({ id: "term-1", academicYearId: "year-1" })),
    };
    invoiceRepository = { countByFeeStructureId: jest.fn(async () => 0) };
    feeCategoryRepository = { findByIdOrFail: jest.fn(async (id: string) => ({ id, name: `Category ${id}` })) };
    classRepository = { findByIdOrFail: jest.fn(async (id: string) => ({ id, name: `Class ${id}` })) };
    streamRepository = { findById: jest.fn(async () => null) };
    documentVerificationService = {
      mint: jest.fn(async () => ({ token: "docv-token-1" })),
      findByDocument: jest.fn(async () => null),
      verify: jest.fn(async () => null),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new FeeStructuresService(
      feeStructureRepository as never,
      feeStructureLineRepository as never,
      studentRepository as never,
      academicCalendarService as never,
      invoiceRepository as never,
      dataSource,
      feeCategoryRepository as never,
      classRepository as never,
      streamRepository as never,
      documentVerificationService as never,
    );
  });

  describe("createDraft — versioning", () => {
    it("starts at version 1 when no row shares the exact scope", async () => {
      feeStructureRepository.listByYearAndClass.mockResolvedValue([]);
      const structure = await service.createDraft({ academicYearId: "year-1", classId: "class-1" }, "actor-1");
      expect(structure.version).toBe(1);
    });

    it("increments from the max version among rows sharing the exact scope", async () => {
      feeStructureRepository.listByYearAndClass.mockResolvedValue([
        makeStructure({ id: "s1", version: 1, streamId: null, boarding: null, feeGroupId: null }),
        makeStructure({ id: "s2", version: 2, streamId: null, boarding: null, feeGroupId: null }),
        // Different scope (stream set) — must NOT affect the count.
        makeStructure({ id: "s3", version: 9, streamId: "stream-9", boarding: null, feeGroupId: null }),
      ]);
      const structure = await service.createDraft({ academicYearId: "year-1", classId: "class-1" }, "actor-1");
      expect(structure.version).toBe(3);
    });

    it("treats a differently-scoped row (stream set) as version 1 for the new scope", async () => {
      feeStructureRepository.listByYearAndClass.mockResolvedValue([
        makeStructure({ id: "s1", version: 5, streamId: null, boarding: null, feeGroupId: null }),
      ]);
      const structure = await service.createDraft(
        { academicYearId: "year-1", classId: "class-1", streamId: "stream-1" },
        "actor-1",
      );
      expect(structure.version).toBe(1);
    });
  });

  describe("line editing — DRAFT-only", () => {
    it("addLine rejects once the structure is PUBLISHED", async () => {
      feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ status: "PUBLISHED" }));
      await expect(
        service.addLine(
          "structure-1",
          { feeCategoryId: "cat-1", termId: "term-1", dueDate: "2026-06-30", amount: Money.fromInt(100) },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("addLine rejects once the structure is SUPERSEDED (stricter than the DB trigger)", async () => {
      feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ status: "SUPERSEDED" }));
      await expect(
        service.addLine(
          "structure-1",
          { feeCategoryId: "cat-1", termId: "term-1", dueDate: "2026-06-30", amount: Money.fromInt(100) },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("addLine succeeds while DRAFT", async () => {
      const line = await service.addLine(
        "structure-1",
        { feeCategoryId: "cat-1", termId: "term-1", dueDate: "2026-06-30", amount: Money.fromInt(500) },
        "actor-1",
      );
      expect(line.amount.equals(Money.fromInt(500))).toBe(true);
    });

    it("addLine rejects when the given term's academic year does not match the structure's own academic year", async () => {
      feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ academicYearId: "year-1" }));
      academicCalendarService.findTermByIdOrFail.mockResolvedValue({ id: "term-9", academicYearId: "year-9" });
      await expect(
        service.addLine(
          "structure-1",
          { feeCategoryId: "cat-1", termId: "term-9", dueDate: "2026-06-30", amount: Money.fromInt(100) },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("updateLine rejects when the given term's academic year does not match the structure's own academic year", async () => {
      feeStructureLineRepository.findByIdOrFail.mockResolvedValue(makeLine({ feeStructureId: "structure-1" }));
      feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ academicYearId: "year-1" }));
      academicCalendarService.findTermByIdOrFail.mockResolvedValue({ id: "term-9", academicYearId: "year-9" });
      await expect(
        service.updateLine("line-1", { amount: Money.fromInt(100), termId: "term-9", dueDate: "2026-06-30" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("updateLine succeeds while DRAFT with a term in the structure's own academic year", async () => {
      const line = await service.updateLine(
        "line-1",
        { amount: Money.fromInt(750), termId: "term-1", dueDate: "2026-07-15" },
        "actor-1",
      );
      expect(line.amount.equals(Money.fromInt(750))).toBe(true);
      expect(line.termId).toBe("term-1");
      expect(line.dueDate).toBe("2026-07-15");
    });
  });

  describe("publish", () => {
    it("rejects publishing a non-DRAFT structure", async () => {
      feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ status: "PUBLISHED" }));
      await expect(service.publish("structure-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects publishing a structure with zero lines", async () => {
      feeStructureLineRepository.listByStructure.mockResolvedValue([]);
      await expect(service.publish("structure-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("supersedes the prior PUBLISHED row with the exact same scope, then publishes", async () => {
      const target = makeStructure({ id: "structure-2", version: 2, status: "DRAFT" });
      const previousPublished = makeStructure({ id: "structure-1", version: 1, status: "PUBLISHED" });
      feeStructureRepository.findByIdOrFail.mockResolvedValue(target);
      feeStructureRepository.listByYearAndClass.mockResolvedValue([previousPublished, target]);

      const result = await service.publish("structure-2", "actor-1");

      expect(result.status).toBe("PUBLISHED");
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(feeStructureRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "structure-1", status: "SUPERSEDED" }),
        expect.anything(),
      );
    });

    it("does NOT supersede a PUBLISHED row with a different scope", async () => {
      const target = makeStructure({ id: "structure-2", version: 1, status: "DRAFT", streamId: "stream-A" });
      const otherScopePublished = makeStructure({ id: "structure-1", version: 1, status: "PUBLISHED", streamId: null });
      feeStructureRepository.findByIdOrFail.mockResolvedValue(target);
      feeStructureRepository.listByYearAndClass.mockResolvedValue([otherScopePublished, target]);

      await service.publish("structure-2", "actor-1");

      expect(feeStructureRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: "structure-1", status: "SUPERSEDED" }),
        expect.anything(),
      );
    });

    describe("verification token minting (Phase 6 Slice 16 Part 1)", () => {
      it("mints a docv_record token with a human-readable documentRef/summary (class name resolved, no stream)", async () => {
        const target = makeStructure({ id: "structure-1", version: 3, classId: "class-9", streamId: null, status: "DRAFT" });
        feeStructureRepository.findByIdOrFail.mockResolvedValue(target);
        classRepository.findByIdOrFail.mockResolvedValue({ id: "class-9", name: "Grade 4" });

        const result = await service.publish("structure-1", "actor-1");

        expect(classRepository.findByIdOrFail).toHaveBeenCalledWith("class-9", expect.anything());
        expect(streamRepository.findById).not.toHaveBeenCalled();
        expect(documentVerificationService.mint).toHaveBeenCalledWith(expect.anything(), {
          documentType: "FEE_STRUCTURE",
          documentId: "structure-1",
          documentRef: "Grade 4 v3",
          summary: {
            className: "Grade 4",
            streamName: null,
            boarding: result.boarding,
            version: 3,
            publishedAt: result.publishedAt,
          },
        });
      });

      it("includes the stream name in documentRef/summary when the structure is stream-scoped", async () => {
        const target = makeStructure({ id: "structure-1", version: 1, classId: "class-9", streamId: "stream-3", status: "DRAFT" });
        feeStructureRepository.findByIdOrFail.mockResolvedValue(target);
        classRepository.findByIdOrFail.mockResolvedValue({ id: "class-9", name: "Grade 4" });
        streamRepository.findById.mockResolvedValue({ id: "stream-3", name: "Blue" });

        await service.publish("structure-1", "actor-1");

        expect(streamRepository.findById).toHaveBeenCalledWith("stream-3", expect.anything());
        expect(documentVerificationService.mint).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            documentRef: "Grade 4 (Blue) v1",
            summary: expect.objectContaining({ className: "Grade 4", streamName: "Blue" }),
          }),
        );
      });

      it("rejects publishing (never reaching mint()) when the target is not DRAFT — no token minted for a rejected publish", async () => {
        feeStructureRepository.findByIdOrFail.mockResolvedValue(makeStructure({ status: "PUBLISHED" }));
        await expect(service.publish("structure-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
        expect(documentVerificationService.mint).not.toHaveBeenCalled();
      });
    });
  });

  describe("findApplicableFor", () => {
    it("resolves the term's academic year, then the student, then delegates to findCurrentPublished with the year+student scope", async () => {
      studentRepository.findByIdOrFail.mockResolvedValue({
        id: "student-1",
        classId: "class-9",
        streamId: "stream-9",
        boarding: "BOARDER",
        feeGroupId: "group-9",
      });
      academicCalendarService.findTermByIdOrFail.mockResolvedValue({ id: "term-1", academicYearId: "year-42" });
      const published = makeStructure({ status: "PUBLISHED" });
      feeStructureRepository.findCurrentPublished.mockResolvedValue(published);

      const result = await service.findApplicableFor("student-1", "term-1");

      expect(studentRepository.findByIdOrFail).toHaveBeenCalledWith("student-1", undefined);
      expect(academicCalendarService.findTermByIdOrFail).toHaveBeenCalledWith("term-1", undefined);
      expect(feeStructureRepository.findCurrentPublished).toHaveBeenCalledWith(
        "year-42",
        "class-9",
        "stream-9",
        "BOARDER",
        "group-9",
        undefined,
      );
      expect(result).toBe(published);
    });

    it("returns null when no PUBLISHED structure matches", async () => {
      feeStructureRepository.findCurrentPublished.mockResolvedValue(null);
      const result = await service.findApplicableFor("student-1", "term-1");
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("succeeds when zero invoices reference the structure", async () => {
      invoiceRepository.countByFeeStructureId.mockResolvedValue(0);
      await service.delete("structure-1", "actor-1");
      expect(feeStructureRepository.delete).toHaveBeenCalledWith("structure-1");
    });

    it("blocks with a count-naming ConflictException when invoices reference the structure", async () => {
      invoiceRepository.countByFeeStructureId.mockResolvedValue(3);
      await expect(service.delete("structure-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
      await expect(service.delete("structure-1", "actor-1")).rejects.toThrow(/3 invoice\(s\)/);
      expect(feeStructureRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe("listCategoriesForScope", () => {
    it("dedupes categories across every PUBLISHED structure for the scope, skipping DRAFT/SUPERSEDED ones", async () => {
      feeStructureRepository.listByYearAndClass.mockResolvedValue([
        makeStructure({ id: "s1", status: "PUBLISHED" }),
        makeStructure({ id: "s2", status: "DRAFT" }),
      ]);
      feeStructureLineRepository.listByStructure.mockImplementation(async (structureId: string) =>
        structureId === "s1"
          ? [makeLine({ id: "l1", feeStructureId: "s1", feeCategoryId: "cat-1" }), makeLine({ id: "l2", feeStructureId: "s1", feeCategoryId: "cat-1" })]
          : [makeLine({ id: "l3", feeStructureId: "s2", feeCategoryId: "cat-9" })],
      );

      const result = await service.listCategoriesForScope("year-1", "class-1");

      expect(result).toEqual([{ feeCategoryId: "cat-1", name: "Category cat-1", exampleAmount: expect.anything() }]);
      expect(feeStructureLineRepository.listByStructure).toHaveBeenCalledTimes(1);
      expect(feeStructureLineRepository.listByStructure).toHaveBeenCalledWith("s1");
    });

    it("returns an empty list when no PUBLISHED structure exists for the scope", async () => {
      feeStructureRepository.listByYearAndClass.mockResolvedValue([makeStructure({ id: "s1", status: "DRAFT" })]);
      const result = await service.listCategoriesForScope("year-1", "class-1");
      expect(result).toEqual([]);
      expect(feeStructureLineRepository.listByStructure).not.toHaveBeenCalled();
    });
  });
});
