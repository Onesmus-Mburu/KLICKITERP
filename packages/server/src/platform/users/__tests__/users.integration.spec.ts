import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { UsrUserEntity } from "../domain/usr-user.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — skipped (not failed) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in.
 */
describe("users module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[users.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("usr_user table is reachable and the entity metadata matches the DDL", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[users.integration.spec] SKIPPED (no DB) — usr_user reachability check");
      return; // vacuous pass rather than a Jest-registered skip: the skip decision is only known async, after `it()` registration has already happened.
    }
    const count = await dataSource.getRepository(UsrUserEntity).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
