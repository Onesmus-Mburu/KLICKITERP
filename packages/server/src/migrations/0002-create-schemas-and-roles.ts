import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/01-standards-and-migrations.md §1 + §7.2 migration 0002.
 * Three schemas (`app` default app tables, `license` structurally isolated
 * per FR-LIC-004/ADR-002, `audit` insert-only hash-chained log) and three
 * roles with least-privilege grants:
 *  - kfe_migrate: DDL (CREATE+USAGE) on all three schemas — migrations only, never app boot (M-5).
 *  - kfe_app: DML only on `app`; INSERT/SELECT only on `audit` (no UPDATE/DELETE); no access to `license`.
 *  - kfe_license: DML only on `license`; no access to `app`.
 * `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` guards make
 * role creation safe to re-run (idempotent on a partially-provisioned DB).
 * Passwords here are dev placeholders matching `.env.example` — production
 * provisioning rotates them via `ALTER ROLE ... PASSWORD` outside migrations.
 */
export class CreateSchemasAndRoles0002 implements MigrationInterface {
  name = "CreateSchemasAndRoles1700000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS app`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS license`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS audit`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE ROLE kfe_app LOGIN PASSWORD 'changeme';
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE ROLE kfe_license LOGIN PASSWORD 'changeme';
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE ROLE kfe_migrate LOGIN PASSWORD 'changeme';
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // kfe_migrate: DDL on all three schemas.
    await queryRunner.query(`GRANT CREATE, USAGE ON SCHEMA app TO kfe_migrate`);
    await queryRunner.query(`GRANT CREATE, USAGE ON SCHEMA license TO kfe_migrate`);
    await queryRunner.query(`GRANT CREATE, USAGE ON SCHEMA audit TO kfe_migrate`);

    // kfe_app: DML only on app (present + future tables/sequences created by kfe_migrate).
    await queryRunner.query(`GRANT USAGE ON SCHEMA app TO kfe_app`);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA app
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kfe_app
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA app
        GRANT USAGE, SELECT ON SEQUENCES TO kfe_app
    `);

    // kfe_app: INSERT/SELECT only on audit (no UPDATE/DELETE — explicit REVOKE reinforced per-table in 0020).
    await queryRunner.query(`GRANT USAGE ON SCHEMA audit TO kfe_app`);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA audit
        GRANT SELECT, INSERT ON TABLES TO kfe_app
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA audit
        GRANT USAGE, SELECT ON SEQUENCES TO kfe_app
    `);

    // kfe_license: DML only on license (present + future tables/sequences).
    await queryRunner.query(`GRANT USAGE ON SCHEMA license TO kfe_license`);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA license
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kfe_license
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA license
        GRANT USAGE, SELECT ON SEQUENCES TO kfe_license
    `);

    // kfe_app has no license.* access, kfe_license has no app.* access — default deny, no grants issued either way.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA license REVOKE ALL ON TABLES FROM kfe_license`);
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA license REVOKE ALL ON SEQUENCES FROM kfe_license`);
    await queryRunner.query(`REVOKE USAGE ON SCHEMA license FROM kfe_license`);

    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA audit REVOKE ALL ON TABLES FROM kfe_app`);
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA audit REVOKE ALL ON SEQUENCES FROM kfe_app`);
    await queryRunner.query(`REVOKE USAGE ON SCHEMA audit FROM kfe_app`);

    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA app REVOKE ALL ON TABLES FROM kfe_app`);
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE kfe_migrate IN SCHEMA app REVOKE ALL ON SEQUENCES FROM kfe_app`);
    await queryRunner.query(`REVOKE USAGE ON SCHEMA app FROM kfe_app`);

    await queryRunner.query(`REVOKE CREATE, USAGE ON SCHEMA audit FROM kfe_migrate`);
    await queryRunner.query(`REVOKE CREATE, USAGE ON SCHEMA license FROM kfe_migrate`);
    await queryRunner.query(`REVOKE CREATE, USAGE ON SCHEMA app FROM kfe_migrate`);

    await queryRunner.query(`DROP ROLE IF EXISTS kfe_migrate`);
    await queryRunner.query(`DROP ROLE IF EXISTS kfe_license`);
    await queryRunner.query(`DROP ROLE IF EXISTS kfe_app`);

    await queryRunner.query(`DROP SCHEMA IF EXISTS audit CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS license CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS app CASCADE`);
  }
}
