import { DataSource, EntityManager } from "typeorm";
import { BulkAllocationService } from "../application/bulk-allocation.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayBulkAllocationBatchEntity } from "../domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "../domain/pay-bulk-allocation-batch-line.entity";

const BANK_ACCOUNT_ID = "019f8b20-6d42-7455-a925-1b8ee37d7b67";

function makeBatch(overrides: Partial<PayBulkAllocationBatchEntity>): PayBulkAllocationBatchEntity {
  return {
    id: "batch-1",
    instrument: { source: "bank-statement" },
    total: Money.fromInt(1500),
    status: "DRAFT",
    createdReceipts: 0,
    bankAccountId: BANK_ACCOUNT_ID,
    ...overrides,
  } as PayBulkAllocationBatchEntity;
}

function makeLine(overrides: Partial<PayBulkAllocationBatchLineEntity>): PayBulkAllocationBatchLineEntity {
  return {
    id: "line-1",
    batchId: "batch-1",
    studentId: "student-1",
    amount: Money.fromInt(500),
    receiptId: null,
    ...overrides,
  } as PayBulkAllocationBatchLineEntity;
}

describe("BulkAllocationService", () => {
  let batchRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let lineRepository: { create: jest.Mock; listByBatch: jest.Mock; save: jest.Mock };
  let studentRepository: { findByAdmissionNo: jest.Mock; findByIdOrFail: jest.Mock };
  let suspenseRepository: { create: jest.Mock };
  let receiptsService: { captureReceipt: jest.Mock };
  let dataSource: DataSource;
  let service: BulkAllocationService;

  beforeEach(() => {
    batchRepository = {
      create: jest.fn(async (data) => makeBatch(data)),
      findByIdOrFail: jest.fn(async () => makeBatch({})),
      save: jest.fn(async (e) => e),
    };
    lineRepository = {
      create: jest.fn(async (data) => makeLine(data)),
      listByBatch: jest.fn(async () => [makeLine({})]),
      save: jest.fn(async (e) => e),
    };
    studentRepository = {
      findByAdmissionNo: jest.fn(async (admissionNo: string) => ({ id: `student-${admissionNo}`, firstName: "A", lastName: "B" })),
      findByIdOrFail: jest.fn(async (id: string) => ({ id, firstName: "A", lastName: "B" })),
    };
    suspenseRepository = { create: jest.fn(async (data) => ({ id: "suspense-1", ...data })) };
    receiptsService = { captureReceipt: jest.fn(async () => ({ id: "receipt-1", number: "PAY-000001" })) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work({} as EntityManager)),
    } as unknown as DataSource;

    service = new BulkAllocationService(
      batchRepository as never,
      lineRepository as never,
      studentRepository as never,
      suspenseRepository as never,
      receiptsService as never,
      dataSource,
    );
  });

  describe("createBatch", () => {
    it("rejects an empty lines array", async () => {
      await expect(service.createBatch({}, [], BANK_ACCOUNT_ID, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive line amount", async () => {
      await expect(
        service.createBatch({}, [{ admissionNo: "ADM1", amount: Money.ZERO }], BANK_ACCOUNT_ID, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects up front, listing every unresolved admission number, without creating a batch", async () => {
      studentRepository.findByAdmissionNo.mockImplementation(async (admissionNo: string) =>
        admissionNo === "ADM1" ? { id: "student-1" } : null,
      );

      await expect(
        service.createBatch(
          {},
          [
            { admissionNo: "ADM1", amount: Money.fromInt(100) },
            { admissionNo: "ADM-MISSING", amount: Money.fromInt(200) },
          ],
          BANK_ACCOUNT_ID,
          "initiator-1",
        ),
      ).rejects.toThrow(/ADM-MISSING/);
      expect(batchRepository.create).not.toHaveBeenCalled();
    });

    it("creates a DRAFT batch with one resolved line per admission number, total summed, and the real bankAccountId", async () => {
      const batch = await service.createBatch(
        {},
        [
          { admissionNo: "ADM1", amount: Money.fromInt(500) },
          { admissionNo: "ADM2", amount: Money.fromInt(1000) },
        ],
        BANK_ACCOUNT_ID,
        "initiator-1",
      );

      expect(batch.status).toBe("DRAFT");
      expect(batchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "DRAFT", total: Money.fromInt(1500), createdReceipts: 0, bankAccountId: BANK_ACCOUNT_ID }),
        expect.anything(),
      );
      expect(lineRepository.create).toHaveBeenCalledTimes(2);
      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: "student-ADM1", amount: Money.fromInt(500), receiptId: null }),
        expect.anything(),
      );
      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: "student-ADM2", amount: Money.fromInt(1000), receiptId: null }),
        expect.anything(),
      );
    });
  });

  describe("matchAndPost", () => {
    it("rejects a batch that is not DRAFT/MATCHING", async () => {
      batchRepository.findByIdOrFail.mockResolvedValueOnce(makeBatch({ status: "COMPLETED" }));
      await expect(service.matchAndPost("batch-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("captures a receipt per unprocessed line and completes the batch when every line succeeds", async () => {
      lineRepository.listByBatch.mockResolvedValueOnce([
        makeLine({ id: "line-1", studentId: "student-1", amount: Money.fromInt(500) }),
        makeLine({ id: "line-2", studentId: "student-2", amount: Money.fromInt(1000) }),
      ]);

      const batch = await service.matchAndPost("batch-1", "initiator-1");

      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(2);
      expect(lineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", receiptId: "receipt-1" }), expect.anything());
      expect(lineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "line-2", receiptId: "receipt-1" }), expect.anything());
      expect(batch.status).toBe("COMPLETED");
      expect(batch.createdReceipts).toBe(2);
      expect(suspenseRepository.create).not.toHaveBeenCalled();
    });

    it("captures every line's BANK_TRANSFER split against the batch's own real bankAccountId, and a short externalRef (line.id alone) — the real Slice 6 bug fix", async () => {
      lineRepository.listByBatch.mockResolvedValueOnce([
        makeLine({ id: "line-1", studentId: "student-1", amount: Money.fromInt(500) }),
      ]);

      await service.matchAndPost("batch-1", "initiator-1");

      expect(receiptsService.captureReceipt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          splits: [
            expect.objectContaining({
              method: "BANK_TRANSFER",
              // The real fix: a real uuid FK (batch.bankAccountId), never
              // the old fabricated `bulk-batch-${batchId}` non-UUID string.
              bankAccountId: BANK_ACCOUNT_ID,
              // The real fix: line.id alone (36 chars), never the old
              // `bulk-batch-${batchId}-line-${line.id}` (~89 chars) that
              // overflowed pay_receipt_split.external_ref's varchar(60).
              externalRef: "line-1",
            }),
          ],
        }),
      );
    });

    it("skips (does not reprocess) a line that already has a receiptId — safe to re-run", async () => {
      lineRepository.listByBatch.mockResolvedValueOnce([makeLine({ id: "line-1", receiptId: "already-matched-receipt" })]);

      const batch = await service.matchAndPost("batch-1", "initiator-1");

      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
      expect(batch.status).toBe("COMPLETED");
      expect(batch.createdReceipts).toBe(1);
    });

    it("parks a failed line's amount in suspense (source BANK) without aborting the rest of the batch", async () => {
      lineRepository.listByBatch.mockResolvedValueOnce([
        makeLine({ id: "line-ok", studentId: "student-1", amount: Money.fromInt(500) }),
        makeLine({ id: "line-fails", studentId: "student-2", amount: Money.fromInt(1000) }),
      ]);
      receiptsService.captureReceipt.mockImplementationOnce(async () => ({ id: "receipt-1", number: "PAY-000001" }));
      receiptsService.captureReceipt.mockImplementationOnce(async () => {
        throw new Error("GL configuration error: no clearing account seeded");
      });

      const batch = await service.matchAndPost("batch-1", "initiator-1");

      expect(suspenseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "BANK",
          amount: Money.fromInt(1000),
          // Real fix: line.id alone, never the old ~89-char fabricated
          // string that overflowed pay_suspense_item.external_ref's own
          // varchar(60) — the exact reason the Slice 6 bug's own "gracefully
          // park to suspense" fallback never actually caught anything.
          externalRef: "line-fails",
        }),
      );
      expect(batch.status).toBe("FAILED");
      // The failing line contributes no receipt, but the succeeding line's is still counted.
      expect(batch.createdReceipts).toBe(1);
    });
  });
});
