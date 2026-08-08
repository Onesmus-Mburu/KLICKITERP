import { MvRefreshService } from "../application/mv-refresh.service";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";

describe("MvRefreshService", () => {
  it("refreshAll()/refreshOne() delegate to MaterializedViewsRepository", async () => {
    const mvRepository = { refresh: jest.fn(async () => undefined), refreshAll: jest.fn(async () => undefined) };
    const service = new MvRefreshService(mvRepository as unknown as MaterializedViewsRepository);

    await service.refreshAll();
    expect(mvRepository.refreshAll).toHaveBeenCalledTimes(1);

    await service.refreshOne("mv_daily_collections");
    expect(mvRepository.refresh).toHaveBeenCalledWith("mv_daily_collections");
  });
});
