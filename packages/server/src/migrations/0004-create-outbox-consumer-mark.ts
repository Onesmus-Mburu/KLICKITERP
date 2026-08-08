import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §6 `obx_consumer_mark` —
 * shared-kernel outbox idempotency ledger, matches
 * `packages/server/src/shared/events/outbox-consumer-mark.entity.ts` 1:1.
 * Placed at 0004 (immediately after `0003-create-outbox.ts`) since it is
 * shared-kernel infrastructure alongside `obx_outbox`, not part of any one
 * domain module's own migration.
 */
export class CreateOutboxConsumerMark0004 implements MigrationInterface {
  name = "CreateOutboxConsumerMark1700000000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.obx_consumer_mark (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        consumer varchar(60) NOT NULL,
        event_id uuid NOT NULL,
        CONSTRAINT uq_obx_consumer_mark_consumer_event_id UNIQUE (consumer, event_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.obx_consumer_mark`);
  }
}
