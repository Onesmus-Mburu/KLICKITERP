import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §4, `brnd_theme` DDL.
 * Columns match `platform/branding/domain/brnd-theme.entity.ts` 1:1.
 *
 * Runs after `0035-create-files-table.ts` — `logo_file_id`/`favicon_file_id`
 * reference `app.file_object(id)` RESTRICT (a file still referenced by a
 * theme can't be hard-deleted out from under it), and after
 * `0010-create-usr-tables.ts` (standard-column convention only — no FK to
 * `usr_user` here beyond the inherited `created_by`/`updated_by`, which are
 * plain uuid columns with no FK constraint, matching every other table's
 * std-column convention in this codebase).
 *
 * `uq_brnd_theme_published_p` (partial unique index, `WHERE status =
 * 'PUBLISHED'`) enforces "at most one published theme" at the DB layer —
 * mirrors `uq_set_year_current_p`/`uq_set_term_current_p` exactly;
 * `ThemesService.publish`/`.revert` unset (archive) the previous row before
 * setting the new one PUBLISHED inside one transaction, so this index is
 * never violated mid-flight (see the entity's doc comment).
 */
export class CreateBrandingTable0040 implements MigrationInterface {
  name = "CreateBrandingTable1700000000040";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.brnd_theme (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(60) NOT NULL,
        status varchar(10) NOT NULL,
        tokens jsonb NOT NULL,
        logo_file_id uuid NULL,
        favicon_file_id uuid NULL,
        login_config jsonb NOT NULL,
        document_config jsonb NOT NULL,
        published_at timestamptz NULL,
        CONSTRAINT ck_brnd_theme_status CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
        CONSTRAINT fk_brnd_theme_logo_file_id FOREIGN KEY (logo_file_id)
          REFERENCES app.file_object(id) ON DELETE RESTRICT,
        CONSTRAINT fk_brnd_theme_favicon_file_id FOREIGN KEY (favicon_file_id)
          REFERENCES app.file_object(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_brnd_theme_published_p ON app.brnd_theme (status) WHERE status = 'PUBLISHED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.brnd_theme`);
  }
}
