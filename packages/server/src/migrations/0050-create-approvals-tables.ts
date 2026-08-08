import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §6, `appr_*` DDL — the
 * generic reusable approval-workflow engine (FR-APPR-007.1). Columns match
 * `platform/approvals/domain/*.entity.ts` 1:1. Table order follows the FK
 * dependency chain: `appr_workflow_def` -> `appr_workflow_version` (FK to
 * def) -> `appr_level`/`appr_routing_rule` (FK to version, plus nullable FKs
 * to `usr_role`/`usr_department` from `0010`) -> `appr_instance` (FK to
 * version + `usr_user` initiator) -> `appr_action` (FK to instance +
 * `usr_user` actor/delegated-from) -> `appr_delegation` (FK to `usr_user`
 * x2, no dependency on the rest of this migration).
 *
 * `trg_appr_no_self_approval` (BR-APPR-01 at the DB layer, mirrors
 * `trg_auditor_no_write` from migration `0010`'s style) rejects any INSERT
 * into `appr_action` where `actor_id` equals the parent `appr_instance`'s
 * `initiator_id` — defense-in-depth behind `ApprovalEngineService.decide()`'s
 * own service-layer check (G-04's three-layer rule).
 */
export class CreateApprovalsTables0050 implements MigrationInterface {
  name = "CreateApprovalsTables1700000000050";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.appr_workflow_def (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        domain_code varchar(30) NOT NULL,
        name varchar(80) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_appr_workflow_def_domain_code UNIQUE (domain_code)
      )
    `);

    // No standard "version" optimistic-lock column here — this table's own DDL column IS named
    // "version" (the workflow's sequential version number), so it extends BaseEntity, not
    // MutableBaseEntity; see ApprWorkflowVersionEntity's doc comment for the full rationale.
    await queryRunner.query(`
      CREATE TABLE app.appr_workflow_version (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        workflow_def_id uuid NOT NULL,
        "version" int NOT NULL,
        is_current boolean NOT NULL DEFAULT false,
        CONSTRAINT fk_appr_workflow_version_workflow_def_id FOREIGN KEY (workflow_def_id)
          REFERENCES app.appr_workflow_def(id) ON DELETE RESTRICT,
        CONSTRAINT uq_appr_workflow_version_def_version UNIQUE (workflow_def_id, "version")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_appr_workflow_version_current_p ON app.appr_workflow_version (workflow_def_id, is_current)
        WHERE is_current = true
    `);

    await queryRunner.query(`
      CREATE TABLE app.appr_level (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        workflow_version_id uuid NOT NULL,
        seq int NOT NULL,
        approver_type varchar(20) NOT NULL,
        role_id uuid NULL,
        user_ids uuid[] NULL,
        mode varchar(10) NOT NULL,
        quorum int NOT NULL DEFAULT 1,
        sla_hours int NULL,
        escalation jsonb NULL,
        CONSTRAINT fk_appr_level_workflow_version_id FOREIGN KEY (workflow_version_id)
          REFERENCES app.appr_workflow_version(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_level_role_id FOREIGN KEY (role_id)
          REFERENCES app.usr_role(id) ON DELETE RESTRICT,
        CONSTRAINT uq_appr_level_version_seq UNIQUE (workflow_version_id, seq),
        CONSTRAINT ck_appr_level_approver_type CHECK (approver_type IN ('ROLE','USERS','DEPT_HEAD')),
        CONSTRAINT ck_appr_level_mode CHECK (mode IN ('SEQUENTIAL','PARALLEL'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.appr_routing_rule (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        workflow_version_id uuid NOT NULL,
        min_amount NUMERIC(18,4) NOT NULL,
        max_amount NUMERIC(18,4) NULL,
        level_subset int[] NULL,
        department_id uuid NULL,
        CONSTRAINT fk_appr_routing_rule_workflow_version_id FOREIGN KEY (workflow_version_id)
          REFERENCES app.appr_workflow_version(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_routing_rule_department_id FOREIGN KEY (department_id)
          REFERENCES app.usr_department(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.appr_instance (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        workflow_version_id uuid NOT NULL,
        domain_code varchar(30) NOT NULL,
        entity_type varchar(60) NOT NULL,
        entity_id uuid NOT NULL,
        amount NUMERIC(18,4) NULL,
        initiator_id uuid NOT NULL,
        status varchar(15) NOT NULL,
        current_level int NOT NULL,
        submitted_at timestamptz NOT NULL,
        decided_at timestamptz NULL,
        CONSTRAINT fk_appr_instance_workflow_version_id FOREIGN KEY (workflow_version_id)
          REFERENCES app.appr_workflow_version(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_instance_initiator_id FOREIGN KEY (initiator_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_appr_instance_status CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_appr_instance_pending_p ON app.appr_instance (current_level) WHERE status = 'PENDING'
    `);
    await queryRunner.query(`
      CREATE INDEX ix_appr_instance_entity ON app.appr_instance (entity_type, entity_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_appr_instance_open_p ON app.appr_instance (entity_type, entity_id) WHERE status = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE TABLE app.appr_action (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        instance_id uuid NOT NULL,
        level_seq int NOT NULL,
        actor_id uuid NOT NULL,
        decision varchar(10) NOT NULL,
        comment text NULL,
        acted_at timestamptz NOT NULL,
        was_delegated_from uuid NULL,
        CONSTRAINT fk_appr_action_instance_id FOREIGN KEY (instance_id)
          REFERENCES app.appr_instance(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_action_actor_id FOREIGN KEY (actor_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_action_was_delegated_from FOREIGN KEY (was_delegated_from)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_appr_action_decision CHECK (decision IN ('APPROVE','REJECT','RETURN'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_appr_action_instance_id ON app.appr_action (instance_id)
    `);

    // BR-APPR-01 at the DB layer: reject an appr_action INSERT where actor_id equals the parent instance's initiator_id.
    await queryRunner.query(`
      CREATE FUNCTION app.fn_appr_no_self_approval() RETURNS trigger AS $$
      DECLARE
        v_initiator_id uuid;
      BEGIN
        SELECT initiator_id INTO v_initiator_id FROM app.appr_instance WHERE id = NEW.instance_id;
        IF v_initiator_id = NEW.actor_id THEN
          RAISE EXCEPTION 'BR-APPR-01: actor % cannot act on their own request (instance %)',
            NEW.actor_id, NEW.instance_id
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_appr_no_self_approval
        BEFORE INSERT ON app.appr_action
        FOR EACH ROW EXECUTE FUNCTION app.fn_appr_no_self_approval()
    `);

    await queryRunner.query(`
      CREATE TABLE app.appr_delegation (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        from_user_id uuid NOT NULL,
        to_user_id uuid NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        reason text NULL,
        CONSTRAINT fk_appr_delegation_from_user_id FOREIGN KEY (from_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_appr_delegation_to_user_id FOREIGN KEY (to_user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT ck_appr_delegation_from_ne_to CHECK (from_user_id <> to_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_appr_delegation_from_user_dates ON app.appr_delegation (from_user_id, starts_on, ends_on)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_delegation`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_appr_no_self_approval ON app.appr_action`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_appr_no_self_approval()`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_action`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_instance`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_routing_rule`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_level`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_workflow_version`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.appr_workflow_def`);
  }
}
