import { FeeCategoriesService } from "../application/fee-categories.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";

function makeCategory(overrides: Partial<BillFeeCategoryEntity>): BillFeeCategoryEntity {
  return {
    id: "cat-1",
    name: "Tuition",
    glIncomeAccountId: "acc-income-1",
    taxable: false,
    isActive: true,
    priority: 0,
    ...overrides,
  } as BillFeeCategoryEntity;
}

describe("FeeCategoriesService", () => {
  let feeCategoryRepository: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let glAccountRepository: { findByIdOrFail: jest.Mock };
  let service: FeeCategoriesService;

  beforeEach(() => {
    feeCategoryRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeCategory({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeCategory(data)),
      save: jest.fn(async (e) => e),
    };
    glAccountRepository = { findByIdOrFail: jest.fn(async (id: string) => ({ id })) };
    service = new FeeCategoriesService(feeCategoryRepository as never, glAccountRepository as never);
  });

  describe("create", () => {
    it("rejects a duplicate name", async () => {
      feeCategoryRepository.findByName.mockResolvedValue(makeCategory({}));
      await expect(
        service.create({ name: "Tuition", glIncomeAccountId: "acc-1" }, "actor-1"),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("validates the gl_income_account_id resolves to a real account", async () => {
      await service.create({ name: "Transport", glIncomeAccountId: "acc-2" }, "actor-1");
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("acc-2");
      expect(feeCategoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Transport", glIncomeAccountId: "acc-2", isActive: true }),
      );
    });
  });

  describe("update", () => {
    it("re-validates a changed gl_income_account_id", async () => {
      await service.update("cat-1", { glIncomeAccountId: "acc-3" }, "actor-1");
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("acc-3");
      expect(feeCategoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ glIncomeAccountId: "acc-3" }),
      );
    });
  });

  describe("deactivate/activate", () => {
    it("toggles is_active", async () => {
      const deactivated = await service.deactivate("cat-1", "actor-1");
      expect(deactivated.isActive).toBe(false);
      const activated = await service.activate("cat-1", "actor-1");
      expect(activated.isActive).toBe(true);
    });
  });
});
