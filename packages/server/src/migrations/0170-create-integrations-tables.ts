import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §6 (`intg_*` DDL) — Module 19
 * (Integrations), single comprehensive pass (docs/phase-5/PROGRESS.md):
 * entities, migration, application services, adapters, controllers, seed,
 * tests all in one pass, per this module's own task brief (small physical
 * schema — 3 tables — but real mechanical substance: webhook delivery with
 * HMAC signing/retry/auto-disable, accounting-sync adapters).
 *
 * Table order: `intg_webhook_subscription` -> `intg_webhook_delivery` (FK
 * `subscription_id`, `ON DELETE CASCADE` — a delivery row is subordinate to
 * its subscription, same "child dies with parent" treatment invoice
 * lines/journal lines get) -> `intg_sync_log` (no FK at all — `entity`/
 * `entity_id` are a deliberately loose reference, see
 * `IntgSyncLogEntity`'s own doc comment for why: this module's
 * `module-deps.json` scope is DELIBERATELY NARROW and must not reach into
 * every other domain's tables just to validate a log row's subject).
 *
 * `ix_intg_webhook_delivery_due` is the partial index the DDL calls out
 * explicitly (`WHERE status IN ('PENDING','FAILED')`) —
 * `IntgWebhookDeliveryRepository.findDueForRetry()`'s exact predicate.
 *
 * No exotic triggers — this module has no GL posting and no
 * immutability-sensitive documents, matching the task brief's own note.
 *
 * `down()` drops in reverse dependency order.
 */
export class CreateIntegrationsTables0170 implements MigrationInterface {
  name = "CreateIntegrationsTables1700000000170";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.intg_webhook_subscription (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        url varchar(300) NOT NULL,
        secret_enc bytea NOT NULL,
        events varchar(50)[] NOT NULL DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        disabled_reason text NULL,
        failure_streak_started_at timestamptz NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.intg_webhook_delivery (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        subscription_id uuid NOT NULL,
        event_type varchar(50) NOT NULL,
        payload jsonb NOT NULL,
        attempt int NOT NULL DEFAULT 0,
        status varchar(10) NOT NULL DEFAULT 'PENDING',
        response_code int NULL,
        next_retry_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_intg_webhook_delivery_subscription_id FOREIGN KEY (subscription_id)
          REFERENCES app.intg_webhook_subscription(id) ON DELETE CASCADE,
        CONSTRAINT ck_intg_webhook_delivery_status CHECK (status IN ('PENDING','DELIVERED','FAILED','DEAD'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_intg_webhook_delivery_subscription ON app.intg_webhook_delivery (subscription_id)`);
    await queryRunner.query(`
      CREATE INDEX ix_intg_webhook_delivery_due ON app.intg_webhook_delivery (next_retry_at)
        WHERE status IN ('PENDING','FAILED')
    `);

    await queryRunner.query(`
      CREATE TABLE app.intg_sync_log (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        kind varchar(20) NOT NULL,
        direction varchar(4) NOT NULL,
        entity varchar(60) NOT NULL,
        entity_id uuid NOT NULL,
        status varchar(10) NOT NULL,
        provider_ref varchar(100) NULL,
        error text NULL,
        at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_intg_sync_log_kind CHECK (kind IN ('QUICKBOOKS','XERO','SAGE')),
        CONSTRAINT ck_intg_sync_log_direction CHECK (direction IN ('PUSH','PULL')),
        CONSTRAINT ck_intg_sync_log_status CHECK (status IN ('SUCCESS','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_intg_sync_log_entity ON app.intg_sync_log (entity, entity_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.intg_sync_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.intg_webhook_delivery`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.intg_webhook_subscription`);
  }
}
