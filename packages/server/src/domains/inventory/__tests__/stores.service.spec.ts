import { StoresService } from "../application/stores.service";
import { InvStoreEntity } from "../domain/inv-store.entity";

function makeStore(overrides: Partial<InvStoreEntity> = {}): InvStoreEntity {
  return { id: "store-1", name: "Main Store", location: "Main Campus", keeperUserId: "user-1", isActive: true, ...overrides } as InvStoreEntity;
}

describe("StoresService", () => {
  let storeRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let service: StoresService;

  beforeEach(() => {
    storeRepository = {
      create: jest.fn(async (data) => makeStore(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeStore()),
      list: jest.fn(async () => []),
    };
    service = new StoresService(storeRepository as never);
  });

  it("creates a store, defaulting is_active=true", async () => {
    const store = await service.create({ name: "Main Store", location: "Main Campus", keeperUserId: "user-1" }, "actor-1");
    expect(store.isActive).toBe(true);
  });

  it("updates fields including deactivation", async () => {
    const updated = await service.update("store-1", { isActive: false }, "actor-1");
    expect(updated.isActive).toBe(false);
  });

  it("lists with an isActive filter", async () => {
    await service.list({ isActive: true });
    expect(storeRepository.list).toHaveBeenCalledWith({ isActive: true });
  });
});
