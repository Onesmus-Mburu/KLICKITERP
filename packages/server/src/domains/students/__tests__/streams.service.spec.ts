import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { StreamsService } from "../application/streams.service";
import { StdStreamEntity } from "../domain/std-stream.entity";

function makeStream(overrides: Partial<StdStreamEntity> = {}): StdStreamEntity {
  return {
    id: "stream-1",
    classId: "class-1",
    name: "Blue",
    ...overrides,
  } as StdStreamEntity;
}

describe("StreamsService", () => {
  let streamRepository: {
    findByClassAndName: jest.Mock;
    findByIdOrFail: jest.Mock;
    listByClass: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    countFeeStructureReferences: jest.Mock;
  };
  let classRepository: { findByIdOrFail: jest.Mock };
  let studentRepository: { countByStreamId: jest.Mock };
  let service: StreamsService;

  beforeEach(() => {
    streamRepository = {
      findByClassAndName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeStream()),
      listByClass: jest.fn(async () => []),
      create: jest.fn(async (d) => makeStream(d)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
      countFeeStructureReferences: jest.fn(async () => 0),
    };
    classRepository = { findByIdOrFail: jest.fn(async () => ({ id: "class-1" })) };
    studentRepository = { countByStreamId: jest.fn(async () => 0) };
    service = new StreamsService(streamRepository as never, classRepository as never, studentRepository as never);
  });

  describe("create", () => {
    it("rejects a duplicate name within the same class", async () => {
      streamRepository.findByClassAndName.mockResolvedValue(makeStream());
      await expect(service.create({ classId: "class-1", name: "Blue" }, "actor-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe("delete — Phase 6 Slice 2b", () => {
    it("deletes a stream with no referencing students or fee structures", async () => {
      await service.delete("stream-1", "actor-1");
      expect(streamRepository.findByIdOrFail).toHaveBeenCalledWith("stream-1");
      expect(studentRepository.countByStreamId).toHaveBeenCalledWith("stream-1");
      expect(streamRepository.countFeeStructureReferences).toHaveBeenCalledWith("stream-1");
      expect(streamRepository.delete).toHaveBeenCalledWith("stream-1");
    });

    it("blocks deletion and names the real referencing student count", async () => {
      studentRepository.countByStreamId.mockResolvedValue(3);

      await expect(service.delete("stream-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
      await expect(service.delete("stream-1", "actor-1")).rejects.toThrow(
        "Cannot delete stream: 3 student(s) still reference it",
      );
      expect(streamRepository.delete).not.toHaveBeenCalled();
    });

    it("blocks deletion and names the referencing fee-structure count — a real cross-domain FK found via live verification, not in the original design", async () => {
      streamRepository.countFeeStructureReferences.mockResolvedValue(1);

      await expect(service.delete("stream-1", "actor-1")).rejects.toThrow(
        "Cannot delete stream: 1 fee structure(s) still reference it",
      );
      expect(streamRepository.delete).not.toHaveBeenCalled();
    });

    it("404s via findByIdOrFail's own rejection when the stream doesn't exist, never reaching the count check", async () => {
      const notFound = new Error("not found");
      streamRepository.findByIdOrFail.mockRejectedValue(notFound);

      await expect(service.delete("missing", "actor-1")).rejects.toBe(notFound);
      expect(studentRepository.countByStreamId).not.toHaveBeenCalled();
      expect(streamRepository.delete).not.toHaveBeenCalled();
    });
  });
});
