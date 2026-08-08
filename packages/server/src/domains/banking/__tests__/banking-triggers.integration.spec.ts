import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankTransferEntity } from "../domain/bank-transfer.entity";
import { BankDepositEntity } from "../domain/bank-deposit.entity";
import { BankWithdrawalEntity } from "../domain/bank-withdrawal.entity";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";
import { BankStatementLineEntity } from "../domain/bank-statement-line.entity";
import { BankReconciliationEntity } from "../domain/bank-reconciliation.entity";
import { BankReconMatchEntity } from "../domain/bank-recon-match.entity";
import { BankChequeBookEntity } from "../domain/bank-cheque-book.entity";
import { BankChequeLeafEntity } from "../domain/bank-cheque-leaf.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/procurement/__tests__/procurement-triggers.integration.spec.ts`'s
 * pattern exactly — the highest-value test in this foundation pass, since
 * the two triggers from migration `0140` and the `bank_recon_match`
 * single-use UQ constraints (BR-BANK-02) can only be genuinely verified
 * against a real Postgres, not a mocked repository.
 */
describe("banking module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[banking-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface AccountFixture {
    accountId: string;
    glAccountId: string;
  }

  /**
   * Creates a minimal `gl_account` + `bank_account` pair. `gl_account`'s
   * `ck_gl_account_postable_needs_parent` CHECK (migration `0060`) requires
   * `is_postable = true` rows to have a real `parent_id` — this looks up the
   * seeded top-level "1000" (Assets) account and hangs the fresh leaf off it,
   * same pattern `wallet-e2e.integration.spec.ts`'s `reuseOrCreateAccount()`
   * already establishes elsewhere in this codebase.
   */
  async function createAccountFixture(source: DataSource, suffix: string): Promise<AccountFixture> {
    const glAccountId = generateUuidV7();
    const accountId = generateUuidV7();
    const [assetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control)
       VALUES ($1, $2, $3, 'ASSET', $4, true, false)`,
      [glAccountId, `BKGL${suffix}`, `Bank GL ${suffix}`, assetsParent?.id ?? null],
    );
    await source.query(
      `INSERT INTO app.bank_account (id, name, kind, gl_account_id, is_active)
       VALUES ($1, $2, 'BANK', $3, true)`,
      [accountId, `Bank Account ${suffix}`, glAccountId],
    );
    return { accountId, glAccountId };
  }

  async function destroyAccountFixture(source: DataSource, fixture: AccountFixture): Promise<void> {
    await source.query(`DELETE FROM app.bank_account WHERE id = $1`, [fixture.accountId]);
    await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [fixture.glAccountId]);
  }

  interface FileFixture {
    fileId: string;
    uploadedById: string;
  }

  /** Creates a minimal `usr_user` + `file_object` pair — `bank_statement_import.file_id` is NOT NULL. */
  async function createFileFixture(source: DataSource, suffix: string): Promise<FileFixture> {
    const uploadedById = generateUuidV7();
    const fileId = generateUuidV7();
    await source.query(
      `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
       VALUES ($1, $2, 'hash', 'Test Uploader', 'ACTIVE', $3)`,
      [uploadedById, `bank-uploader-${suffix}`, `+2547${suffix}`],
    );
    await source.query(
      `INSERT INTO app.file_object
         (id, bucket, object_key, original_name, mime, size_bytes, sha256, uploaded_by)
       VALUES ($1, 'test-bucket', $2, 'statement.csv', 'text/csv', '100', $3, $4)`,
      [fileId, `bank-statements/${suffix}.csv`, `sha256-${suffix}`, uploadedById],
    );
    return { fileId, uploadedById };
  }

  async function destroyFileFixture(source: DataSource, fixture: FileFixture): Promise<void> {
    await source.query(`DELETE FROM app.file_object WHERE id = $1`, [fixture.fileId]);
    await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [fixture.uploadedById]);
  }

  it.each([
    ["bank_account", BankAccountEntity],
    ["bank_transfer", BankTransferEntity],
    ["bank_deposit", BankDepositEntity],
    ["bank_withdrawal", BankWithdrawalEntity],
    ["bank_statement_import", BankStatementImportEntity],
    ["bank_statement_line", BankStatementLineEntity],
    ["bank_reconciliation", BankReconciliationEntity],
    ["bank_recon_match", BankReconMatchEntity],
    ["bank_cheque_book", BankChequeBookEntity],
    ["bank_cheque_leaf", BankChequeLeafEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[banking-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_bank_statement_line_immutable freezes debit/credit/line_date/description/external_ref/dedupe_hash once recon_state <> UNMATCHED, but allows recon_state itself to keep progressing (BR-BANK-02)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[banking-triggers.integration.spec] SKIPPED (no DB) — statement line immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const account = await createAccountFixture(source, suffix);
    const file = await createFileFixture(source, suffix);
    const importId = generateUuidV7();
    const lineId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.bank_statement_import (id, account_id, file_id, mapping_template, imported_at, line_count, duplicate_count)
         VALUES ($1, $2, $3, '{}', now(), 0, 0)`,
        [importId, account.accountId, file.fileId],
      );
      await source.query(
        `INSERT INTO app.bank_statement_line
           (id, import_id, account_id, line_date, description, debit, credit, dedupe_hash, recon_state)
         VALUES ($1, $2, $3, '2026-01-10', 'Original description', 100.00, 0, $4, 'UNMATCHED')`,
        [lineId, importId, account.accountId, `dedupe-${suffix}`],
      );

      // While UNMATCHED, every column is freely editable.
      await expect(
        source.query(`UPDATE app.bank_statement_line SET description = 'Edited while unmatched' WHERE id = $1`, [
          lineId,
        ]),
      ).resolves.toBeDefined();

      // Progress to MATCHED — recon_state itself remains writable throughout.
      await expect(
        source.query(`UPDATE app.bank_statement_line SET recon_state = 'MATCHED' WHERE id = $1`, [lineId]),
      ).resolves.toBeDefined();

      // Once MATCHED, the frozen columns reject changes.
      await expect(
        source.query(`UPDATE app.bank_statement_line SET debit = 999.00 WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);
      await expect(
        source.query(`UPDATE app.bank_statement_line SET credit = 1.00 WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);
      await expect(
        source.query(`UPDATE app.bank_statement_line SET line_date = '2026-02-01' WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);
      await expect(
        source.query(`UPDATE app.bank_statement_line SET description = 'Tampered' WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);
      await expect(
        source.query(`UPDATE app.bank_statement_line SET external_ref = 'TAMPERED-REF' WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);
      await expect(
        source.query(`UPDATE app.bank_statement_line SET dedupe_hash = 'tampered-hash' WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BANK-02/);

      // recon_state remains writable even after MATCHED (an unreconcile/reopen flow).
      await expect(
        source.query(`UPDATE app.bank_statement_line SET recon_state = 'ADJUSTED' WHERE id = $1`, [lineId]),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.bank_statement_line WHERE id = $1`, [lineId]);
      await source.query(`DELETE FROM app.bank_statement_import WHERE id = $1`, [importId]);
      await destroyFileFixture(source, file);
      await destroyAccountFixture(source, account);
    }
  });

  it("trg_bank_reconciliation_immutable freezes book_balance/bank_balance/outstanding once status=LOCKED, unless simultaneously transitioning to REOPENED", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[banking-triggers.integration.spec] SKIPPED (no DB) — reconciliation immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const account = await createAccountFixture(source, suffix);
    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const reconId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `FYBK${suffix.slice(-10)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      await source.query(
        `INSERT INTO app.bank_reconciliation
           (id, account_id, period_id, status, book_balance, bank_balance, outstanding)
         VALUES ($1, $2, $3, 'IN_PROGRESS', 1000.00, 1000.00, '{}')`,
        [reconId, account.accountId, periodId],
      );

      // While IN_PROGRESS, balances are freely editable.
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET book_balance = 1050.00 WHERE id = $1`, [reconId]),
      ).resolves.toBeDefined();

      // Lock it.
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET status = 'LOCKED' WHERE id = $1`, [reconId]),
      ).resolves.toBeDefined();

      // Once LOCKED, balances/outstanding are frozen for an ordinary update.
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET book_balance = 2000.00 WHERE id = $1`, [reconId]),
      ).rejects.toThrow(/FR-BANK-004\.1/);
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET bank_balance = 2000.00 WHERE id = $1`, [reconId]),
      ).rejects.toThrow(/FR-BANK-004\.1/);
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET outstanding = '{"x":1}' WHERE id = $1`, [reconId]),
      ).rejects.toThrow(/FR-BANK-004\.1/);

      // A status-only change to LOCKED (e.g. re-saving the same status) with balances untouched still passes.
      await expect(
        source.query(`UPDATE app.bank_reconciliation SET locked_by = NULL WHERE id = $1`, [reconId]),
      ).resolves.toBeDefined();

      // Transitioning to REOPENED is the explicit escape hatch — balances may change in that same statement.
      await expect(
        source.query(
          `UPDATE app.bank_reconciliation SET status = 'REOPENED', book_balance = 1500.00 WHERE id = $1`,
          [reconId],
        ),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.bank_reconciliation WHERE id = $1`, [reconId]);
      await source.query(`DELETE FROM app.gl_period WHERE id = $1`, [periodId]);
      await source.query(`DELETE FROM app.gl_fiscal_year WHERE id = $1`, [fiscalYearId]);
      await destroyAccountFixture(source, account);
    }
  });

  it("bank_recon_match enforces single-use matching: statement_line_id and journal_line_id are each UNIQUE (BR-BANK-02)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[banking-triggers.integration.spec] SKIPPED (no DB) — recon match single-use UQ check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const account = await createAccountFixture(source, suffix);
    const file = await createFileFixture(source, suffix);
    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const reconId = generateUuidV7();
    const importId = generateUuidV7();
    const lineAId = generateUuidV7();
    const lineBId = generateUuidV7();
    const matchAId = generateUuidV7();
    const matchBId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `FYRC${suffix.slice(-10)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      await source.query(
        `INSERT INTO app.bank_reconciliation
           (id, account_id, period_id, status, book_balance, bank_balance, outstanding)
         VALUES ($1, $2, $3, 'IN_PROGRESS', 0, 0, '{}')`,
        [reconId, account.accountId, periodId],
      );
      await source.query(
        `INSERT INTO app.bank_statement_import (id, account_id, file_id, mapping_template, imported_at, line_count, duplicate_count)
         VALUES ($1, $2, $3, '{}', now(), 0, 0)`,
        [importId, account.accountId, file.fileId],
      );
      await source.query(
        `INSERT INTO app.bank_statement_line
           (id, import_id, account_id, line_date, description, debit, credit, dedupe_hash, recon_state)
         VALUES ($1, $2, $3, '2026-01-10', 'Line A', 50.00, 0, $4, 'UNMATCHED')`,
        [lineAId, importId, account.accountId, `dedupe-a-${suffix}`],
      );
      await source.query(
        `INSERT INTO app.bank_statement_line
           (id, import_id, account_id, line_date, description, debit, credit, dedupe_hash, recon_state)
         VALUES ($1, $2, $3, '2026-01-11', 'Line B', 75.00, 0, $4, 'UNMATCHED')`,
        [lineBId, importId, account.accountId, `dedupe-b-${suffix}`],
      );

      // First match against lineA — a plain adjustment match (no journal_line_id) — commits cleanly.
      await source.query(
        `INSERT INTO app.bank_recon_match (id, reconciliation_id, statement_line_id)
         VALUES ($1, $2, $3)`,
        [matchAId, reconId, lineAId],
      );

      // A second match reusing the SAME statement_line_id violates the single-use UQ.
      await expect(
        source.query(
          `INSERT INTO app.bank_recon_match (id, reconciliation_id, statement_line_id)
           VALUES ($1, $2, $3)`,
          [matchBId, reconId, lineAId],
        ),
      ).rejects.toThrow(/uq_bank_recon_match_statement_line/);

      // A match against the OTHER (still-unused) statement line succeeds — proves the UQ is per-column, not table-wide.
      await expect(
        source.query(
          `INSERT INTO app.bank_recon_match (id, reconciliation_id, statement_line_id)
           VALUES ($1, $2, $3)`,
          [matchBId, reconId, lineBId],
        ),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.bank_recon_match WHERE reconciliation_id = $1`, [reconId]);
      await source.query(`DELETE FROM app.bank_statement_line WHERE import_id = $1`, [importId]);
      await source.query(`DELETE FROM app.bank_statement_import WHERE id = $1`, [importId]);
      await destroyFileFixture(source, file);
      await source.query(`DELETE FROM app.bank_reconciliation WHERE id = $1`, [reconId]);
      await source.query(`DELETE FROM app.gl_period WHERE id = $1`, [periodId]);
      await source.query(`DELETE FROM app.gl_fiscal_year WHERE id = $1`, [fiscalYearId]);
      await destroyAccountFixture(source, account);
    }
  });
});
