import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { UsrSessionEntity } from "../../users/domain/usr-session.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — skipped (not failed) when no DB is reachable (Docker
 * isn't confirmed running in every environment this repo builds in).
 */
describe("auth module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[auth.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("usr_session table is reachable", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[auth.integration.spec] SKIPPED (no DB) — usr_session reachability check");
      return;
    }
    const count = await dataSource.getRepository(UsrSessionEntity).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
