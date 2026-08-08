import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/03-schema-student-finance.md §2, `std_*` DDL — Module 8
 * (Students), the first DOMAIN module. Columns match `domains/students/domain/*.entity.ts`
 * 1:1. Table order follows the FK dependency chain: `std_class` (no deps) ->
 * `std_stream` (FK class) -> `std_fee_group` (no deps) -> `std_student` (FK
 * class/stream/fee_group, plus `file_object` from migration `0035`) ->
 * `std_guardian` (optional FK `usr_user` from migration `0010`) ->
 * `std_student_guardian` (FK student/guardian) -> `std_ledger_entry` (FK
 * student) -> `std_promotion_batch` (FK `set_academic_year` x2 from
 * migration `0030`).
 *
 * **`search_name`** is a real Postgres `GENERATED ALWAYS AS (...) STORED`
 * column — verified TypeORM's `generatedType: 'STORED'`/`asExpression`
 * entity metadata does NOT get synthesized into migration DDL by this
 * codebase's hand-written-migration workflow (no `synchronize` step exists
 * anywhere in the build/deploy path), so the exact expression is spelled out
 * here in raw SQL, kept character-for-character identical to
 * `StdStudentEntity.searchName`'s `asExpression` (that decorator is metadata
 * for TypeORM's query builder/entity hydration to know the column exists and
 * is read-only, not a DDL source in this codebase).
 *
 * **Two performance indexes**, both raw SQL (no TypeORM decorator support
 * for either):
 *  1. `ix_std_student_search_trgm` — a single GIN index over
 *     `(search_name, admission_no)`, both columns using `gin_trgm_ops` (PG
 *     natively supports multiple columns in one GIN index when every column
 *     shares a compatible operator class — no `btree_gin` needed here since
 *     both columns use the same trigram opclass). FR-PAY-002 ≤2s lookup.
 *  2. `ix_std_ledger_entry_posted_at_brin` — BRIN on the append-only
 *     `std_ledger_entry.posted_at` time axis (docs/phase-4/01-standards-and-migrations.md
 *     §6), same treatment as `gl_journal.journal_date`'s BRIN index in
 *     migration `0060`.
 *
 * **`trg_std_student_exit_guard`** — `BEFORE UPDATE` on `std_student`,
 * rejects any flip into `ALUMNI`/`TRANSFERRED`/`WITHDRAWN` from a non-exit
 * status while `exit_cleared=false` (BR-BILL-15's DB-layer defense-in-depth,
 * G-04 — the real "zero outstanding balance" check is a `StudentsService`
 * application-layer placeholder until Billing/Module 9 exists, see that
 * service's doc comment). Mirrors the trigger-writing style of migrations
 * `0010`/`0050`/`0060`.
 *
 * **Forward references, deliberately no FK**: `std_student.sponsor_id` ->
 * `bill_sponsor` and `.transport_route_id` -> `bill_transport_route`
 * (Billing/Module 9, doesn't exist yet) are plain nullable `uuid` columns
 * with no `REFERENCES` clause — Module 9 should add the real FK constraint
 * via its own migration once those tables exist.
 */
export class CreateStudentsTables0065 implements MigrationInterface {
  name = "CreateStudentsTables1700000000065";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.std_class (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(40) NOT NULL,
        level int NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT uq_std_class_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_stream (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        class_id uuid NOT NULL,
        name varchar(40) NOT NULL,
        CONSTRAINT fk_std_stream_class_id FOREIGN KEY (class_id)
          REFERENCES app.std_class(id) ON DELETE RESTRICT,
        CONSTRAINT uq_std_stream_class_name UNIQUE (class_id, name)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_std_stream_class_id ON app.std_stream (class_id)`);

    await queryRunner.query(`
      CREATE TABLE app.std_fee_group (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(60) NOT NULL,
        description text NULL,
        CONSTRAINT uq_std_fee_group_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_student (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        admission_no varchar(30) NOT NULL,
        first_name varchar(60) NOT NULL,
        middle_name varchar(60) NULL,
        last_name varchar(60) NOT NULL,
        search_name text GENERATED ALWAYS AS (
          lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name)
        ) STORED,
        class_id uuid NOT NULL,
        stream_id uuid NULL,
        status varchar(15) NOT NULL,
        boarding varchar(10) NOT NULL,
        fee_group_id uuid NULL,
        sponsor_id uuid NULL,
        transport_route_id uuid NULL,
        photo_file_id uuid NULL,
        custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        enrolled_on date NOT NULL,
        exited_on date NULL,
        exit_cleared boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_std_student_admission_no UNIQUE (admission_no),
        CONSTRAINT fk_std_student_class_id FOREIGN KEY (class_id)
          REFERENCES app.std_class(id) ON DELETE RESTRICT,
        CONSTRAINT fk_std_student_stream_id FOREIGN KEY (stream_id)
          REFERENCES app.std_stream(id) ON DELETE RESTRICT,
        CONSTRAINT fk_std_student_fee_group_id FOREIGN KEY (fee_group_id)
          REFERENCES app.std_fee_group(id) ON DELETE RESTRICT,
        CONSTRAINT fk_std_student_photo_file_id FOREIGN KEY (photo_file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL,
        CONSTRAINT ck_std_student_status CHECK (status IN ('ACTIVE','ALUMNI','TRANSFERRED','SUSPENDED','WITHDRAWN')),
        CONSTRAINT ck_std_student_boarding CHECK (boarding IN ('DAY','BOARDER'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_std_student_search_trgm ON app.std_student
        USING GIN (search_name gin_trgm_ops, admission_no gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_std_student_class ON app.std_student (class_id, stream_id) WHERE status = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_guardian (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        full_name varchar(120) NOT NULL,
        phone varchar(20) NOT NULL,
        email varchar(160) NULL,
        national_id varchar(20) NULL,
        user_id uuid NULL,
        payout_verified jsonb NULL,
        CONSTRAINT uq_std_guardian_phone UNIQUE (phone),
        CONSTRAINT fk_std_guardian_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_student_guardian (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        student_id uuid NOT NULL,
        guardian_id uuid NOT NULL,
        relationship varchar(30) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false,
        receives_billing boolean NOT NULL DEFAULT true,
        CONSTRAINT fk_std_student_guardian_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_std_student_guardian_guardian_id FOREIGN KEY (guardian_id)
          REFERENCES app.std_guardian(id) ON DELETE RESTRICT,
        CONSTRAINT uq_std_student_guardian_pair UNIQUE (student_id, guardian_id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_std_student_guardian_primary_p ON app.std_student_guardian (student_id)
        WHERE is_primary = true
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_ledger_entry (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        student_id uuid NOT NULL,
        entry_date date NOT NULL,
        posted_at timestamptz NOT NULL,
        doc_type varchar(30) NOT NULL,
        doc_id uuid NOT NULL,
        doc_number varchar(30) NOT NULL,
        debit numeric(18,4) NOT NULL DEFAULT 0,
        credit numeric(18,4) NOT NULL DEFAULT 0,
        memo varchar(200) NULL,
        CONSTRAINT fk_std_ledger_entry_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_std_ledger_student_at ON app.std_ledger_entry (student_id, posted_at)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_std_ledger_entry_posted_at_brin ON app.std_ledger_entry USING BRIN (posted_at)
    `);

    await queryRunner.query(`
      CREATE TABLE app.std_promotion_batch (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        from_year_id uuid NOT NULL,
        to_year_id uuid NOT NULL,
        executed_at timestamptz NOT NULL,
        summary jsonb NOT NULL,
        CONSTRAINT fk_std_promotion_batch_from_year_id FOREIGN KEY (from_year_id)
          REFERENCES app.set_academic_year(id) ON DELETE RESTRICT,
        CONSTRAINT fk_std_promotion_batch_to_year_id FOREIGN KEY (to_year_id)
          REFERENCES app.set_academic_year(id) ON DELETE RESTRICT
      )
    `);

    // --- trg_std_student_exit_guard (BR-BILL-15 DB-layer defense-in-depth, G-04) ---
    await queryRunner.query(`
      CREATE FUNCTION app.fn_std_student_exit_guard() RETURNS trigger AS $$
      BEGIN
        IF NEW.status IN ('ALUMNI','TRANSFERRED','WITHDRAWN')
           AND OLD.status NOT IN ('ALUMNI','TRANSFERRED','WITHDRAWN')
           AND NEW.exit_cleared = false THEN
          RAISE EXCEPTION 'BR-BILL-15: student % cannot move to % — exit_cleared must be true first',
            OLD.id, NEW.status
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_std_student_exit_guard
        BEFORE UPDATE ON app.std_student
        FOR EACH ROW EXECUTE FUNCTION app.fn_std_student_exit_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_std_student_exit_guard ON app.std_student`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_std_student_exit_guard()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.std_promotion_batch`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_ledger_entry`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_student_guardian`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_guardian`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_student`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_fee_group`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_stream`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.std_class`);
  }
}
