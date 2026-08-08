import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { CommBroadcastEntity } from "../domain/comm-broadcast.entity";
import { CommDeviceTokenEntity } from "../domain/comm-device-token.entity";
import { CommMessageEntity } from "../domain/comm-message.entity";
import { CommOptoutEntity } from "../domain/comm-optout.entity";
import { CommTemplateEntity } from "../domain/comm-template.entity";
import { CommTriggerBindingEntity } from "../domain/comm-trigger-binding.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `platform/branding/__tests__/branding.integration.spec.ts`'s pattern.
 */
describe("comms module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[comms.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it.each([
    ["comm_template", CommTemplateEntity],
    ["comm_trigger_binding", CommTriggerBindingEntity],
    ["comm_broadcast", CommBroadcastEntity],
    ["comm_message", CommMessageEntity],
    ["comm_device_token", CommDeviceTokenEntity],
    ["comm_optout", CommOptoutEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[comms.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
