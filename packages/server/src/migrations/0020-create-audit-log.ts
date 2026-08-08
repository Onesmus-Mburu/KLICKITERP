import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/02-schema-platform-accounting.md §3 (audit.audit_log,
 * audit.chain_anchor) + docs/phase-4/01-standards-and-migrations.md §7.2
 * migration 0020. Matches `packages/server/src/shared/audit/*.entity.ts` 1:1.
 * `seq` is a Postgres identity column giving the hash chain its total order.
 * `kfe_app` gets INSERT/SELECT only — UPDATE/DELETE explicitly revoked here
 * even though migration 0002's default privileges already omit them, so the
 * intent is unambiguous in the migration that creates these specific tables.
 */
export class CreateAuditLog0020 implements MigrationInterface {
  name = "CreateAuditLog1700000000020";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit.audit_log (
        id uuid PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        actor_id uuid NULL,
        actor_label varchar(80) NOT NULL,
        entity_type varchar(60) NOT NULL,
        entity_id uuid NOT NULL,
        action varchar(30) NOT NULL,
        before jsonb NULL,
        after jsonb NULL,
        ip inet NULL,
        session_id uuid NULL,
        at timestamptz NOT NULL DEFAULT now(),
        prev_hash varchar(64) NULL,
        hash varchar(64) NOT NULL,
        CONSTRAINT uq_audit_log_seq UNIQUE (seq)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_audit_entity ON audit.audit_log (entity_type, entity_id, at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_audit_actor_at ON audit.audit_log (actor_id, at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_audit_log_at_brin ON audit.audit_log USING BRIN (at)
    `);

    await queryRunner.query(`
      CREATE TABLE audit.chain_anchor (
        id uuid PRIMARY KEY,
        up_to_seq bigint NOT NULL,
        anchor_hash varchar(64) NOT NULL,
        at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`GRANT SELECT, INSERT ON audit.audit_log TO kfe_app`);
    await queryRunner.query(`GRANT SELECT, INSERT ON audit.chain_anchor TO kfe_app`);
    await queryRunner.query(`REVOKE UPDATE, DELETE ON audit.audit_log FROM kfe_app`);
    await queryRunner.query(`REVOKE UPDATE, DELETE ON audit.chain_anchor FROM kfe_app`);
    await queryRunner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO kfe_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.chain_anchor`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit.audit_log`);
  }
}
