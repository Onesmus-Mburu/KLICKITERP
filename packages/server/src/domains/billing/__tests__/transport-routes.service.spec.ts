import { TransportRoutesService } from "../application/transport-routes.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { BillTransportRouteEntity } from "../domain/bill-transport-route.entity";

function makeRoute(overrides: Partial<BillTransportRouteEntity>): BillTransportRouteEntity {
  return {
    id: "route-1",
    name: "Route A",
    amount: Money.fromInt(500),
    isActive: true,
    ...overrides,
  } as BillTransportRouteEntity;
}

describe("TransportRoutesService", () => {
  let repo: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: TransportRoutesService;

  beforeEach(() => {
    repo = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeRoute({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeRoute(data)),
      save: jest.fn(async (e) => e),
    };
    service = new TransportRoutesService(repo as never);
  });

  it("rejects a duplicate name on create", async () => {
    repo.findByName.mockResolvedValue(makeRoute({}));
    await expect(service.create({ name: "Route A", amount: Money.fromInt(100) }, "actor-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("creates with is_active=true by default", async () => {
    const route = await service.create({ name: "Route B", amount: Money.fromInt(700) }, "actor-1");
    expect(route.isActive).toBe(true);
    expect(route.amount.equals(Money.fromInt(700))).toBe(true);
  });

  it("update() only changes provided fields", async () => {
    const updated = await service.update("route-1", { amount: Money.fromInt(900) }, "actor-1");
    expect(updated.amount.equals(Money.fromInt(900))).toBe(true);
    expect(updated.name).toBe("Route A");
  });

  it("deactivate/activate toggle is_active", async () => {
    expect((await service.deactivate("route-1", "actor-1")).isActive).toBe(false);
    expect((await service.activate("route-1", "actor-1")).isActive).toBe(true);
  });
});
