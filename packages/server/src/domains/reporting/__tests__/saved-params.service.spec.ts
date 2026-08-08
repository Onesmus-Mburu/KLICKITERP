import { SavedParamsService } from "../application/saved-params.service";
import { RptSavedParamsEntity } from "../domain/rpt-saved-params.entity";
import { RptSavedParamsRepository } from "../infrastructure/rpt-saved-params.repository";

function makeRow(overrides: Partial<RptSavedParamsEntity> = {}): RptSavedParamsEntity {
  return {
    id: "saved-1",
    userId: "user-1",
    reportCode: "trial-balance",
    name: "My Saved Filter",
    params: { periodId: "period-1" },
    ...overrides,
  } as RptSavedParamsEntity;
}

describe("SavedParamsService", () => {
  let repository: {
    create: jest.Mock;
    findByIdOrFail: jest.Mock;
    listByUser: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let service: SavedParamsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(async (data) => ({ id: "saved-1", ...data })),
      findByIdOrFail: jest.fn(),
      listByUser: jest.fn(async () => []),
      save: jest.fn(async (row) => row),
      delete: jest.fn(async () => undefined),
    };
    service = new SavedParamsService(repository as unknown as RptSavedParamsRepository);
  });

  it("create() forwards the input shape to the repository", async () => {
    await service.create({ userId: "user-1", reportCode: "trial-balance", name: "My Filter", params: { periodId: "p1" } });
    expect(repository.create).toHaveBeenCalledWith({
      userId: "user-1",
      reportCode: "trial-balance",
      name: "My Filter",
      params: { periodId: "p1" },
    });
  });

  it("get() returns the row when the caller owns it", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow());
    const row = await service.get("saved-1", "user-1");
    expect(row.id).toBe("saved-1");
  });

  it("get() throws NotFoundException when the row belongs to a different user", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow({ userId: "someone-else" }));
    await expect(service.get("saved-1", "user-1")).rejects.toThrow(/not found/i);
  });

  it("update() mutates name/params only for the owning user and persists via save()", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow());
    const updated = await service.update("saved-1", "user-1", { name: "Renamed", params: { periodId: "p2" } });
    expect(updated.name).toBe("Renamed");
    expect(updated.params).toEqual({ periodId: "p2" });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
  });

  it("update() throws NotFoundException for a non-owning user and never calls save()", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow({ userId: "someone-else" }));
    await expect(service.update("saved-1", "user-1", { name: "Renamed" })).rejects.toThrow(/not found/i);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("delete() removes the row for the owning user", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow());
    await service.delete("saved-1", "user-1");
    expect(repository.delete).toHaveBeenCalledWith("saved-1");
  });

  it("delete() throws NotFoundException for a non-owning user and never deletes", async () => {
    repository.findByIdOrFail.mockResolvedValue(makeRow({ userId: "someone-else" }));
    await expect(service.delete("saved-1", "user-1")).rejects.toThrow(/not found/i);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("listMine() delegates to repository.listByUser()", async () => {
    await service.listMine("user-1");
    expect(repository.listByUser).toHaveBeenCalledWith("user-1");
  });
});
