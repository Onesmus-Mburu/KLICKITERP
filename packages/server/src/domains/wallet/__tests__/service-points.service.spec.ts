import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ServicePointsService } from "../application/service-points.service";
import { WallServicePointEntity } from "../domain/wall-service-point.entity";

function makeServicePoint(overrides: Partial<WallServicePointEntity>): WallServicePointEntity {
  return {
    id: "sp-1",
    name: "School Shop",
    type: "SHOP",
    glIncomeAccountId: "income-acct",
    isActive: true,
    perTxnLimit: null,
    ...overrides,
  } as WallServicePointEntity;
}

describe("ServicePointsService", () => {
  let servicePointRepository: { findByName: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock; create: jest.Mock; save: jest.Mock };
  let operatorRepository: { findOne: jest.Mock; listByServicePoint: jest.Mock; create: jest.Mock; remove: jest.Mock };
  let service: ServicePointsService;

  beforeEach(() => {
    servicePointRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeServicePoint({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data: Partial<WallServicePointEntity>) => makeServicePoint(data)),
      save: jest.fn(async (e: WallServicePointEntity) => e),
    };
    operatorRepository = {
      findOne: jest.fn(async () => null),
      listByServicePoint: jest.fn(async () => []),
      create: jest.fn(async (data: Record<string, unknown>) => ({ id: "op-1", ...data })),
      remove: jest.fn(async () => undefined),
    };
    service = new ServicePointsService(servicePointRepository as never, operatorRepository as never);
  });

  it("rejects creating a service point with a duplicate name", async () => {
    servicePointRepository.findByName.mockResolvedValue(makeServicePoint({}));
    await expect(service.create({ name: "School Shop", type: "SHOP", glIncomeAccountId: "acct-1" }, "actor-1")).rejects.toThrow(
      ValidationException,
    );
  });

  it("creates a service point", async () => {
    const sp = await service.create({ name: "Library", type: "LIBRARY", glIncomeAccountId: "acct-1" }, "actor-1");
    expect(sp.name).toBe("Library");
  });

  it("assigns an operator idempotently", async () => {
    const existing = { id: "op-1", servicePointId: "sp-1", userId: "user-1" };
    operatorRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    await service.assignOperator("sp-1", "user-1", "actor-1");
    const second = await service.assignOperator("sp-1", "user-1", "actor-1");
    expect(second).toBe(existing);
    expect(operatorRepository.create).toHaveBeenCalledTimes(1);
  });

  it("unassignOperator is a no-op when no assignment exists", async () => {
    await service.unassignOperator("sp-1", "user-1");
    expect(operatorRepository.remove).not.toHaveBeenCalled();
  });
});
