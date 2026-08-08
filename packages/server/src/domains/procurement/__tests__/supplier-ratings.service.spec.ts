import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { SupplierRatingsService } from "../application/supplier-ratings.service";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";

function makeSupplier(overrides: Partial<ProcSupplierEntity> = {}): ProcSupplierEntity {
  return {
    id: "supplier-1",
    name: "Acme",
    status: "ACTIVE",
    ratingDelivery: null,
    ratingQuality: null,
    ratingManual: null,
    ...overrides,
  } as ProcSupplierEntity;
}

function makePo(overrides: Partial<ProcPurchaseOrderEntity> = {}): ProcPurchaseOrderEntity {
  return { id: "po-1", supplierId: "supplier-1", ...overrides } as ProcPurchaseOrderEntity;
}

function makeGrn(overrides: Partial<ProcGrnEntity> = {}): ProcGrnEntity {
  return { id: "grn-1", poId: "po-1", ...overrides } as ProcGrnEntity;
}

function makeGrnLine(overrides: Partial<ProcGrnLineEntity>): ProcGrnLineEntity {
  return { id: "grnline-1", grnId: "grn-1", receivedQty: "10.0000", rejectedQty: "0.0000", ...overrides } as ProcGrnLineEntity;
}

describe("SupplierRatingsService", () => {
  let supplierRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let poRepository: { list: jest.Mock };
  let grnRepository: { findByPoId: jest.Mock };
  let grnLineRepository: { findByGrnId: jest.Mock };
  let service: SupplierRatingsService;

  beforeEach(() => {
    supplierRepository = {
      findByIdOrFail: jest.fn(async () => makeSupplier()),
      save: jest.fn(async (e) => e),
    };
    poRepository = { list: jest.fn(async () => [makePo()]) };
    grnRepository = { findByPoId: jest.fn(async () => [makeGrn()]) };
    grnLineRepository = { findByGrnId: jest.fn(async () => []) };
    service = new SupplierRatingsService(supplierRepository as never, poRepository as never, grnRepository as never, grnLineRepository as never);
  });

  describe("computeAutoMetrics", () => {
    it("leaves rating_delivery untouched — no expected-delivery-date column exists to compute it from", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([makeGrnLine({ receivedQty: "10", rejectedQty: "1" })]);
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingDelivery).toBeNull();
    });

    it("leaves rating_quality untouched when zero quantity was ever received (nothing to compute a rate from)", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([]);
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingQuality).toBeNull();
    });

    it("0% rejection rate -> quality score 5.00", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([makeGrnLine({ receivedQty: "100", rejectedQty: "0" })]);
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingQuality).toBe("5.00");
    });

    it("20% rejection rate -> quality score 4.00 (5 - 20/20)", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([makeGrnLine({ receivedQty: "100", rejectedQty: "20" })]);
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingQuality).toBe("4.00");
    });

    it("clamps a very high rejection rate to a floor of 1.00, never 0 or negative", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([makeGrnLine({ receivedQty: "100", rejectedQty: "100" })]);
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingQuality).toBe("1.00");
    });

    it("aggregates rejection/received quantities across every PO/GRN/line for the supplier", async () => {
      poRepository.list.mockResolvedValue([makePo({ id: "po-1" }), makePo({ id: "po-2" })]);
      grnRepository.findByPoId.mockImplementation(async (poId: string) => [makeGrn({ id: `grn-${poId}`, poId })]);
      grnLineRepository.findByGrnId.mockImplementation(async (grnId: string) =>
        grnId === "grn-po-1" ? [makeGrnLine({ receivedQty: "50", rejectedQty: "0" })] : [makeGrnLine({ receivedQty: "50", rejectedQty: "10" })],
      );
      // total received=100, total rejected=10 -> 10% rejection -> score 5 - 10/20 = 4.5
      const result = await service.computeAutoMetrics("supplier-1", "actor-1");
      expect(result.ratingQuality).toBe("4.50");
    });
  });

  describe("setManualRating", () => {
    it("rejects a score below 1", async () => {
      await expect(service.setManualRating("supplier-1", 0)).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a score above 5", async () => {
      await expect(service.setManualRating("supplier-1", 6)).rejects.toBeInstanceOf(ValidationException);
    });

    it("sets a valid 1-5 score", async () => {
      const result = await service.setManualRating("supplier-1", 3.5, "actor-1");
      expect(result.ratingManual).toBe("3.50");
    });
  });
});
