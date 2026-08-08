import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { SuppliersService } from "../application/suppliers.service";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";

function makeSupplier(overrides: Partial<ProcSupplierEntity>): ProcSupplierEntity {
  return {
    id: "supplier-1",
    name: "Acme Supplies",
    tradingName: null,
    kraPin: null,
    contacts: {},
    paymentDetails: {},
    categories: [],
    paymentTermsDays: 30,
    status: "ACTIVE",
    blacklistReason: null,
    ratingDelivery: null,
    ratingQuality: null,
    ratingManual: null,
    ...overrides,
  } as ProcSupplierEntity;
}

describe("SuppliersService", () => {
  let supplierRepository: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    searchByName: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: SuppliersService;

  beforeEach(() => {
    supplierRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(),
      list: jest.fn(async () => []),
      searchByName: jest.fn(async () => []),
      create: jest.fn(async (data) => makeSupplier(data)),
      save: jest.fn(async (e) => e),
    };
    service = new SuppliersService(supplierRepository as never);
  });

  describe("create", () => {
    it("rejects a duplicate name", async () => {
      supplierRepository.findByName.mockResolvedValue(makeSupplier({}));
      await expect(service.create({ name: "Acme Supplies" }, "actor-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("defaults status=ACTIVE, paymentTermsDays=30, empty jsonb/array columns", async () => {
      await service.create({ name: "New Supplier" }, "actor-1");
      expect(supplierRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Supplier",
          status: "ACTIVE",
          paymentTermsDays: 30,
          contacts: {},
          paymentDetails: {},
          categories: [],
          blacklistReason: null,
        }),
      );
    });
  });

  describe("search", () => {
    it("delegates to ProcSupplierRepository.searchByName", async () => {
      await service.search("acme", 10);
      expect(supplierRepository.searchByName).toHaveBeenCalledWith("acme", 10);
    });
  });

  describe("update", () => {
    it("rejects renaming to an already-used name", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ name: "Old Name" }));
      supplierRepository.findByName.mockResolvedValue(makeSupplier({ id: "other-supplier", name: "Taken" }));
      await expect(service.update("supplier-1", { name: "Taken" }, "actor-1")).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("blacklist", () => {
    it("rejects an already-BLACKLISTED supplier", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "BLACKLISTED" }));
      await expect(service.blacklist("supplier-1", "fraud", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an empty reason", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "ACTIVE" }));
      await expect(service.blacklist("supplier-1", "  ", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("sets status=BLACKLISTED and records the reason", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "ACTIVE" }));
      const result = await service.blacklist("supplier-1", "Repeated late deliveries", "actor-1");
      expect(result.status).toBe("BLACKLISTED");
      expect(result.blacklistReason).toBe("Repeated late deliveries");
    });
  });

  describe("reactivate", () => {
    it("rejects a supplier that is not BLACKLISTED", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "ACTIVE" }));
      await expect(service.reactivate("supplier-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("sets status=ACTIVE and clears blacklist_reason", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(
        makeSupplier({ status: "BLACKLISTED", blacklistReason: "fraud" }),
      );
      const result = await service.reactivate("supplier-1", "actor-1");
      expect(result.status).toBe("ACTIVE");
      expect(result.blacklistReason).toBeNull();
    });
  });
});
