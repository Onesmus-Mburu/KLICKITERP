import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/03-schema-student-finance.md §5, the `wall_*` DDL — Module 11
 * (Wallet). Table order follows the FK dependency chain:
 * `wall_service_point` (FK `gl_account`) -> `wall_service_point_operator`
 * (FK `wall_service_point`/`usr_user`) -> `wall_wallet` (FK `std_student`) ->
 * `wall_transaction` (FK `wall_wallet` x2 self-ref, `wall_service_point`,
 * `pay_receipt`, `gl_journal`).
 *
 * **Writer-guard-trigger judgement call (BR-WALL-01 "no code path may set a
 * balance directly")**: `accounting`'s `gl_journal`/`gl_journal_line`/
 * `gl_period_account_total` carry `trg_gl_writer_guard`, a `BEFORE INSERT OR
 * UPDATE` trigger rejecting any write whose session `application_name` isn't
 * `kfe-posting-service` — that trigger exists because MANY current and
 * future modules (billing, payments, wallet, procurement, payroll, ...) all
 * post into the shared GL tables, so a single choke point is the only way to
 * guarantee every write went through `PostingService`. `wall_wallet` has no
 * equivalent trigger here — a **deliberate judgement call, not an oversight**:
 * exactly ONE service in this entire codebase (`WalletTransactionsService`)
 * will ever touch `wall_wallet.balance`, there is no multi-module fan-in the
 * way GL has, and TypeScript's module boundary (only `wallet.module.ts`
 * registers a repository provider for this entity) already makes it
 * structurally difficult for a stray caller elsewhere in the codebase to
 * write to this table. Adding an `application_name` gate here would be
 * copying a pattern designed to solve a fan-in problem this table doesn't
 * have — over-engineering for a single-writer table. Defense-in-depth
 * instead comes from: (1) `ck_wall_wallet_balance_floor` (the DB-layer BR-WALL-01
 * floor, `balance >= -overdraft_limit`), (2) `trg_wall_wallet_closed_requires_zero`
 * below (BR-WALL-07), and (3) `WallWalletRepository.findByIdForUpdate()`'s
 * row lock discipline, all enforced from application code with no other
 * entry point registered anywhere in the DI graph.
 *
 * **`trg_wall_wallet_closed_requires_zero` (BR-WALL-07)** — `BEFORE UPDATE`,
 * rejects a transition to `status='CLOSED'` unless `NEW.balance = 0`. The
 * final defense-in-depth layer behind `WalletTransactionsService.closeWallet()`,
 * which always applies a zeroing disposition (refund/transfer/apply-to-fees)
 * before flipping status.
 *
 * **`ix_wall_txn_wallet_at`/`ix_wall_txn_service_point`/BRIN(at)** on
 * `wall_transaction` — per the schema doc's own note, `ix_wall_txn_wallet_at`
 * also serves the daily-limit `sumSpendToday()` aggregate query (computed
 * under the wallet's row lock).
 */
export class CreateWalletTables0090 implements MigrationInterface {
  name = "CreateWalletTables1700000000090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.wall_service_point (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(80) NOT NULL,
        type varchar(12) NOT NULL,
        gl_income_account_id uuid NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        per_txn_limit numeric(18,4) NULL,
        CONSTRAINT uq_wall_service_point_name UNIQUE (name),
        CONSTRAINT fk_wall_service_point_gl_income_account_id FOREIGN KEY (gl_income_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT ck_wall_service_point_type CHECK (type IN ('TRANSPORT','LIBRARY','SHOP','MEALS','PRINTING','TRIPS','ACTIVITIES','EMERGENCY','CUSTOM'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.wall_service_point_operator (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        service_point_id uuid NOT NULL,
        user_id uuid NOT NULL,
        CONSTRAINT uq_wall_service_point_operator UNIQUE (service_point_id, user_id),
        CONSTRAINT fk_wall_service_point_operator_service_point_id FOREIGN KEY (service_point_id)
          REFERENCES app.wall_service_point(id) ON DELETE CASCADE,
        CONSTRAINT fk_wall_service_point_operator_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.wall_wallet (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        student_id uuid NOT NULL,
        status varchar(10) NOT NULL,
        balance numeric(18,4) NOT NULL DEFAULT 0,
        overdraft_limit numeric(18,4) NOT NULL DEFAULT 0,
        daily_limit numeric(18,4) NULL,
        txn_limit numeric(18,4) NULL,
        category_blocks varchar(20)[] NOT NULL DEFAULT '{}',
        status_reason text NULL,
        CONSTRAINT uq_wall_wallet_student_id UNIQUE (student_id),
        CONSTRAINT fk_wall_wallet_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT ck_wall_wallet_status CHECK (status IN ('ACTIVE','LOCKED','FROZEN','CLOSED')),
        CONSTRAINT ck_wall_wallet_overdraft_limit_nonneg CHECK (overdraft_limit >= 0),
        CONSTRAINT ck_wall_wallet_balance_floor CHECK (balance >= -overdraft_limit)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.wall_transaction (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        wallet_id uuid NOT NULL,
        type varchar(14) NOT NULL,
        amount numeric(18,4) NOT NULL,
        direction char(1) NOT NULL,
        balance_after numeric(18,4) NOT NULL,
        service_point_id uuid NULL,
        items jsonb NULL,
        counterparty_wallet_id uuid NULL,
        receipt_id uuid NULL,
        journal_id uuid NOT NULL,
        approval_ref uuid NULL,
        reason_code varchar(20) NULL,
        idempotency_key varchar(64) NULL,
        actor_id uuid NULL,
        at timestamptz NOT NULL,
        CONSTRAINT fk_wall_transaction_wallet_id FOREIGN KEY (wallet_id)
          REFERENCES app.wall_wallet(id) ON DELETE RESTRICT,
        CONSTRAINT fk_wall_transaction_service_point_id FOREIGN KEY (service_point_id)
          REFERENCES app.wall_service_point(id) ON DELETE RESTRICT,
        CONSTRAINT fk_wall_transaction_counterparty_wallet_id FOREIGN KEY (counterparty_wallet_id)
          REFERENCES app.wall_wallet(id) ON DELETE RESTRICT,
        CONSTRAINT fk_wall_transaction_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT fk_wall_transaction_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_wall_transaction_type CHECK (type IN ('TOPUP','SPEND','TRANSFER_IN','TRANSFER_OUT','FEE_TRANSFER','REFUND','ADJUSTMENT')),
        CONSTRAINT ck_wall_transaction_direction CHECK (direction IN ('D','C')),
        CONSTRAINT ck_wall_transaction_amount_positive CHECK (amount > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_wall_txn_wallet_at ON app.wall_transaction (wallet_id, at DESC)`);
    await queryRunner.query(`
      CREATE INDEX ix_wall_txn_service_point ON app.wall_transaction (service_point_id, at)
        WHERE service_point_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_wall_transaction_idempotency_key ON app.wall_transaction (idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);
    // Multi-year append-only table axis — BRIN per docs/phase-4/01-standards-and-migrations.md §6.
    await queryRunner.query(`CREATE INDEX ix_wall_transaction_at_brin ON app.wall_transaction USING BRIN (at)`);

    // --- Trigger: trg_wall_wallet_closed_requires_zero (BR-WALL-07) --------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_wall_wallet_closed_requires_zero() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'CLOSED' AND OLD.status <> 'CLOSED' AND NEW.balance <> 0 THEN
          RAISE EXCEPTION 'BR-WALL-07: wallet % cannot close with a nonzero balance (%) — apply a disposition first',
            OLD.id, NEW.balance
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_wall_wallet_closed_requires_zero
        BEFORE UPDATE ON app.wall_wallet
        FOR EACH ROW EXECUTE FUNCTION app.fn_wall_wallet_closed_requires_zero()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_wall_wallet_closed_requires_zero ON app.wall_wallet`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_wall_wallet_closed_requires_zero()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.wall_transaction`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.wall_wallet`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.wall_service_point_operator`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.wall_service_point`);
  }
}
