import { DataSource, EntityManager } from "typeorm";
import { BulkBillingService } from "../application/bulk-billing.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";

describe("BulkBillingService", () => {
  let studentRepository: { list: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let dataSource: DataSource;
  let service: BulkBillingService;

  beforeEach(() => {
    // Phase 6 Slice 2c — StdStudentRepository.list() now returns [items, total]
    // (real server-side pagination); every mock below resolves the tuple shape.
    studentRepository = { list: jest.fn(async () => [[], 0]) };
    invoicingService = {
      generateInvoice: jest.fn(async (_em, input) => ({ id: `invoice-${input.studentId}` })),
      postInvoice: jest.fn(async () => undefined),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new BulkBillingService(dataSource, studentRepository as never, invoicingService as never);
  });

  it("bills every ACTIVE student when no filter is given", async () => {
    studentRepository.list.mockResolvedValue([[{ id: "s1" }, { id: "s2" }], 2]);

    const result = await service.bulkGenerate("term-1", {}, "initiator-1");

    expect(studentRepository.list).toHaveBeenCalledWith({ status: "ACTIVE" });
    expect(result.succeeded).toEqual(["s1", "s2"]);
    expect(result.failed).toEqual([]);
    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
    expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
  });

  it("filters by classIds, unioning across multiple classes", async () => {
    studentRepository.list.mockImplementation(async (filter: { classId?: string }) => {
      if (filter.classId === "class-1") return [[{ id: "s1" }], 1];
      if (filter.classId === "class-2") return [[{ id: "s2" }], 1];
      return [[], 0];
    });

    const result = await service.bulkGenerate("term-1", { classIds: ["class-1", "class-2"] }, "initiator-1");

    expect(result.succeeded.sort()).toEqual(["s1", "s2"]);
  });

  it("further narrows a classIds filter by streamIds", async () => {
    studentRepository.list.mockResolvedValue([
      [
        { id: "s1", streamId: "stream-A" },
        { id: "s2", streamId: "stream-B" },
      ],
      2,
    ]);

    const result = await service.bulkGenerate(
      "term-1",
      { classIds: ["class-1"], streamIds: ["stream-A"] },
      "initiator-1",
    );

    expect(result.succeeded).toEqual(["s1"]);
  });

  it("one student's failure is recorded without aborting the batch (BR-BILL-04 re-run idempotency)", async () => {
    studentRepository.list.mockResolvedValue([[{ id: "s1" }, { id: "s2" }, { id: "s3" }], 3]);
    invoicingService.generateInvoice.mockImplementation(async (_em, input) => {
      if (input.studentId === "s2") {
        throw new ConflictException("BR-BILL-04: already billed");
      }
      return { id: `invoice-${input.studentId}` };
    });

    const result = await service.bulkGenerate("term-1", {}, "initiator-1");

    expect(result.succeeded.sort()).toEqual(["s1", "s3"]);
    expect(result.failed).toEqual([{ studentId: "s2", error: "BR-BILL-04: already billed" }]);
  });

  it("a postInvoice() failure is also captured per-student", async () => {
    studentRepository.list.mockResolvedValue([[{ id: "s1" }], 1]);
    invoicingService.postInvoice.mockRejectedValue(new Error("no active postable AR_STUDENT account"));

    const result = await service.bulkGenerate("term-1", {}, "initiator-1");

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{ studentId: "s1", error: "no active postable AR_STUDENT account" }]);
  });
});
