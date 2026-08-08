import { ComponentsService } from "../application/components.service";
import { PyrlComponentEntity } from "../domain/pyrl-component.entity";

function makeComponent(overrides: Partial<PyrlComponentEntity>): PyrlComponentEntity {
  return {
    id: "cmp-1",
    code: "BASIC",
    name: "Basic Pay",
    kind: "EARNING",
    isTaxable: true,
    isStatutory: false,
    glAccountId: "gl-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlComponentEntity;
}

describe("ComponentsService", () => {
  let repo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByCode: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: ComponentsService;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(async () => makeComponent({})),
      findByCode: jest.fn(),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeComponent(data)),
      save: jest.fn(async (e) => e),
    };
    service = new ComponentsService(repo as never);
  });

  it("create() defaults isStatutory to false when omitted", async () => {
    const row = await service.create(
      { code: "HOUSE", name: "House Allowance", kind: "EARNING", isTaxable: true, glAccountId: "gl-2" },
      "actor-1",
    );
    expect(row.isStatutory).toBe(false);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ code: "HOUSE", createdBy: "actor-1" }));
  });

  it("create() honors an explicit isStatutory flag", async () => {
    const row = await service.create(
      { code: "PAYE", name: "PAYE", kind: "DEDUCTION", isTaxable: false, isStatutory: true, glAccountId: "gl-3" },
      "actor-1",
    );
    expect(row.isStatutory).toBe(true);
  });

  it("update() only mutates the fields provided", async () => {
    repo.findByIdOrFail.mockResolvedValue(makeComponent({ name: "Old Name" }));
    const row = await service.update("cmp-1", { name: "New Name" }, "actor-2");
    expect(row.name).toBe("New Name");
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: "New Name", updatedBy: "actor-2" }));
  });

  it("getByCode() delegates to the repository", async () => {
    repo.findByCode.mockResolvedValue(makeComponent({}));
    const row = await service.getByCode("BASIC");
    expect(repo.findByCode).toHaveBeenCalledWith("BASIC");
    expect(row?.code).toBe("BASIC");
  });

  it("list() delegates the filter to the repository", async () => {
    await service.list({ kind: "EARNING" });
    expect(repo.list).toHaveBeenCalledWith({ kind: "EARNING" });
  });
});
