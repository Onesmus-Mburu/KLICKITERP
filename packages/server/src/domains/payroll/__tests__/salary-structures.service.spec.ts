import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { resolveComponentAmount, SalaryStructuresService } from "../application/salary-structures.service";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";

function makeStructure(overrides: Partial<PyrlSalaryStructureEntity>): PyrlSalaryStructureEntity {
  return {
    id: "struct-1",
    name: "Teaching Grade 3",
    grade: "G3",
    effectiveFrom: "2026-01-01",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlSalaryStructureEntity;
}

function makeLine(overrides: Partial<PyrlStructureComponentEntity>): PyrlStructureComponentEntity {
  return {
    id: "line-1",
    structureId: "struct-1",
    componentId: "cmp-1",
    amount: null,
    formula: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlStructureComponentEntity;
}

describe("resolveComponentAmount (pure)", () => {
  it("FIXED returns the literal amount, independent of basic pay", () => {
    const result = resolveComponentAmount(Money.fromInt(50000), { type: "FIXED", amount: "5000.00" });
    expect(result).toEqual(Money.fromInt(5000));
  });

  it("PERCENT_OF_BASIC multiplies basic pay by the decimal-fraction rate", () => {
    const result = resolveComponentAmount(Money.fromInt(50000), { type: "PERCENT_OF_BASIC", rate: "0.15" });
    expect(result).toEqual(Money.fromInt(7500));
  });
});

describe("SalaryStructuresService", () => {
  let structureRepo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByName: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let lineRepo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByStructureId: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let service: SalaryStructuresService;

  beforeEach(() => {
    structureRepo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(async () => makeStructure({})),
      findByName: jest.fn(),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeStructure(data)),
      save: jest.fn(async (e) => e),
    };
    lineRepo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(async () => makeLine({})),
      findByStructureId: jest.fn(async () => []),
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    service = new SalaryStructuresService(structureRepo as never, lineRepo as never);
  });

  describe("addLine", () => {
    it("accepts a FIXED amount line", async () => {
      const line = await service.addLine(
        "struct-1",
        { componentId: "cmp-1", amount: Money.fromInt(2000) },
        "actor-1",
      );
      expect(line.amount).toEqual(Money.fromInt(2000));
      expect(structureRepo.findByIdOrFail).toHaveBeenCalledWith("struct-1");
    });

    it("accepts a formula line", async () => {
      const line = await service.addLine(
        "struct-1",
        { componentId: "cmp-2", formula: { type: "PERCENT_OF_BASIC", rate: "0.1" } },
        "actor-1",
      );
      expect(line.formula).toEqual({ type: "PERCENT_OF_BASIC", rate: "0.1" });
    });

    it("rejects a line with BOTH amount and formula", async () => {
      await expect(
        service.addLine(
          "struct-1",
          {
            componentId: "cmp-1",
            amount: Money.fromInt(2000),
            formula: { type: "PERCENT_OF_BASIC", rate: "0.1" },
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line with NEITHER amount nor formula", async () => {
      await expect(
        service.addLine("struct-1", { componentId: "cmp-1" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("resolveLineAmount", () => {
    it("resolves a FIXED-amount line via the entity's amount column", () => {
      const line = makeLine({ amount: Money.fromInt(3000), formula: null });
      const result = service.resolveLineAmount(line, Money.fromInt(50000));
      expect(result).toEqual(Money.fromInt(3000));
    });

    it("resolves a formula-driven line via PERCENT_OF_BASIC", () => {
      const line = makeLine({ amount: null, formula: { type: "PERCENT_OF_BASIC", rate: "0.2" } });
      const result = service.resolveLineAmount(line, Money.fromInt(50000));
      expect(result).toEqual(Money.fromInt(10000));
    });

    it("throws when a line has neither amount nor formula (data corruption guard)", () => {
      const line = makeLine({ amount: null, formula: null });
      expect(() => service.resolveLineAmount(line, Money.fromInt(50000))).toThrow(ValidationException);
    });
  });

  it("list()/get() delegate to the structure repository", async () => {
    await service.list();
    expect(structureRepo.list).toHaveBeenCalled();
    await service.get("struct-1");
    expect(structureRepo.findByIdOrFail).toHaveBeenCalledWith("struct-1");
  });

  it("removeLine() checks existence before deleting", async () => {
    await service.removeLine("line-1");
    expect(lineRepo.findByIdOrFail).toHaveBeenCalledWith("line-1");
    expect(lineRepo.delete).toHaveBeenCalledWith("line-1");
  });
});
