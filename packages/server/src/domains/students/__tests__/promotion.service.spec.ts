import { DataSource } from "typeorm";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { PromotionService } from "../application/promotion.service";

describe("PromotionService.promoteBatch", () => {
  let studentRepository: { findById: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let classRepository: { findById: jest.Mock };
  let streamRepository: { findById: jest.Mock };
  let promotionBatchRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let dataSource: DataSource;
  let service: PromotionService;

  const studentsById: Record<string, { id: string; classId: string; streamId: string | null }> = {
    "student-1": { id: "student-1", classId: "class-old", streamId: null },
    "student-2": { id: "student-2", classId: "class-old", streamId: null },
  };
  const classesById: Record<string, { id: string }> = {
    "class-old": { id: "class-old" },
    "class-new": { id: "class-new" },
  };
  const streamsById: Record<string, { id: string; classId: string }> = {
    "stream-new": { id: "stream-new", classId: "class-new" },
    "stream-wrong": { id: "stream-wrong", classId: "class-old" },
  };

  beforeEach(() => {
    studentRepository = {
      findById: jest.fn(async (id: string) => studentsById[id] ?? null),
      findByIdOrFail: jest.fn(async (id: string) => {
        const s = studentsById[id];
        if (!s) throw new Error(`not found: ${id}`);
        return { ...s };
      }),
      save: jest.fn(async (e) => e),
    };
    classRepository = { findById: jest.fn(async (id: string) => classesById[id] ?? null) };
    streamRepository = { findById: jest.fn(async (id: string) => streamsById[id] ?? null) };
    promotionBatchRepository = {
      create: jest.fn(async (d) => ({ ...d, id: "batch-1" })),
      findByIdOrFail: jest.fn(),
      list: jest.fn(),
    };
    outboxWriter = { write: jest.fn(async () => undefined) };

    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (m: unknown) => Promise<unknown>) => work({})),
    } as unknown as DataSource;

    service = new PromotionService(
      dataSource,
      studentRepository as never,
      classRepository as never,
      streamRepository as never,
      promotionBatchRepository as never,
      outboxWriter as unknown as OutboxWriterService,
    );
  });

  it("promotes every valid student and records a summary with the right counts", async () => {
    const batch = await service.promoteBatch({
      fromYearId: "year-1",
      toYearId: "year-2",
      promotions: [
        { studentId: "student-1", toClassId: "class-new" },
        { studentId: "student-2", toClassId: "class-new", toStreamId: "stream-new" },
      ],
      executedBy: "actor-1",
    });

    expect(studentRepository.save).toHaveBeenCalledTimes(2);
    expect(studentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "student-1", classId: "class-new", streamId: null }),
      expect.anything(),
    );
    expect(studentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "student-2", classId: "class-new", streamId: "stream-new" }),
      expect.anything(),
    );

    const summary = batch.summary as { totalRequested: number; promotedCount: number; failedCount: number };
    expect(summary.totalRequested).toBe(2);
    expect(summary.promotedCount).toBe(2);
    expect(summary.failedCount).toBe(0);
  });

  it("collects a per-student failure without aborting the rest of the batch (partial-failure policy)", async () => {
    const batch = await service.promoteBatch({
      fromYearId: "year-1",
      toYearId: "year-2",
      promotions: [
        { studentId: "student-1", toClassId: "class-new" },
        { studentId: "student-missing", toClassId: "class-new" },
      ],
      executedBy: "actor-1",
    });

    expect(studentRepository.save).toHaveBeenCalledTimes(1);
    expect(studentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "student-1", classId: "class-new" }),
      expect.anything(),
    );

    const summary = batch.summary as {
      totalRequested: number;
      promotedCount: number;
      failedCount: number;
      failures: { studentId: string; reason: string }[];
    };
    expect(summary.totalRequested).toBe(2);
    expect(summary.promotedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].studentId).toBe("student-missing");
  });

  it("rejects a promotion whose target stream does not belong to the target class", async () => {
    const batch = await service.promoteBatch({
      fromYearId: "year-1",
      toYearId: "year-2",
      promotions: [{ studentId: "student-1", toClassId: "class-new", toStreamId: "stream-wrong" }],
      executedBy: "actor-1",
    });

    expect(studentRepository.save).not.toHaveBeenCalled();
    const summary = batch.summary as { failedCount: number };
    expect(summary.failedCount).toBe(1);
  });

  it("rejects a promotion targeting a nonexistent class", async () => {
    const batch = await service.promoteBatch({
      fromYearId: "year-1",
      toYearId: "year-2",
      promotions: [{ studentId: "student-1", toClassId: "class-missing" }],
      executedBy: "actor-1",
    });
    const summary = batch.summary as { failedCount: number };
    expect(summary.failedCount).toBe(1);
  });

  it("records the std_promotion_batch row with fromYearId/toYearId and publishes PromotionBatchExecutedEvent", async () => {
    await service.promoteBatch({
      fromYearId: "year-1",
      toYearId: "year-2",
      promotions: [{ studentId: "student-1", toClassId: "class-new" }],
      executedBy: "actor-1",
    });

    expect(promotionBatchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ fromYearId: "year-1", toYearId: "year-2" }),
      expect.anything(),
    );
    expect(outboxWriter.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "students.promotion_batch_executed" }),
    );
  });
});
