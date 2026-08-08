import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enables the `btree_gist` extension, required by migration `0130`'s two
 * `EXCLUDE USING gist` no-overlap constraints
 * (`pyrl_employee_assignment`/`pyrl_employee_component`) — GiST's native
 * operator classes don't include an `=` equality operator for a plain
 * `uuid` column, which every `EXCLUDE` clause needs to scope the exclusion
 * per-employee (and, for `pyrl_employee_component`, per-employee-per-
 * component too); `btree_gist` supplies that `uuid`/`date` equality
 * operator class support inside a GiST index.
 *
 * Not enabled by migration `0001` (`CreateExtensions0001`) — that migration
 * pre-dates any table needing it (`pgcrypto`/`pg_trgm`/`btree_gin` only) —
 * and is deliberately added here as its OWN migration rather than
 * retroactively editing `0001`, per this codebase's M-2 rule ("one
 * migration = one logical change") and because other modules may already
 * assume `0001`'s contents are fixed. Run BEFORE `0130`
 * (`CreatePayrollTables0130`), which depends on it.
 */
export class EnableBtreeGist0125 implements MigrationInterface {
  name = "EnableBtreeGist1700000000125";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS "btree_gist"`);
  }
}
