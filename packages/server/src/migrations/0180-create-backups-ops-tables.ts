import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §6 (`bkp_*` DDL) — Module 20
 * (Backups/Ops), single comprehensive pass (docs/phase-5/PROGRESS.md): 2
 * physical tables, but real mechanical substance (pg_dump/pg_restore/tar
 * shell-outs, AES-256-GCM encryption, GFS retention, MinIO/offsite-S3
 * fan-out, health checks) all built in this one pass.
 *
 * `bkp_restore_run.status` has no CHECK enum spelled out in the DDL — this
 * migration (and `BkpRestoreRunEntity`'s own doc comment) designs one,
 * mirroring `bkp_backup_run.status`'s exact shape (`RUNNING|OK|FAILED`),
 * per the task brief's own explicit instruction.
 *
 * No FK between the two tables (`bkp_restore_run.from_manifest` is a
 * denormalized COPY of the source `bkp_backup_run.manifest`, not a live
 * reference — see `BkpRestoreRunEntity`'s own doc comment for why: a restore
 * run's provenance must survive even after `pruneOldBackups()`'s GFS
 * rotation deletes the source `bkp_backup_run` row).
 *
 * `down()` drops in reverse order (no real dependency order needed since
 * there's no FK, but kept consistent with every other migration's
 * children-before-parents convention).
 */
export class CreateBackupsOpsTables0180 implements MigrationInterface {
  name = "CreateBackupsOpsTables1700000000180";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bkp_backup_run (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        started_at timestamptz NOT NULL,
        finished_at timestamptz NULL,
        kind varchar(12) NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'RUNNING',
        size_bytes bigint NULL,
        sha256 varchar(64) NULL,
        destinations jsonb NOT NULL DEFAULT '[]',
        manifest jsonb NULL,
        error text NULL,
        CONSTRAINT ck_bkp_backup_run_kind CHECK (kind IN ('SCHEDULED','MANUAL','PRE_UPDATE')),
        CONSTRAINT ck_bkp_backup_run_status CHECK (status IN ('RUNNING','OK','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bkp_backup_run_kind_status ON app.bkp_backup_run (kind, status)`);
    await queryRunner.query(`CREATE INDEX ix_bkp_backup_run_started_at ON app.bkp_backup_run (started_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE app.bkp_restore_run (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        from_manifest jsonb NOT NULL,
        started_at timestamptz NOT NULL,
        finished_at timestamptz NULL,
        status varchar(10) NOT NULL DEFAULT 'RUNNING',
        notes text NULL,
        CONSTRAINT ck_bkp_restore_run_status CHECK (status IN ('RUNNING','OK','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bkp_restore_run_started_at ON app.bkp_restore_run (started_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.bkp_restore_run`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bkp_backup_run`);
  }
}
