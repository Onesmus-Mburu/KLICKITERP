import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ClassesService } from "../application/classes.service";
import { StdClassEntity } from "../domain/std-class.entity";

function makeClass(overrides: Partial<StdClassEntity> = {}): StdClassEntity {
  return {
    id: "class-1",
    name: "Grade 5",
    level: 5,
    isActive: true,
    ...overrides,
  } as StdClassEntity;
}

describe("ClassesService", () => {
  let classRepository: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    countFeeStructureReferences: jest.Mock;
  };
  let streamRepository: { countByClassId: jest.Mock };
  let studentRepository: { countByClassId: jest.Mock };
  let service: ClassesService;

  beforeEach(() => {
    classRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeClass()),
      list: jest.fn(async () => []),
      create: jest.fn(async (d) => makeClass(d)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
      countFeeStructureReferences: jest.fn(async () => 0),
    };
    streamRepository = { countByClassId: jest.fn(async () => 0) };
    studentRepository = { countByClassId: jest.fn(async () => 0) };
    service = new ClassesService(classRepository as never, streamRepository as never, studentRepository as never);
  });

  describe("create", () => {
    it("rejects a duplicate name", async () => {
      classRepository.findByName.mockResolvedValue(makeClass());
      await expect(service.create({ name: "Grade 5", level: 5 }, "actor-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("creates a new, always-active class when the name is free", async () => {
      const result = await service.create({ name: "Grade 6", level: 6 }, "actor-1");
      expect(result.isActive).toBe(true);
      expect(classRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Grade 6", level: 6, isActive: true, createdBy: "actor-1" }),
      );
    });
  });

  describe("delete — Phase 6 Slice 2b", () => {
    it("deletes a class with no referencing students, streams, or fee structures", async () => {
      await service.delete("class-1", "actor-1");
      expect(classRepository.findByIdOrFail).toHaveBeenCalledWith("class-1");
      expect(studentRepository.countByClassId).toHaveBeenCalledWith("class-1");
      expect(streamRepository.countByClassId).toHaveBeenCalledWith("class-1");
      expect(classRepository.countFeeStructureReferences).toHaveBeenCalledWith("class-1");
      expect(classRepository.delete).toHaveBeenCalledWith("class-1");
    });

    it("blocks deletion and names the referencing fee-structure count — a real cross-domain FK found via live verification, not in the original design", async () => {
      classRepository.countFeeStructureReferences.mockResolvedValue(2);

      await expect(service.delete("class-1", "actor-1")).rejects.toThrow(
        "Cannot delete class: 2 fee structure(s) still reference it",
      );
      expect(classRepository.delete).not.toHaveBeenCalled();
    });

    it("names students, streams, AND fee structures together when all three reference it", async () => {
      studentRepository.countByClassId.mockResolvedValue(12);
      streamRepository.countByClassId.mockResolvedValue(2);
      classRepository.countFeeStructureReferences.mockResolvedValue(1);

      await expect(service.delete("class-1", "actor-1")).rejects.toThrow(
        "Cannot delete class: 12 student(s) and 2 stream(s) and 1 fee structure(s) still reference it",
      );
    });

    it("blocks deletion and names the referencing student count when students reference it", async () => {
      studentRepository.countByClassId.mockResolvedValue(12);
      streamRepository.countByClassId.mockResolvedValue(0);

      await expect(service.delete("class-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
      await expect(service.delete("class-1", "actor-1")).rejects.toThrow(
        "Cannot delete class: 12 student(s) still reference it",
      );
      expect(classRepository.delete).not.toHaveBeenCalled();
    });

    it("blocks deletion and names the referencing stream count when streams reference it (zero students)", async () => {
      studentRepository.countByClassId.mockResolvedValue(0);
      streamRepository.countByClassId.mockResolvedValue(2);

      await expect(service.delete("class-1", "actor-1")).rejects.toThrow(
        "Cannot delete class: 2 stream(s) still reference it",
      );
      expect(classRepository.delete).not.toHaveBeenCalled();
    });

    it("names BOTH counts together when both students and streams reference it", async () => {
      studentRepository.countByClassId.mockResolvedValue(12);
      streamRepository.countByClassId.mockResolvedValue(2);

      await expect(service.delete("class-1", "actor-1")).rejects.toThrow(
        "Cannot delete class: 12 student(s) and 2 stream(s) still reference it",
      );
      expect(classRepository.delete).not.toHaveBeenCalled();
    });

    it("404s via findByIdOrFail's own rejection when the class doesn't exist, never reaching the count checks", async () => {
      const notFound = new Error("not found");
      classRepository.findByIdOrFail.mockRejectedValue(notFound);

      await expect(service.delete("missing", "actor-1")).rejects.toBe(notFound);
      expect(studentRepository.countByClassId).not.toHaveBeenCalled();
      expect(classRepository.delete).not.toHaveBeenCalled();
    });
  });
});
