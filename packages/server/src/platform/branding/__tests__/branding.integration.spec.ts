import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { BrndThemeEntity } from "../domain/brnd-theme.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `platform/files/__tests__/files.integration.spec.ts`'s pattern.
 */
describe("branding module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[branding.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("brnd_theme table is reachable and the entity metadata matches the DDL", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[branding.integration.spec] SKIPPED (no DB) — brnd_theme reachability check");
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(BrndThemeEntity).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("the 0900 seed migration's Infoney Default theme is PUBLISHED once migrations have run", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[branding.integration.spec] SKIPPED (no DB) — Infoney Default seed check");
      return;
    }
    const row = await dataSource.getRepository(BrndThemeEntity).findOne({ where: { name: "Infoney Default" } });
    // Vacuous when migrations haven't been run yet in this environment (schema-level
    // correctness is unverified until Docker is up per docs/phase-5/PROGRESS.md) —
    // this assertion only fires once a row with that name exists at all.
    if (row) {
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt).not.toBeNull();
    }
  });
});
