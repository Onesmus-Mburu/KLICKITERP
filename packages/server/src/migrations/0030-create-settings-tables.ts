import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §4 (set_*) +
 * docs/phase-4/01-standards-and-migrations.md §7.2-style numbering. DDL
 * source of truth alongside `packages/server/src/platform/settings/domain/*.entity.ts`
 * — columns match the entities 1:1.
 *
 * `set_term` references `set_academic_year` (RESTRICT — a year with terms
 * cannot be deleted out from under them), so academic years are created
 * first. Partial unique indexes (`uq_set_year_current_p`,
 * `uq_set_term_current_p`) enforce "exactly one current" at the DB layer;
 * `AcademicCalendarService.setCurrentYear`/`setCurrentTerm` unset the
 * previous current row inside the same transaction before setting a new
 * one, so these indexes are never violated mid-flight (see the entities'
 * doc comments).
 */
export class CreateSettingsTables0030 implements MigrationInterface {
  name = "CreateSettingsTables1700000000030";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.set_setting (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        key varchar(80) NOT NULL,
        value jsonb NOT NULL,
        is_secret boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_set_setting_key UNIQUE (key)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.set_academic_year (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(20) NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        is_current boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_set_academic_year_name UNIQUE (name)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_set_year_current_p ON app.set_academic_year (is_current) WHERE is_current = true
    `);

    await queryRunner.query(`
      CREATE TABLE app.set_term (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        academic_year_id uuid NOT NULL,
        name varchar(20) NOT NULL,
        seq int NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        is_current boolean NOT NULL DEFAULT false,
        billing_locked boolean NOT NULL DEFAULT false,
        CONSTRAINT fk_set_term_academic_year_id FOREIGN KEY (academic_year_id)
          REFERENCES app.set_academic_year(id) ON DELETE RESTRICT,
        CONSTRAINT uq_set_term_academic_year_id_seq UNIQUE (academic_year_id, seq)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_set_term_academic_year_id ON app.set_term (academic_year_id)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_set_term_current_p ON app.set_term (is_current) WHERE is_current = true
    `);

    await queryRunner.query(`
      CREATE TABLE app.set_numbering_series (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        doc_type varchar(30) NOT NULL,
        series_code varchar(10) NOT NULL DEFAULT 'MAIN',
        prefix varchar(12) NOT NULL,
        pad_width int NOT NULL,
        reset_policy varchar(10) NOT NULL,
        period_key varchar(12) NOT NULL,
        next_no bigint NOT NULL,
        CONSTRAINT uq_set_numbering_series_doc_type_series_code_period_key
          UNIQUE (doc_type, series_code, period_key),
        CONSTRAINT ck_set_numbering_series_reset_policy CHECK (reset_policy IN ('NEVER','YEARLY','TERMLY')),
        CONSTRAINT ck_set_numbering_series_next_no CHECK (next_no > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.set_integration_config (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        kind varchar(30) NOT NULL,
        name varchar(60) NOT NULL,
        config_enc bytea NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        priority int NOT NULL DEFAULT 0,
        last_tested_at timestamptz NULL,
        last_test_ok boolean NULL,
        CONSTRAINT uq_set_integration_config_kind_name UNIQUE (kind, name),
        CONSTRAINT ck_set_integration_config_kind CHECK (
          kind IN ('SMTP','SMS','FCM','MPESA','QUICKBOOKS','XERO','SAGE','BANK','WHATSAPP')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.set_custom_field_def (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        entity varchar(30) NOT NULL,
        key varchar(40) NOT NULL,
        label varchar(80) NOT NULL,
        field_type varchar(10) NOT NULL,
        options jsonb NULL,
        is_required boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_set_custom_field_def_entity_key UNIQUE (entity, key),
        CONSTRAINT ck_set_custom_field_def_entity CHECK (entity IN ('STUDENT','SUPPLIER','EMPLOYEE','ASSET')),
        CONSTRAINT ck_set_custom_field_def_field_type CHECK (field_type IN ('TEXT','NUMBER','DATE','SELECT'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_custom_field_def`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_integration_config`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_numbering_series`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_term`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_academic_year`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.set_setting`);
  }
}
