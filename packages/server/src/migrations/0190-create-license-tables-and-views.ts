import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §7 (`license.*` DDL) — Module 21
 * (Licensing), the FINAL Phase 5 module and the one structurally-isolated
 * module in this codebase (module-deps.json `"licensing": {"kind":
 * "isolated", "mayImport": ["shared"], "importableBy": []}`). Four tables,
 * all schema-qualified `license.*` (never `app.*`), plus TWO narrow,
 * purpose-built, read-only cross-schema VIEWS that are this module's own
 * central architectural achievement — read this doc comment in full before
 * touching either view.
 *
 * ## The isolation problem these two views solve
 *
 * `kfe_license` (this schema's DML role, migration `0002`) has ZERO
 * database-level access to `app.*` — and `licensing`'s TypeScript code
 * cannot import any other module's entities/services either
 * (module-deps.json's import boundary, CI-enforced). Two DIFFERENT modules
 * each need exactly one narrow fact from the OTHER side of that wall:
 *
 *  1. `kfe_app` (the whole rest of the application) needs to read the
 *     CURRENT license state, to enforce FR-LIC-006.1 (`shared/rbac/license-state.guard.ts`'s
 *     `LicenseStateGuard`, wired into `platform/auth`'s global `APP_GUARD`
 *     pipeline). `kfe_app` has no grants on `license.*` at all (migration
 *     `0002`'s own comment: "kfe_app has no license.* access").
 *  2. `kfe_license` (this module's own `UsageStatsViewRepository`) needs
 *     FR-LIC-005.1's four cross-schema usage figures — `active_users_30d`
 *     (`app.usr_login_event`), `student_count` (`app.std_student`),
 *     `storage_bytes` (`app.file_object`), `last_backup_at`
 *     (`app.bkp_backup_run`) — to assemble the `GET /license/v1/usage`
 *     payload. `kfe_license` has no grants on `app.*` at all.
 *
 * Both are solved the SAME way, mirror images of each other:
 *
 *  - `license.v_state` — a single-row view over `license.license`
 *     (`state`, `valid_to`, `grace_days`, `state_changed_at`), granted
 *     `SELECT` directly to `kfe_app`.
 *  - `license.v_usage_stats` — a single-row view aggregating the four
 *     figures above FROM `app.*` tables, granted `SELECT` directly to
 *     `kfe_license`.
 *
 * **Why granting `SELECT` on the VIEW is enough, with no grant on the
 * underlying tables**: in Postgres, a view's underlying-table access is
 * checked against the VIEW OWNER's privileges, not the querying role's.
 * Every table AND view in this migration is created by `kfe_migrate` (the
 * DDL-only migration role, M-5) — whoever runs `CREATE TABLE`/`CREATE VIEW`
 * becomes the object's OWNER, and an owner implicitly has full rights
 * (including `SELECT`) on everything it owns, no explicit grant needed.
 * So `kfe_migrate` — owner of every `app.*` table AND owner of
 * `license.v_usage_stats` — can freely define a view that reads `app.*`;
 * once `kfe_license` is granted `SELECT` on that VIEW alone, its queries
 * run with the OWNER's (`kfe_migrate`'s) underlying-table privileges, not
 * its own. `kfe_license` never receives — and never needs — a single direct
 * grant on any `app.*` table. The identical reasoning makes `license.v_state`
 * work for `kfe_app` in the other direction. This is precisely how the
 * architecture doc's mirror-image problem (`docs/phase-4/04-schema-operations.md`
 * §7: "`kfe_app` has no grants on `license.*` except a read-only view
 * `license.v_state`") was always meant to be resolved — this migration is
 * simply the first place either view is actually built as a real, executable
 * view (confirmed via search: `license.v_state` existed only as a doc
 * mention before this migration, never as a real `CREATE VIEW`).
 *
 * A view's DEFINITION SQL — table/column names in a raw string — crosses no
 * TypeScript import boundary at all; only `import` statements are
 * ESLint-checked by `import/no-restricted-paths`, and a view lives entirely
 * in the database, never in any module's TS source. Both
 * `LicenseStateGuard` and `UsageStatsViewRepository` query their respective
 * view via raw `DataSource.query()` — never a TypeORM entity/repository
 * import crossing the boundary.
 *
 * ## Grant reality in THIS dev/test environment vs. production
 * This codebase currently connects with one shared DB role for the whole
 * app (no separate `kfe_app`/`kfe_license` connection pools exist anywhere
 * in the code — `AppConfigService.dbUser` defaults to `kfe_app` for the
 * single connection every module uses). The schema-level isolation THIS
 * migration builds (roles, grants, views) is real, correct Postgres DDL
 * that enforces the isolation in PRODUCTION once separate connections per
 * role are wired up — it does not, and cannot, change which SQL statements
 * an in-process TypeORM `DataSource` is allowed to run in THIS test
 * environment, where every repository shares one connecting role
 * regardless of which schema its entities target. Documented honestly, not
 * silently glossed over — the real enforcement boundary here is the
 * TypeScript import graph (CI-enforced by ESLint), which DOES bind in this
 * environment; the DB-role boundary is correct-and-real DDL whose
 * enforcement is a production-deployment property.
 *
 * `down()` drops both views (children of the tables they read) before the
 * four tables, reversing `up()`'s order; each explicit `GRANT` is REVOKEd
 * first for symmetry with migration `0002`'s own REVOKE-then-DROP style,
 * though `DROP VIEW` alone would also clear its grants.
 */
export class CreateLicenseTablesAndViews0190 implements MigrationInterface {
  name = "CreateLicenseTablesAndViews1700000000190";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE license.license (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        school_id uuid NOT NULL,
        plan varchar(30) NOT NULL,
        features jsonb NOT NULL DEFAULT '[]',
        valid_from date NOT NULL,
        valid_to date NOT NULL,
        grace_days int NOT NULL DEFAULT 14,
        state varchar(12) NOT NULL DEFAULT 'PROVISIONED',
        license_blob text NULL,
        verified_at timestamptz NULL,
        state_changed_at timestamptz NULL,
        CONSTRAINT ck_license_state CHECK (state IN ('PROVISIONED','ACTIVE','GRACE','SUSPENDED','DEACTIVATED','EXPIRED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_license_license_school_id ON license.license (school_id)`);
    await queryRunner.query(`CREATE INDEX ix_license_license_created_at ON license.license (created_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE license.api_call_log (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        direction varchar(3) NOT NULL,
        endpoint varchar(60) NOT NULL,
        request_body jsonb NULL,
        response_body jsonb NULL,
        caller_key_id varchar(40) NULL,
        at timestamptz NOT NULL,
        CONSTRAINT ck_license_api_call_log_direction CHECK (direction IN ('IN','OUT'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_license_api_call_log_at ON license.api_call_log (at)`);

    await queryRunner.query(`
      CREATE TABLE license.usage_snapshot (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_license_usage_snapshot_at ON license.usage_snapshot (at)`);

    // NOTE: `release_version` (not `version`) — `license.update_notice`
    // extends `MutableBaseEntity`, whose own `version` column is the
    // standard int optimistic-lock counter every mutable table in this
    // codebase carries. The docs' terse DDL notation names the
    // release-version column `version`; renamed here to avoid a physical
    // column-name collision with the optimistic-lock column — see
    // `UpdateNoticeEntity`'s own doc comment for the full reasoning. The
    // WIRE-level field name (`POST /license/v1/update-notice`'s payload)
    // stays `version`, mapped to this column at the service boundary.
    await queryRunner.query(`
      CREATE TABLE license.update_notice (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        release_version varchar(20) NOT NULL,
        notes text NOT NULL,
        urgency varchar(10) NOT NULL,
        mandatory_by date NULL,
        received_at timestamptz NOT NULL,
        applied_at timestamptz NULL,
        decision varchar(10) NOT NULL DEFAULT 'PENDING',
        CONSTRAINT ck_license_update_notice_urgency CHECK (urgency IN ('NORMAL','SECURITY')),
        CONSTRAINT ck_license_update_notice_decision CHECK (decision IN ('PENDING','SCHEDULED','APPLIED','DECLINED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_license_update_notice_received_at ON license.update_notice (received_at DESC)`);

    // --- license.v_state — kfe_app's one narrow window into license.* ---
    // Single-row (at most), most-recently-created license row wins — same
    // "one row per instance in practice" convention `LicenseRepository.findCurrent()`
    // uses at the ORM level.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW license.v_state AS
        SELECT state, valid_to, grace_days, state_changed_at
        FROM license.license
        ORDER BY created_at DESC
        LIMIT 1
    `);
    // `USAGE ON SCHEMA license` is a SEPARATE requirement from `SELECT ON
    // license.v_state` — Postgres requires schema `USAGE` on the schema
    // CONTAINING an object just to resolve/reference it at all, regardless
    // of any object-level grant; migration `0002` deliberately withheld it
    // from `kfe_app` ("kfe_app has no license.* access"). Granting it here
    // is still narrow: it lets `kfe_app` resolve `license.v_state` by name,
    // nothing more — `kfe_app` has no `SELECT`/DML grant on any actual
    // `license.*` TABLE, only on this one view. (`kfe_license` needs no
    // equivalent `USAGE ON SCHEMA app` grant for `license.v_usage_stats`
    // below — a view's underlying-table resolution runs under the VIEW
    // OWNER's schema/table privileges, not the querying role's, so
    // `kfe_migrate`'s own `USAGE ON SCHEMA app` — already granted by
    // migration `0002` — is what's actually exercised there.)
    await queryRunner.query(`GRANT USAGE ON SCHEMA license TO kfe_app`);
    await queryRunner.query(`GRANT SELECT ON license.v_state TO kfe_app`);

    // --- license.v_usage_stats — kfe_license's one narrow window into app.* ---
    // Exactly the four FR-LIC-005.1 cross-schema figures this module's
    // TypeScript code is otherwise structurally forbidden from reaching.
    // `kfe_migrate` (running this migration) owns every `app.*` table
    // referenced below, so it may freely define a view over them; see this
    // file's own top-of-file doc comment for why that ownership is what
    // makes granting SELECT on the VIEW ALONE sufficient for `kfe_license`.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW license.v_usage_stats AS
        SELECT
          (SELECT COUNT(DISTINCT user_id) FROM app.usr_login_event
             WHERE success = true AND user_id IS NOT NULL AND at >= now() - interval '30 days') AS active_users_30d,
          (SELECT COUNT(*) FROM app.std_student WHERE status = 'ACTIVE') AS student_count,
          (SELECT COALESCE(SUM(size_bytes), 0) FROM app.file_object) AS storage_bytes,
          (SELECT MAX(finished_at) FROM app.bkp_backup_run WHERE status = 'OK') AS last_backup_at
    `);
    // Migration 0002's `ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN
    // SCHEMA license GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
    // kfe_license` already covers this view too (Postgres's ALTER DEFAULT
    // PRIVILEGES "TABLES" target applies to views as well) — this explicit
    // GRANT is issued anyway, for the exact symmetry with `license.v_state`'s
    // own explicit grant above and so this migration is self-documenting
    // without requiring a reader to cross-reference migration 0002.
    await queryRunner.query(`GRANT SELECT ON license.v_usage_stats TO kfe_license`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE SELECT ON license.v_usage_stats FROM kfe_license`);
    await queryRunner.query(`DROP VIEW IF EXISTS license.v_usage_stats`);

    await queryRunner.query(`REVOKE SELECT ON license.v_state FROM kfe_app`);
    await queryRunner.query(`REVOKE USAGE ON SCHEMA license FROM kfe_app`);
    await queryRunner.query(`DROP VIEW IF EXISTS license.v_state`);

    await queryRunner.query(`DROP TABLE IF EXISTS license.update_notice`);
    await queryRunner.query(`DROP TABLE IF EXISTS license.usage_snapshot`);
    await queryRunner.query(`DROP TABLE IF EXISTS license.api_call_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS license.license`);
  }
}
