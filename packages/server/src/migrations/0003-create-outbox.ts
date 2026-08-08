import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §6 `obx_outbox` +
 * docs/phase-4/01-standards-and-migrations.md §7.2 migration 0003.
 * Matches `packages/server/src/shared/events/outbox.entity.ts` 1:1. `seq` is
 * a Postgres identity column (chain/delivery order) — TypeORM has no
 * decorator for the `GENERATED ALWAYS AS IDENTITY` clause itself, so it is
 * declared here directly. `attempts` is an addition beyond the documented
 * DDL for the future dispatcher's retry bookkeeping (see entity comment).
 */
export class CreateOutbox0003 implements MigrationInterface {
  name = "CreateOutbox1700000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.obx_outbox (
        id uuid PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        aggregate_type varchar(60) NOT NULL,
        aggregate_id uuid NOT NULL,
        event_type varchar(60) NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        published_at timestamptz NULL,
        attempts int NOT NULL DEFAULT 0,
        CONSTRAINT uq_obx_outbox_seq UNIQUE (seq)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX ix_obx_unpublished_p ON app.obx_outbox (seq) WHERE published_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.obx_outbox`);
  }
}
