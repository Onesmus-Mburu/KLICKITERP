import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StatutoryTablesService } from "../application/statutory-tables.service";
import { PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";

function makeTable(overrides: Partial<PyrlStatutoryTableEntity>): PyrlStatutoryTableEntity {
  return {
    id: "table-1",
    kind: "PAYE",
    effectiveFrom: "2026-01-01",
    params: { bands: [] },
    sourceNote: "note",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlStatutoryTableEntity;
}

describe("StatutoryTablesService", () => {
  let repo: {
    findByIdOrFail: jest.Mock;
    listByKind: jest.Mock;
    findEffectiveFor: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: StatutoryTablesService;

  beforeEach(() => {
    repo = {
      findByIdOrFail: jest.fn(async () => makeTable({})),
      listByKind: jest.fn(async () => []),
      findEffectiveFor: jest.fn(),
      create: jest.fn(async (data) => makeTable(data)),
      save: jest.fn(async (e) => e),
    };
    service = new StatutoryTablesService(repo as never);
  });

  it("create() persists kind/effectiveFrom/params/sourceNote", async () => {
    const row = await service.create(
      { kind: "PAYE", effectiveFrom: "2026-01-01", params: { bands: [] }, sourceNote: "seed" },
      "actor-1",
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "PAYE", effectiveFrom: "2026-01-01", sourceNote: "seed" }),
    );
    expect(row.kind).toBe("PAYE");
  });

  it("update() only touches params/sourceNote", async () => {
    await service.update("table-1", { sourceNote: "revised" }, "actor-1");
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ sourceNote: "revised", updatedBy: "actor-1" }),
    );
  });

  describe("findEffectiveFor", () => {
    it("returns the row delegated from the repository", async () => {
      const row = makeTable({ kind: "NSSF" });
      repo.findEffectiveFor.mockResolvedValue(row);
      const result = await service.findEffectiveFor("NSSF", "2026-07-31");
      expect(result).toBe(row);
      expect(repo.findEffectiveFor).toHaveBeenCalledWith("NSSF", "2026-07-31");
    });

    it("BR-PYRL-01: throws a named NotFoundException when no row is effective", async () => {
      repo.findEffectiveFor.mockResolvedValue(null);
      await expect(service.findEffectiveFor("AHL", "2026-07-31")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.findEffectiveFor("AHL", "2026-07-31")).rejects.toThrow(/BR-PYRL-01/);
    });
  });
});
