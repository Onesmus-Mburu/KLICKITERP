import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 2b, item 4 — `std_guardian.phone` becomes optional: a
 * guardian may now be created with only an email on file (previously
 * `phone` was `NOT NULL`, forcing an email-only guardian to fabricate a
 * placeholder phone number). Mirrors `usr_user`'s own established
 * "contact-or-X" pattern from migration `0010`
 * (`ck_usr_user_contact_or_parent` + `uq_usr_user_phone_p`/`uq_usr_user_email_p`
 * partial unique indexes) exactly:
 *
 *  1. `phone` DROP NOT NULL.
 *  2. The old full-table `uq_std_guardian_phone` UNIQUE constraint is
 *     dropped and replaced by `uq_std_guardian_phone_p ... WHERE phone IS
 *     NOT NULL` — same partial-unique-index naming convention as
 *     `uq_usr_user_phone_p`, so uniqueness is enforced among guardians that
 *     DO have a phone, while any number of guardians may share a NULL
 *     phone.
 *  3. A new `ck_std_guardian_contact` CHECK requires phone OR email — the
 *     DB layer's defense-in-depth mirror of `GuardiansService.create()`'s
 *     new application-layer check (see that service's doc comment), same
 *     G-04 pattern as `ck_usr_user_contact_or_parent`.
 *
 * `down()` reverses all three, in reverse order. Standard caveat applies
 * here as everywhere else in this codebase: if live data now has an
 * email-only guardian row, restoring `phone SET NOT NULL` will fail until
 * that row is fixed up first — not worked around, since retroactively
 * inventing phone numbers for real data would be worse than a blocked
 * rollback (same documented tradeoff every other NOT-NULL-restoring
 * `down()` in this codebase accepts).
 */
export class AlterGuardianPhoneOptional0200 implements MigrationInterface {
  name = "AlterGuardianPhoneOptional1700000000200";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.std_guardian ALTER COLUMN phone DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE app.std_guardian DROP CONSTRAINT uq_std_guardian_phone`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_std_guardian_phone_p ON app.std_guardian (phone) WHERE phone IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE app.std_guardian ADD CONSTRAINT ck_std_guardian_contact
        CHECK (phone IS NOT NULL OR email IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.std_guardian DROP CONSTRAINT ck_std_guardian_contact`);
    await queryRunner.query(`DROP INDEX IF EXISTS app.uq_std_guardian_phone_p`);
    await queryRunner.query(`ALTER TABLE app.std_guardian ADD CONSTRAINT uq_std_guardian_phone UNIQUE (phone)`);
    await queryRunner.query(`ALTER TABLE app.std_guardian ALTER COLUMN phone SET NOT NULL`);
  }
}
