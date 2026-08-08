import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/01-standards-and-migrations.md §7.2 migration 0001.
 * pgcrypto: crypto primitives (hashing helpers used elsewhere in the schema).
 * pg_trgm: trigram search (FR-PAY-002 ≤2s name search, future std_/proc_/pyrl_ tables).
 * btree_gin: composite GIN indexes mixing scalar + trigram columns.
 */
export class CreateExtensions0001 implements MigrationInterface {
  name = "CreateExtensions1700000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gin"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS "btree_gin"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pg_trgm"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto"`);
  }
}
