import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { EmployeeAssignmentsService } from "../application/employee-assignments.service";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";

function makeAssignment(overrides: Partial<PyrlEmployeeAssignmentEntity>): PyrlEmployeeAssignmentEntity {
  return {
    id: "assign-1",
    employeeId: "emp-1",
    structureId: "struct-1",
    basicPay: Money.fromInt(50000),
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlEmployeeAssignmentEntity;
}

describe("EmployeeAssignmentsService", () => {
  let repo: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByEmployeeId: jest.Mock;
    findActiveFor: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: EmployeeAssignmentsService;
  const em = {} as EntityManager;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findByEmployeeId: jest.fn(async () => []),
      findActiveFor: jest.fn(),
      create: jest.fn(async (data) => makeAssignment(data)),
      save: jest.fn(async (e) => e),
    };
    service = new EmployeeAssignmentsService(repo as never);
  });

  describe("assign", () => {
    it("creates an assignment row via the repository", async () => {
      const row = await service.assign(em, {
        employeeId: "emp-1",
        structureId: "struct-1",
        basicPay: Money.fromInt(60000),
        effectiveFrom: "2026-01-01",
      });
      expect(row.basicPay).toEqual(Money.fromInt(60000));
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "emp-1", structureId: "struct-1", effectiveTo: null }),
        em,
      );
    });

    it("translates a 23P01 exclusion_violation into a ConflictException", async () => {
      repo.create.mockRejectedValueOnce(Object.assign(new Error("exclusion violation"), { code: "23P01" }));
      await expect(
        service.assign(em, {
          employeeId: "emp-1",
          structureId: "struct-1",
          basicPay: Money.fromInt(60000),
          effectiveFrom: "2026-05-01",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("translates a driverError-nested 23P01 the same way", async () => {
      repo.create.mockRejectedValueOnce(
        Object.assign(new Error("wrapped"), { driverError: { code: "23P01" } }),
      );
      await expect(
        service.assign(em, {
          employeeId: "emp-1",
          structureId: "struct-1",
          basicPay: Money.fromInt(60000),
          effectiveFrom: "2026-05-01",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rethrows any other error unchanged", async () => {
      repo.create.mockRejectedValueOnce(new Error("some other DB error"));
      await expect(
        service.assign(em, {
          employeeId: "emp-1",
          structureId: "struct-1",
          basicPay: Money.fromInt(60000),
          effectiveFrom: "2026-05-01",
        }),
      ).rejects.toThrow("some other DB error");
    });
  });

  describe("endAssignment", () => {
    it("closes out the open-ended row by setting effective_to", async () => {
      repo.findByEmployeeId.mockResolvedValue([
        makeAssignment({ id: "old-closed", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }),
        makeAssignment({ id: "current-open", effectiveFrom: "2026-01-01", effectiveTo: null }),
      ]);
      const row = await service.endAssignment("emp-1", "2026-06-30");
      expect(row.id).toBe("current-open");
      expect(row.effectiveTo).toBe("2026-06-30");
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "current-open", effectiveTo: "2026-06-30" }),
        undefined,
      );
    });

    it("throws NotFoundException when no open-ended assignment exists", async () => {
      repo.findByEmployeeId.mockResolvedValue([
        makeAssignment({ id: "closed", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }),
      ]);
      await expect(service.endAssignment("emp-1", "2026-06-30")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("getActiveFor delegates to the repository", async () => {
    repo.findActiveFor.mockResolvedValue(makeAssignment({}));
    const row = await service.getActiveFor("emp-1", "2026-03-15");
    expect(repo.findActiveFor).toHaveBeenCalledWith("emp-1", "2026-03-15", undefined);
    expect(row?.employeeId).toBe("emp-1");
  });
});
