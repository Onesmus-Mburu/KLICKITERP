import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { AssetsService } from "../application/assets.service";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaCategoryEntity } from "../domain/fa-category.entity";

function makeAsset(overrides: Partial<FaAssetEntity> = {}): FaAssetEntity {
  return {
    id: "asset-1",
    code: "AST-0001",
    name: "Boardroom Table",
    categoryId: "cat-1",
    cost: Money.fromDecimalString("50000.00"),
    residualValue: Money.fromDecimalString("5000.00"),
    accumDepreciation: Money.ZERO,
    status: "ACTIVE",
    condition: "GOOD",
    ...overrides,
  } as FaAssetEntity;
}

function makeCategory(overrides: Partial<FaCategoryEntity> = {}): FaCategoryEntity {
  return { id: "cat-1", residualPct: "0.1000", ...overrides } as FaCategoryEntity;
}

describe("AssetsService", () => {
  let assetRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByCode: jest.Mock;
    findByBarcode: jest.Mock;
    searchByCodeOrBarcode: jest.Mock;
    list: jest.Mock;
  };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let service: AssetsService;

  beforeEach(() => {
    assetRepository = {
      create: jest.fn(async (data) => makeAsset(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeAsset()),
      findByCode: jest.fn(async () => null),
      findByBarcode: jest.fn(async () => null),
      searchByCodeOrBarcode: jest.fn(async () => []),
      list: jest.fn(async () => []),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    service = new AssetsService(assetRepository as never, categoryRepository as never);
  });

  const baseInput = {
    code: "AST-0002",
    name: "Laptop",
    categoryId: "cat-1",
    location: "IT Office",
    acquisitionDate: "2026-01-01",
    cost: Money.fromDecimalString("60000.00"),
    fundingSource: "SCHOOL" as const,
    inServiceFrom: "2026-01-01",
  };

  describe("create", () => {
    it("derives residual_value from category.residual_pct × cost when not explicitly given", async () => {
      await service.create(baseInput, "user-1");
      expect(assetRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ residualValue: Money.fromDecimalString("6000.00") }), // 60000 * 0.10
      );
    });

    it("respects an explicit residual_value override", async () => {
      await service.create({ ...baseInput, residualValue: Money.fromDecimalString("1000.00") }, "user-1");
      expect(assetRepository.create).toHaveBeenCalledWith(expect.objectContaining({ residualValue: Money.fromDecimalString("1000.00") }));
    });

    it("rejects cost <= 0", async () => {
      await expect(service.create({ ...baseInput, cost: Money.ZERO }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects residual_value exceeding cost", async () => {
      await expect(
        service.create({ ...baseInput, residualValue: Money.fromDecimalString("70000.00") }, "user-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("defaults status='ACTIVE' and condition='GOOD'", async () => {
      await service.create(baseInput, "user-1");
      expect(assetRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE", condition: "GOOD" }));
    });
  });

  describe("updateCondition", () => {
    it("updates only condition, composable inside a caller-supplied transaction", async () => {
      const em = {} as never;
      await service.updateCondition("asset-1", "POOR", "user-1", em);
      expect(assetRepository.findByIdOrFail).toHaveBeenCalledWith("asset-1", em);
      expect(assetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ condition: "POOR" }), em);
    });
  });
});
