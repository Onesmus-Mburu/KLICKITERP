import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §4, `file_object` DDL.
 * Columns match `platform/files/domain/file-object.entity.ts` 1:1.
 *
 * No `version` column and no `updated_at`/`updated_by` triggers-of-intent —
 * files are immutable once uploaded (delete-and-reupload, never edit; see
 * the entity's doc comment). `updated_at`/`updated_by` columns still exist
 * (DR-007 "every table" standard-column rule, matching `BaseEntity`) but
 * nothing ever writes to them past insert.
 *
 * `uploaded_by` references `app.usr_user(id)` RESTRICT — a user with
 * uploaded files can't be hard-deleted out from under them (matches
 * `usr_session.user_id`'s FK precedent in `0010-create-usr-tables.ts`).
 */
export class CreateFilesTable0035 implements MigrationInterface {
  name = "CreateFilesTable1700000000035";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.file_object (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        bucket varchar(40) NOT NULL,
        object_key varchar(200) NOT NULL,
        original_name varchar(200) NOT NULL,
        mime varchar(100) NOT NULL,
        size_bytes bigint NOT NULL,
        sha256 varchar(64) NOT NULL,
        entity_type varchar(60) NULL,
        entity_id uuid NULL,
        uploaded_by uuid NOT NULL,
        CONSTRAINT uq_file_object_object_key UNIQUE (object_key),
        CONSTRAINT fk_file_object_uploaded_by FOREIGN KEY (uploaded_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_file_object_entity ON app.file_object (entity_type, entity_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.file_object`);
  }
}
