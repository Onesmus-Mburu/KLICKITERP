import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { EmployeeComponentsService } from "../application/employee-components.service";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";

function makeOverride(overrides: Partial<PyrlEmployeeComponentEntity>): PyrlEmployeeComponentEntity {
  return {
    id: "override-1",
    employeeId: "emp-1",
    componentId: "cmp-1",
    amount: Money.fromInt(2000),
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlEmployeeComponentEntity;
}

describe("EmployeeComponentsService", () => {
  let repo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByEmployeeId: jest.Mock;
    findActiveFor: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: EmployeeComponentsService;
  const em = {} as EntityManager;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findByEmployeeId: jest.fn(async () => []),
      findActiveFor: jest.fn(),
      create: jest.fn(async (data) => makeOverride(data)),
      save: jest.fn(async (e) => e),
    };
    service = new EmployeeComponentsService(repo as never);
  });

  describe("add", () => {
    it("creates an override row via the repository", async () => {
      const row = await service.add(em, {
        employeeId: "emp-1",
        componentId: "cmp-1",
        amount: Money.fromInt(1500),
        effectiveFrom: "2026-01-01",
      });
      expect(row.amount).toEqual(Money.fromInt(1500));
    });

    it("translates a 23P01 exclusion_violation into a ConflictException", async () => {
      repo.create.mockRejectedValueOnce(Object.assign(new Error("exclusion violation"), { code: "23P01" }));
      await expect(
        service.add(em, {
          employeeId: "emp-1",
          componentId: "cmp-1",
          amount: Money.fromInt(1500),
          effectiveFrom: "2026-03-01",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rethrows any other error unchanged", async () => {
      repo.create.mockRejectedValueOnce(new Error("some other DB error"));
      await expect(
        service.add(em, {
          employeeId: "emp-1",
          componentId: "cmp-1",
          amount: Money.fromInt(1500),
          effectiveFrom: "2026-03-01",
        }),
      ).rejects.toThrow("some other DB error");
    });
  });

  describe("endOverride", () => {
    it("closes out the open-ended row for the given (employee, component)", async () => {
      repo.findByEmployeeId.mockResolvedValue([
        makeOverride({ id: "housing-open", componentId: "housing", effectiveTo: null }),
        makeOverride({ id: "transport-open", componentId: "transport", effectiveTo: null }),
      ]);
      const row = await service.endOverride("emp-1", "housing", "2026-06-30");
      expect(row.id).toBe("housing-open");
      expect(row.effectiveTo).toBe("2026-06-30");
    });

    it("does not touch a different concurrent component's open-ended row", async () => {
      repo.findByEmployeeId.mockResolvedValue([
        makeOverride({ id: "housing-open", componentId: "housing", effectiveTo: null }),
        makeOverride({ id: "transport-open", componentId: "transport", effectiveTo: null }),
      ]);
      await service.endOverride("emp-1", "housing", "2026-06-30");
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: "housing-open" }), undefined);
      expect(repo.save).not.toHaveBeenCalledWith(expect.objectContaining({ id: "transport-open" }), expect.anything());
    });

    it("throws NotFoundException when no matching open-ended row exists", async () => {
      repo.findByEmployeeId.mockResolvedValue([]);
      await expect(service.endOverride("emp-1", "housing", "2026-06-30")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("getActiveFor delegates to the repository", async () => {
    repo.findActiveFor.mockResolvedValue([makeOverride({})]);
    const rows = await service.getActiveFor("emp-1", "2026-03-15");
    expect(repo.findActiveFor).toHaveBeenCalledWith("emp-1", "2026-03-15", undefined);
    expect(rows).toHaveLength(1);
  });
});
