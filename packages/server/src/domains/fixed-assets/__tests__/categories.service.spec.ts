import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountEntity } from "../../../accounting";
import { CategoriesService } from "../application/categories.service";
import { FaCategoryEntity } from "../domain/fa-category.entity";

function makeCategory(overrides: Partial<FaCategoryEntity> = {}): FaCategoryEntity {
  return {
    id: "cat-1",
    name: "Furniture & Fittings",
    method: "SL",
    lifeMonths: 60,
    rate: null,
    residualPct: "0.0000",
    glCostAccountId: "cost-acc",
    glAccumDepAccountId: "accumdep-acc",
    glDepExpenseAccountId: "depexp-acc",
    ...overrides,
  } as FaCategoryEntity;
}

describe("CategoriesService", () => {
  let categoryRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let glAccountRepository: { findByIdOrFail: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    categoryRepository = {
      create: jest.fn(async (data) => makeCategory(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeCategory()),
      list: jest.fn(async () => []),
    };
    glAccountRepository = { findByIdOrFail: jest.fn(async (id: string) => ({ id }) as GlAccountEntity) };
    service = new CategoriesService(categoryRepository as never, glAccountRepository as never);
  });

  describe("create", () => {
    const validInput = {
      name: "IT Equipment",
      method: "SL" as const,
      lifeMonths: 36,
      glCostAccountId: "cost-1",
      glAccumDepAccountId: "accumdep-1",
      glDepExpenseAccountId: "depexp-1",
    };

    it("requires all 3 GL accounts to actually exist", async () => {
      await service.create(validInput, "user-1");
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("cost-1");
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("accumdep-1");
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("depexp-1");
    });

    it("rejects residual_pct outside [0,1]", async () => {
      await expect(service.create({ ...validInput, residualPct: "1.5000" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
      await expect(service.create({ ...validInput, residualPct: "-0.1000" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts residual_pct at the boundaries 0 and 1", async () => {
      await expect(service.create({ ...validInput, residualPct: "0.0000" }, "user-1")).resolves.toBeDefined();
      await expect(service.create({ ...validInput, residualPct: "1.0000" }, "user-1")).resolves.toBeDefined();
    });

    it("requires rate > 0 when method='RB'", async () => {
      await expect(service.create({ ...validInput, method: "RB" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
      await expect(service.create({ ...validInput, method: "RB", rate: "0" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
      await expect(service.create({ ...validInput, method: "RB", rate: "0.200000" }, "user-1")).resolves.toBeDefined();
    });

    it("rejects life_months <= 0", async () => {
      await expect(service.create({ ...validInput, lifeMonths: 0 }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("defaults residual_pct to 0 when omitted", async () => {
      await service.create(validInput, "user-1");
      expect(categoryRepository.create).toHaveBeenCalledWith(expect.objectContaining({ residualPct: "0.0000" }));
    });
  });

  describe("update", () => {
    it("re-validates rate requirement when method flips to RB", async () => {
      categoryRepository.findByIdOrFail.mockResolvedValue(makeCategory({ method: "SL", rate: null }));
      await expect(service.update("cat-1", { method: "RB" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
