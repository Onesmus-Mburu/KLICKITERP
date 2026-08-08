import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §5, `comm_*` DDL. Columns
 * match `platform/comms/domain/*.entity.ts` 1:1. Table order: `comm_template`,
 * `comm_trigger_binding`, `comm_broadcast` (before `comm_message` — the FK
 * target), `comm_message`, `comm_device_token` (FK to `usr_user`, runs after
 * `0010-create-usr-tables.ts`), `comm_optout` (no FK — see below).
 *
 * `comm_message`/`comm_optout` have no `version` column (`BaseEntity`, not
 * `MutableBaseEntity` — append-mostly log / simple flag row respectively;
 * see each entity's doc comment) but still carry `updated_at`/`updated_by`
 * (DR-007 "every table" standard-column rule).
 *
 * `comm_optout.guardian_id` is a bare `uuid` column with **no FK constraint**
 * — the DDL has no `→` arrow on this column; the `students`/guardians module
 * (#8) doesn't exist yet, so there is no table to reference.
 *
 * `ix_comm_message_status_p`/`ix_comm_message_entity` are declared via
 * `@Index` on the entity (TypeORM-managed); `BRIN(queued_at)` has no TypeORM
 * index type, so it's created here via raw SQL (`ix_comm_message_queued_at_brin`).
 */
export class CreateCommsTables0045 implements MigrationInterface {
  name = "CreateCommsTables1700000000045";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.comm_template (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        event_code varchar(50) NOT NULL,
        channel varchar(10) NOT NULL,
        locale varchar(8) NOT NULL DEFAULT 'en',
        subject varchar(200) NULL,
        body text NOT NULL,
        variables jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT ck_comm_template_channel CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')),
        CONSTRAINT uq_comm_template_event_channel_locale UNIQUE (event_code, channel, locale)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.comm_trigger_binding (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        event_code varchar(50) NOT NULL,
        channel varchar(10) NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        audience_rule jsonb NULL,
        CONSTRAINT ck_comm_trigger_binding_channel CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')),
        CONSTRAINT uq_comm_trigger_binding_event_channel UNIQUE (event_code, channel)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.comm_broadcast (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        title varchar(120) NOT NULL,
        audience_def jsonb NOT NULL,
        channel varchar(10) NOT NULL,
        body text NOT NULL,
        recipient_count int NOT NULL DEFAULT 0,
        est_cost_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        CONSTRAINT ck_comm_broadcast_channel CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')),
        CONSTRAINT ck_comm_broadcast_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENDING','SENT','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.comm_message (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        channel varchar(10) NOT NULL,
        recipient varchar(160) NOT NULL,
        template_event varchar(50) NULL,
        broadcast_id uuid NULL,
        entity_type varchar(60) NULL,
        entity_id uuid NULL,
        body_rendered text NOT NULL,
        status varchar(15) NOT NULL,
        provider varchar(40) NULL,
        provider_ref varchar(80) NULL,
        cost_amount NUMERIC(18,4) NULL,
        segments int NULL,
        error text NULL,
        queued_at timestamptz NOT NULL,
        sent_at timestamptz NULL,
        delivered_at timestamptz NULL,
        CONSTRAINT ck_comm_message_channel CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','INAPP')),
        CONSTRAINT ck_comm_message_status CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','OPTED_OUT')),
        CONSTRAINT fk_comm_message_broadcast_id FOREIGN KEY (broadcast_id)
          REFERENCES app.comm_broadcast(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_comm_message_status_p ON app.comm_message (status) WHERE status IN ('QUEUED','FAILED')
    `);
    await queryRunner.query(`
      CREATE INDEX ix_comm_message_entity ON app.comm_message (entity_type, entity_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_comm_message_queued_at_brin ON app.comm_message USING BRIN (queued_at)
    `);

    await queryRunner.query(`
      CREATE TABLE app.comm_device_token (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        user_id uuid NOT NULL,
        token varchar(300) NOT NULL,
        platform varchar(10) NOT NULL,
        last_seen_at timestamptz NOT NULL,
        CONSTRAINT uq_comm_device_token_token UNIQUE (token),
        CONSTRAINT fk_comm_device_token_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_comm_device_token_user_id ON app.comm_device_token (user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE app.comm_optout (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        guardian_id uuid NOT NULL,
        channel varchar(10) NOT NULL,
        scope varchar(30) NOT NULL,
        CONSTRAINT uq_comm_optout_guardian_channel_scope UNIQUE (guardian_id, channel, scope)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_optout`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_device_token`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_message`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_broadcast`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_trigger_binding`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.comm_template`);
  }
}
