import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { CategoriesService } from "../application/categories.service";
import { InvCategoryEntity } from "../domain/inv-category.entity";

function makeCategory(overrides: Partial<InvCategoryEntity> = {}): InvCategoryEntity {
  return { id: "cat-1", name: "General Supplies", parentId: null, ...overrides } as InvCategoryEntity;
}

describe("CategoriesService", () => {
  let categoryRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; listByParent: jest.Mock; listAll: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    categoryRepository = {
      create: jest.fn(async (data) => makeCategory(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeCategory()),
      listByParent: jest.fn(async () => []),
      listAll: jest.fn(async () => []),
    };
    service = new CategoriesService(categoryRepository as never);
  });

  it("creates a root category", async () => {
    const category = await service.create({ name: "General Supplies" }, "actor-1");
    expect(category.name).toBe("General Supplies");
    expect(category.parentId).toBeNull();
  });

  it("validates the parent exists before creating a child", async () => {
    await service.create({ name: "Child", parentId: "cat-1" }, "actor-1");
    expect(categoryRepository.findByIdOrFail).toHaveBeenCalledWith("cat-1");
  });

  it("rejects re-parenting a category to itself", async () => {
    await expect(service.update("cat-1", { parentId: "cat-1" }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
  });

  it("updates name/parent", async () => {
    const updated = await service.update("cat-1", { name: "Renamed" }, "actor-1");
    expect(updated.name).toBe("Renamed");
  });
});
