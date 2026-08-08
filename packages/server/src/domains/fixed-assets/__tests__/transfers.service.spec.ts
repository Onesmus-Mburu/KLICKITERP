import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { TransfersService } from "../application/transfers.service";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaTransferEntity } from "../domain/fa-transfer.entity";

function makeAsset(overrides: Partial<FaAssetEntity> = {}): FaAssetEntity {
  return { id: "asset-1", location: "Main Store", custodianUserId: "user-A", ...overrides } as FaAssetEntity;
}

function makeTransfer(overrides: Partial<FaTransferEntity> = {}): FaTransferEntity {
  return {
    id: "transfer-1",
    assetId: "asset-1",
    fromLocation: "Main Store",
    fromCustodianUserId: "user-A",
    toLocation: "IT Office",
    toCustodianUserId: "user-B",
    ackBy: null,
    at: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  } as FaTransferEntity;
}

describe("TransfersService", () => {
  let transferRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findByAssetId: jest.Mock };
  let assetRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let service: TransfersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    transferRepository = {
      create: jest.fn(async (data) => makeTransfer(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeTransfer()),
      findByAssetId: jest.fn(async () => []),
    };
    assetRepository = {
      findByIdOrFail: jest.fn(async () => makeAsset()),
      save: jest.fn(async (e) => e),
    };
    service = new TransfersService(transferRepository as never, assetRepository as never);
  });

  describe("create", () => {
    it("captures from_location/from_custodian from the asset's CURRENT values BEFORE updating it", async () => {
      await service.create(em, { assetId: "asset-1", toLocation: "IT Office", toCustodianUserId: "user-B" }, "user-1");

      expect(transferRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fromLocation: "Main Store",
          fromCustodianUserId: "user-A",
          toLocation: "IT Office",
          toCustodianUserId: "user-B",
        }),
        em,
      );
      expect(assetRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ location: "IT Office", custodianUserId: "user-B" }),
        em,
      );
    });

    it("allows unassigning the custodian (toCustodianUserId omitted -> null)", async () => {
      await service.create(em, { assetId: "asset-1", toLocation: "Library" }, "user-1");
      expect(assetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ custodianUserId: null }), em);
    });
  });

  describe("acknowledge", () => {
    it("sets ack_by on a not-yet-acknowledged transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ ackBy: null }));
      const result = await service.acknowledge(em, "transfer-1", "user-B");
      expect(result.ackBy).toBe("user-B");
    });

    it("rejects re-acknowledging an already-acknowledged transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ ackBy: "user-B" }));
      await expect(service.acknowledge(em, "transfer-1", "user-B")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
