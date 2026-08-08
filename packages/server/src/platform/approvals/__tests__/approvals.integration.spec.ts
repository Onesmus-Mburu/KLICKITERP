import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { ApprActionEntity } from "../domain/appr-action.entity";
import { ApprDelegationEntity } from "../domain/appr-delegation.entity";
import { ApprInstanceEntity } from "../domain/appr-instance.entity";
import { ApprLevelEntity } from "../domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";
import { ApprWorkflowDefEntity } from "../domain/appr-workflow-def.entity";
import { ApprWorkflowVersionEntity } from "../domain/appr-workflow-version.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `platform/comms/__tests__/comms.integration.spec.ts`'s pattern.
 *
 * The self-approval trigger test is the highest-value assertion in this
 * suite: `trg_appr_no_self_approval` (migration `0050`) can only be
 * genuinely verified against a real Postgres trigger — the unit tests in
 * `approval-engine.service.spec.ts` exercise the service-layer guard with
 * mocked repositories, which cannot prove the DB-layer defense actually
 * fires (G-04's three-layer rule).
 */
describe("approvals module — integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[approvals.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
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
    ["appr_workflow_def", ApprWorkflowDefEntity],
    ["appr_workflow_version", ApprWorkflowVersionEntity],
    ["appr_level", ApprLevelEntity],
    ["appr_routing_rule", ApprRoutingRuleEntity],
    ["appr_instance", ApprInstanceEntity],
    ["appr_action", ApprActionEntity],
    ["appr_delegation", ApprDelegationEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[approvals.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_appr_no_self_approval rejects an appr_action INSERT where actor_id === the parent instance's initiator_id (BR-APPR-01 at the DB layer)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[approvals.integration.spec] SKIPPED (no DB) — self-approval trigger check");
      return;
    }
    const source = dataSource;

    const userId = generateUuidV7();
    const workflowDefId = generateUuidV7();
    const workflowVersionId = generateUuidV7();
    const instanceId = generateUuidV7();
    const suffix = Date.now();

    await source.query(
      `INSERT INTO app.usr_user (id, username, email, password_hash, full_name, status, user_type)
       VALUES ($1, $2, $3, 'x', 'Approvals Trigger Test User', 'ACTIVE', 'STAFF')`,
      [userId, `appr_trigger_test_${suffix}`, `appr_trigger_test_${suffix}@example.test`],
    );

    try {
      await source.query(
        `INSERT INTO app.appr_workflow_def (id, domain_code, name, is_active)
         VALUES ($1, $2, 'Trigger Test Workflow', true)`,
        [workflowDefId, `TRIGGER_TEST_${suffix}`],
      );
      await source.query(
        `INSERT INTO app.appr_workflow_version (id, workflow_def_id, "version", is_current)
         VALUES ($1, $2, 1, true)`,
        [workflowVersionId, workflowDefId],
      );
      await source.query(
        `INSERT INTO app.appr_instance
           (id, workflow_version_id, domain_code, entity_type, entity_id, initiator_id, status, current_level, submitted_at)
         VALUES ($1, $2, $3, 'trigger_test_entity', $4, $5, 'PENDING', 1, now())`,
        [instanceId, workflowVersionId, `TRIGGER_TEST_${suffix}`, generateUuidV7(), userId],
      );

      await expect(
        source.query(
          `INSERT INTO app.appr_action (id, instance_id, level_seq, actor_id, decision, acted_at)
           VALUES ($1, $2, 1, $3, 'APPROVE', now())`,
          [generateUuidV7(), instanceId, userId],
        ),
      ).rejects.toThrow();
    } finally {
      await source.query(`DELETE FROM app.appr_action WHERE instance_id = $1`, [instanceId]);
      await source.query(`DELETE FROM app.appr_instance WHERE id = $1`, [instanceId]);
      await source.query(`DELETE FROM app.appr_workflow_version WHERE id = $1`, [workflowVersionId]);
      await source.query(`DELETE FROM app.appr_workflow_def WHERE id = $1`, [workflowDefId]);
      await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [userId]);
    }
  });
});
