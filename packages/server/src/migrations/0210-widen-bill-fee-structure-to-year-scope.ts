import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 3b — Fee Structure Redesign. Moves `term_id` OFF
 * `bill_fee_structure` (a structure now spans a whole `academic_year_id`)
 * and onto `bill_fee_structure_line` (each line now carries its own
 * `term_id` + `due_date`) — confirmed, deliberate decision: a single fee
 * structure can now price a full year, with individual categories billed in
 * different terms at different due dates (e.g. Tuition billed every term,
 * an annual Registration fee billed once in Term 1).
 *
 * **Phase A — `bill_fee_structure_line`**: add `term_id`/`due_date` nullable
 * first, backfill from the parent structure's own (soon-to-be-dropped)
 * `term_id` (`due_date` backfills from that term's `ends_on` — a placeholder
 * for pre-existing rows, since no per-line due date existed before this
 * migration), THEN set both NOT NULL, add the FK, and widen the
 * structure+category uniqueness to include `term_id` (a structure may now
 * legitimately have two lines for the same category in two different
 * terms).
 *
 * **The backfill UPDATE must run with `trg_bill_structure_immutable`
 * (migration `0070`) disabled for its duration** — that trigger
 * unconditionally rejects UPDATE/DELETE on any `bill_fee_structure_line` row
 * whose parent `bill_fee_structure.status = 'PUBLISHED'` (BR-BILL-03), and
 * live dev data has most existing structures published. Only the single
 * UPDATE statement runs with the trigger disabled — every DDL statement in
 * this migration (ADD/DROP COLUMN, ADD/DROP CONSTRAINT) is schema-level and
 * never fires row-level triggers, so there is no reason (and no need) to
 * disable it for anything else.
 *
 * **Phase B — `bill_fee_structure`**: drop the old
 * `uq_bill_fee_structure_scope_version` expression index (keyed on
 * `term_id`), drop `fk_bill_fee_structure_term_id` + the `term_id` column
 * itself, then recreate the expression index keyed on `academic_year_id`
 * instead of `term_id` — same COALESCE-sentinel shape as the original
 * (migration `0070`'s class doc comment explains why plain `UNIQUE` can't
 * express this: `stream_id`/`boarding`/`fee_group_id` are nullable scope
 * dimensions and Postgres treats NULL <> NULL, so a naive multi-column
 * UNIQUE would silently allow duplicate "no stream / no boarding / no fee
 * group" rows at the same version).
 *
 * **`down()` is a real one-way door once this feature has actually been
 * used for its intended purpose.** It reverses every step above, backfilling
 * `bill_fee_structure.term_id` from each structure's EARLIEST line (`DISTINCT
 * ON (fee_structure_id)`, ordered by line `seq`-equivalent — this table has
 * no `seq` column, so line `created_at` ASC is the ordering used, joined to
 * `set_term`) — but the final step, restoring the old 2-column
 * `uq_bill_fee_structure_line_structure_category UNIQUE (fee_structure_id,
 * fee_category_id)` constraint, will fail outright with a real uniqueness
 * violation if any structure now has two lines sharing a category across
 * different terms (exactly the shape this feature exists to allow). That is
 * expected and acceptable — a real data-loss-prevention guardrail, not a bug
 * to route around. If this migration is ever reverted after real multi-term
 * lines exist, that data must be manually consolidated (or the affected
 * lines removed) before `down()` can complete.
 */
export class WidenBillFeeStructureToYearScope0210 implements MigrationInterface {
  name = "WidenBillFeeStructureToYearScope1700000000210";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Phase A: bill_fee_structure_line gains term_id + due_date ----
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        ADD COLUMN term_id uuid NULL,
        ADD COLUMN due_date date NULL
    `);

    // Backfill must run with trg_bill_structure_immutable disabled — see class doc comment.
    await queryRunner.query(`ALTER TABLE app.bill_fee_structure_line DISABLE TRIGGER trg_bill_structure_immutable`);
    await queryRunner.query(`
      UPDATE app.bill_fee_structure_line AS l
        SET term_id = s.term_id, due_date = t.ends_on
        FROM app.bill_fee_structure AS s
        JOIN app.set_term AS t ON t.id = s.term_id
        WHERE l.fee_structure_id = s.id
    `);
    await queryRunner.query(`ALTER TABLE app.bill_fee_structure_line ENABLE TRIGGER trg_bill_structure_immutable`);

    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        ALTER COLUMN term_id SET NOT NULL,
        ALTER COLUMN due_date SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        ADD CONSTRAINT fk_bill_fee_structure_line_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        DROP CONSTRAINT uq_bill_fee_structure_line_structure_category
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        ADD CONSTRAINT uq_bill_fee_structure_line_structure_category
          UNIQUE (fee_structure_id, fee_category_id, term_id)
    `);

    // ---- Phase B: bill_fee_structure loses term_id, becomes year-scoped ----
    await queryRunner.query(`DROP INDEX IF EXISTS app.uq_bill_fee_structure_scope_version`);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure DROP CONSTRAINT fk_bill_fee_structure_term_id
    `);
    await queryRunner.query(`ALTER TABLE app.bill_fee_structure DROP COLUMN term_id`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_bill_fee_structure_scope_version ON app.bill_fee_structure (
        academic_year_id,
        class_id,
        COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(boarding, ''),
        COALESCE(fee_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
        version
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ---- Reverse Phase B: bill_fee_structure regains term_id ----
    await queryRunner.query(`DROP INDEX IF EXISTS app.uq_bill_fee_structure_scope_version`);
    await queryRunner.query(`ALTER TABLE app.bill_fee_structure ADD COLUMN term_id uuid NULL`);

    // Backfill from each structure's EARLIEST line (by created_at — this table has no seq
    // column), joined to set_term. A structure with zero lines (shouldn't exist in practice —
    // publish() requires >=1 line — but defensively handled) is left with term_id NULL and will
    // fail the subsequent SET NOT NULL below, surfacing loudly rather than silently.
    await queryRunner.query(`
      UPDATE app.bill_fee_structure AS s
        SET term_id = earliest.term_id
        FROM (
          SELECT DISTINCT ON (fee_structure_id) fee_structure_id, term_id
          FROM app.bill_fee_structure_line
          ORDER BY fee_structure_id, created_at ASC
        ) AS earliest
        WHERE earliest.fee_structure_id = s.id
    `);
    await queryRunner.query(`ALTER TABLE app.bill_fee_structure ALTER COLUMN term_id SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure
        ADD CONSTRAINT fk_bill_fee_structure_term_id FOREIGN KEY (term_id)
          REFERENCES app.set_term(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_bill_fee_structure_scope_version ON app.bill_fee_structure (
        term_id,
        class_id,
        COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(boarding, ''),
        COALESCE(fee_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
        version
      )
    `);

    // ---- Reverse Phase A: bill_fee_structure_line loses term_id/due_date ----
    // This step fails outright (real uniqueness violation) if any structure has two lines
    // sharing a category across different terms — expected/acceptable, see class doc comment.
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        DROP CONSTRAINT uq_bill_fee_structure_line_structure_category
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        ADD CONSTRAINT uq_bill_fee_structure_line_structure_category
          UNIQUE (fee_structure_id, fee_category_id)
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line DROP CONSTRAINT fk_bill_fee_structure_line_term_id
    `);
    await queryRunner.query(`
      ALTER TABLE app.bill_fee_structure_line
        DROP COLUMN term_id,
        DROP COLUMN due_date
    `);
  }
}
