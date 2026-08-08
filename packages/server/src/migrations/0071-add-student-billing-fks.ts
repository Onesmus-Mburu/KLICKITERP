import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closes the Module 8 (Students) forward-reference gap flagged in migration
 * `0065`'s doc comment and `docs/phase-5/PROGRESS.md`'s Module 8 row:
 * `std_student.sponsor_id`/`.transport_route_id` were left as bare `uuid`
 * columns with no FK because `bill_sponsor`/`bill_transport_route` (migration
 * `0070`, this pass) didn't exist yet. Now that they do, this small
 * follow-up migration adds the real FK constraints — `RESTRICT` (this
 * codebase's default FK mode, matches `StdStudentEntity`'s updated doc
 * comment): a sponsor/route still referenced by a student cannot be
 * deleted, only deactivated (`is_active = false`), same precedent as
 * `gl_account`/`std_class`.
 *
 * Deliberately its own migration rather than folded into `0070` — `0070`
 * only touches `bill_*` tables it owns; altering `std_student` (a Module 8
 * table) belongs to a separate, clearly-attributable migration, mirroring
 * how migration numbering elsewhere in this codebase keeps one migration
 * per logical unit of schema change.
 */
export class AddStudentBillingFks0071 implements MigrationInterface {
  name = "AddStudentBillingFks1700000000071";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.std_student
        ADD CONSTRAINT fk_std_student_sponsor FOREIGN KEY (sponsor_id)
          REFERENCES app.bill_sponsor(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.std_student
        ADD CONSTRAINT fk_std_student_transport_route FOREIGN KEY (transport_route_id)
          REFERENCES app.bill_transport_route(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.std_student DROP CONSTRAINT IF EXISTS fk_std_student_transport_route`);
    await queryRunner.query(`ALTER TABLE app.std_student DROP CONSTRAINT IF EXISTS fk_std_student_sponsor`);
  }
}
