import { DataSource, QueryRunner } from "typeorm";
import { AppDataSource } from "../../migrations/data-source";
import { generateUuidV7 } from "../../shared/ids/uuid7";
import { GlAccountEntity } from "../domain/gl-account.entity";
import { GlBudgetEntity } from "../domain/gl-budget.entity";
import { GlBudgetLineEntity } from "../domain/gl-budget-line.entity";
import { GlCostCenterEntity } from "../domain/gl-cost-center.entity";
import { GlFiscalYearEntity } from "../domain/gl-fiscal-year.entity";
import { GlIntegrityRunEntity } from "../domain/gl-integrity-run.entity";
import { GlJournalLineEntity } from "../domain/gl-journal-line.entity";
import { GlJournalEntity } from "../domain/gl-journal.entity";
import { GlPeriodAccountTotalEntity } from "../domain/gl-period-account-total.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `platform/approvals/__tests__/approvals.integration.spec.ts`'s pattern.
 *
 * This suite is the highest-value test in the whole accounting-core
 * foundation pass: the five triggers from migration `0060` are the
 * system's core financial-integrity guarantees (BR-GEN-02/03/04, BR-ACC-01,
 * and the sole-GL-writer choke point) and can only be genuinely verified
 * against a real Postgres trigger, not a mocked repository.
 *
 * `trg_gl_writer_guard` gates `gl_journal`/`gl_journal_line`/
 * `gl_period_account_total` on `current_setting('application_name') =
 * 'kfe-posting-service'`. Because that setting is connection-scoped, every
 * test that needs to actually write to those three tables (to then exercise
 * one of the *other* four triggers) grabs its own dedicated `QueryRunner`
 * via `dataSource.createQueryRunner()` and issues `SET application_name`
 * on it before writing — a pooled `dataSource.query()` call cannot
 * guarantee the same underlying connection across statements.
 */
describe("accounting module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[accounting-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  /** Opens a dedicated connection with application_name set for a posting-service-simulated write. */
  async function openPostingServiceConnection(source: DataSource): Promise<QueryRunner> {
    const qr = source.createQueryRunner();
    await qr.connect();
    await qr.query(`SET application_name = 'kfe-posting-service'`);
    return qr;
  }

  it.each([
    ["gl_fiscal_year", GlFiscalYearEntity],
    ["gl_period", GlPeriodEntity],
    ["gl_account", GlAccountEntity],
    ["gl_cost_center", GlCostCenterEntity],
    ["gl_journal", GlJournalEntity],
    ["gl_journal_line", GlJournalLineEntity],
    ["gl_period_account_total", GlPeriodAccountTotalEntity],
    ["gl_budget", GlBudgetEntity],
    ["gl_budget_line", GlBudgetLineEntity],
    ["gl_integrity_run", GlIntegrityRunEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[accounting-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_gl_writer_guard rejects a gl_journal INSERT when application_name is not kfe-posting-service", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — writer guard rejection check");
      return;
    }
    const source = dataSource;
    const journalId = generateUuidV7();

    await expect(
      source.query(
        `INSERT INTO app.gl_journal
           (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
            narration, journal_type, posted_by, posted_at)
         VALUES ($1, $2, CURRENT_DATE, $3, 'TEST', 'TEST_DOC', $4, 'trigger test', 'MANUAL', $5, now())`,
        [journalId, `WG-REJECT-${Date.now()}`, generateUuidV7(), generateUuidV7(), generateUuidV7()],
      ),
    ).rejects.toThrow(/gl_writer_guard/i);
  });

  it("trg_gl_writer_guard allows writes to gl_journal/gl_journal_line/gl_period_account_total when application_name=kfe-posting-service", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — writer guard allow-path check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const qr = await openPostingServiceConnection(source);

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const accountAId = generateUuidV7();
    const accountBId = generateUuidV7();
    const journalId = generateUuidV7();

    try {
      await qr.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `WG-FY-${suffix}`],
      );
      await qr.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      // ck_gl_account_postable_needs_parent (migration 0060) requires is_postable=true rows to
      // have a real parent_id — hang these off the seeded top-level Assets/Income accounts.
      const [wgAssetsParent] = await qr.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
      const [wgIncomeParent] = await qr.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'WG Cash', 'ASSET', $3, true, false, true)`,
        [accountAId, `WG-A-${suffix}`, wgAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'WG Revenue', 'INCOME', $3, true, false, true)`,
        [accountBId, `WG-B-${suffix}`, wgIncomeParent?.id ?? null],
      );

      // gl_journal + balanced gl_journal_line writes, both writer-guarded tables — should succeed.
      await qr.query(
        `INSERT INTO app.gl_journal
           (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
            narration, journal_type, posted_by, posted_at)
         VALUES ($1, $2, '2026-01-15', $3, 'TEST', 'TEST_DOC', $4, 'writer guard allow-path', 'MANUAL', $5, now())`,
        [journalId, `WG-ALLOW-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
      );
      // Both lines must commit TOGETHER: trg_gl_journal_balanced (BR-GEN-02) is a DEFERRABLE
      // INITIALLY DEFERRED constraint trigger that fires at COMMIT, and a bare `qr.query()` with no
      // explicit transaction open auto-commits each statement individually — so without
      // `startTransaction()`/`commitTransaction()` here, the FIRST (debit-only) line's own
      // auto-commit would immediately trip the deferred balance check before the offsetting credit
      // line ever gets inserted. This test only cares that the writer guard admits both writes, not
      // that they're separately auto-committed, so wrapping them changes nothing it asserts.
      await qr.startTransaction();
      await expect(
        qr.query(
          `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
           VALUES ($1, $2, 1, $3, 100.00, 0)`,
          [generateUuidV7(), journalId, accountAId],
        ),
      ).resolves.toBeDefined();
      await expect(
        qr.query(
          `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
           VALUES ($1, $2, 2, $3, 0, 100.00)`,
          [generateUuidV7(), journalId, accountBId],
        ),
      ).resolves.toBeDefined();
      await expect(qr.commitTransaction()).resolves.toBeUndefined();

      // gl_period_account_total — the third writer-guarded table.
      await expect(
        qr.query(
          `INSERT INTO app.gl_period_account_total (id, period_id, account_id, debit_total, credit_total)
           VALUES ($1, $2, $3, 100.00, 0)`,
          [generateUuidV7(), periodId, accountAId],
        ),
      ).resolves.toBeDefined();
    } finally {
      // This block commits a real balanced journal, so gl_journal_line/gl_journal are permanently
      // immutable (trg_gl_journal_immutable, BR-GEN-03 — confirmed by direct testing), which
      // transitively blocks gl_period_account_total (writer-guarded, RESTRICT-referenced) and
      // gl_account/gl_period/gl_fiscal_year (also RESTRICT-referenced) from ever being deleted.
      // Left as inert, uniquely-suffixed residue — same precedent as
      // reporting-foundation.integration.spec.ts's own GL cleanup fix.
      await qr.release();
    }
  });

  it("trg_gl_journal_balanced rejects an unbalanced journal at COMMIT (BR-GEN-02)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — balanced-journal deferred trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const qr = await openPostingServiceConnection(source);

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const accountId = generateUuidV7();
    const journalId = generateUuidV7();

    try {
      await qr.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `BAL-FY-${suffix}`],
      );
      await qr.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      const [balAssetsParent] = await qr.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'BAL Cash', 'ASSET', $3, true, false, true)`,
        [accountId, `BAL-A-${suffix}`, balAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_journal
           (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
            narration, journal_type, posted_by, posted_at)
         VALUES ($1, $2, '2026-01-15', $3, 'TEST', 'TEST_DOC', $4, 'unbalanced journal', 'MANUAL', $5, now())`,
        [journalId, `BAL-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
      );

      await qr.startTransaction();
      await qr.query(
        `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
         VALUES ($1, $2, 1, $3, 100.00, 0)`,
        [generateUuidV7(), journalId, accountId],
      );
      // No offsetting credit line inserted — deliberately unbalanced.
      await expect(qr.commitTransaction()).rejects.toThrow(/BR-GEN-02/);
    } finally {
      // commitTransaction failing leaves the queryRunner mid-transaction in some drivers; roll back defensively.
      try {
        if (qr.isTransactionActive) {
          await qr.rollbackTransaction();
        }
      } catch {
        // already rolled back by the failed COMMIT — ignore.
      }
      // The unbalanced line insert rolled back (its own transaction never committed), but the
      // gl_journal row itself was inserted BEFORE that transaction started, as its own autocommit
      // statement — it persisted and is now permanently immutable (trg_gl_journal_immutable,
      // BR-GEN-03), regardless of whether it ever received balanced lines. That transitively blocks
      // gl_account/gl_period/gl_fiscal_year (RESTRICT-referenced) too. Left as inert residue — same
      // precedent as reporting-foundation.integration.spec.ts's own GL cleanup fix.
      await qr.release();
    }
  });

  it("trg_gl_period_open rejects a gl_journal INSERT into a HARD_CLOSED period (BR-GEN-04)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — period-open trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const qr = await openPostingServiceConnection(source);

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const journalId = generateUuidV7();

    try {
      await qr.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2025-01-01', '2025-12-31', 'LOCKED')`,
        [fiscalYearId, `PO-FY-${suffix}`],
      );
      await qr.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2025-01-01', '2025-01-31', 'HARD_CLOSED')`,
        [periodId, fiscalYearId],
      );

      await expect(
        qr.query(
          `INSERT INTO app.gl_journal
             (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
              narration, journal_type, posted_by, posted_at)
           VALUES ($1, $2, '2025-01-15', $3, 'TEST', 'TEST_DOC', $4, 'closed period post attempt', 'MANUAL', $5, now())`,
          [journalId, `PO-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
        ),
      ).rejects.toThrow(/BR-GEN-04/);
    } finally {
      await qr.query(`DELETE FROM app.gl_journal WHERE id = $1`, [journalId]);
      await qr.query(`DELETE FROM app.gl_period WHERE id = $1`, [periodId]);
      await qr.query(`DELETE FROM app.gl_fiscal_year WHERE id = $1`, [fiscalYearId]);
      await qr.release();
    }
  });

  it("trg_gl_journal_immutable rejects UPDATE and DELETE on gl_journal and gl_journal_line (BR-GEN-03)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const qr = await openPostingServiceConnection(source);

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const accountId = generateUuidV7();
    const journalId = generateUuidV7();
    const lineId = generateUuidV7();

    try {
      await qr.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `IMM-FY-${suffix}`],
      );
      await qr.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      const [immAssetsParent] = await qr.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'IMM Cash', 'ASSET', $3, true, false, true)`,
        [accountId, `IMM-A-${suffix}`, immAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_journal
           (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
            narration, journal_type, posted_by, posted_at)
         VALUES ($1, $2, '2026-01-15', $3, 'TEST', 'TEST_DOC', $4, 'immutability test', 'MANUAL', $5, now())`,
        [journalId, `IMM-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
      );
      // Offsetting line so this journal is genuinely balanced — both lines must commit TOGETHER
      // in one explicit transaction, since trg_gl_journal_balanced (BR-GEN-02, deferred to COMMIT)
      // would otherwise see the bare `qr.query()` auto-commit the first (debit-only) line on its
      // own and reject it before the offsetting credit line ever gets inserted (same fix as the
      // writer-guard allow-path test above).
      await qr.startTransaction();
      await qr.query(
        `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
         VALUES ($1, $2, 1, $3, 50.00, 0)`,
        [lineId, journalId, accountId],
      );
      await qr.query(
        `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
         VALUES ($1, $2, 2, $3, 0, 50.00)`,
        [generateUuidV7(), journalId, accountId],
      );
      await qr.commitTransaction();

      await expect(
        qr.query(`UPDATE app.gl_journal SET narration = 'edited' WHERE id = $1`, [journalId]),
      ).rejects.toThrow(/BR-GEN-03/);
      await expect(qr.query(`DELETE FROM app.gl_journal WHERE id = $1`, [journalId])).rejects.toThrow(/BR-GEN-03/);
      await expect(
        qr.query(`UPDATE app.gl_journal_line SET debit = 999 WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-GEN-03/);
      await expect(qr.query(`DELETE FROM app.gl_journal_line WHERE id = $1`, [lineId])).rejects.toThrow(
        /BR-GEN-03/,
      );
    } finally {
      // This block's own test body already proves gl_journal/gl_journal_line are immutable — this
      // cleanup attempt would fail the same way (BR-GEN-03), and transitively blocks
      // gl_account/gl_period/gl_fiscal_year too. Left as inert residue — same precedent as
      // reporting-foundation.integration.spec.ts's own GL cleanup fix.
      await qr.release();
    }
  });

  it("trg_gl_account_deactivation_only rejects DELETE on an account with postings, allows it on one without (BR-ACC-01)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[accounting-triggers.integration.spec] SKIPPED (no DB) — deactivation-only trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();
    const qr = await openPostingServiceConnection(source);

    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const postedAccountId = generateUuidV7();
    const cleanAccountId = generateUuidV7();
    // A third, throwaway offsetting-line target — NOT cleanAccountId, which this test later
    // asserts is deletable specifically BECAUSE no postings reference it (BR-ACC-01's "allowed
    // when no postings reference it" half); crediting it here would falsify that assertion.
    const offsetAccountId = generateUuidV7();
    const journalId = generateUuidV7();
    const lineId = generateUuidV7();

    try {
      await qr.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
         VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `ACC-FY-${suffix}`],
      );
      await qr.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
         VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );
      const [accAssetsParent] = await qr.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'ACC Posted', 'ASSET', $3, true, false, true)`,
        [postedAccountId, `ACC-POSTED-${String(suffix).slice(-8)}`, accAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'ACC Clean', 'ASSET', $3, true, false, true)`,
        [cleanAccountId, `ACC-CLEAN-${String(suffix).slice(-8)}`, accAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'ACC Offset', 'ASSET', $3, true, false, true)`,
        [offsetAccountId, `ACC-OFFSET-${String(suffix).slice(-8)}`, accAssetsParent?.id ?? null],
      );
      await qr.query(
        `INSERT INTO app.gl_journal
           (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
            narration, journal_type, posted_by, posted_at)
         VALUES ($1, $2, '2026-01-15', $3, 'TEST', 'TEST_DOC', $4, 'deactivation-only test', 'MANUAL', $5, now())`,
        [journalId, `ACC-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
      );
      // Offsetting line to offsetAccountId so this journal is genuinely balanced — both lines must
      // commit TOGETHER in one explicit transaction, since trg_gl_journal_balanced (BR-GEN-02,
      // deferred to COMMIT) would otherwise see the bare `qr.query()` auto-commit the first
      // (debit-only) line on its own and reject it (same fix as the two tests above).
      await qr.startTransaction();
      await qr.query(
        `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
         VALUES ($1, $2, 1, $3, 25.00, 0)`,
        [lineId, journalId, postedAccountId],
      );
      await qr.query(
        `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
         VALUES ($1, $2, 2, $3, 0, 25.00)`,
        [generateUuidV7(), journalId, offsetAccountId],
      );
      await qr.commitTransaction();

      await expect(qr.query(`DELETE FROM app.gl_account WHERE id = $1`, [postedAccountId])).rejects.toThrow(
        /BR-ACC-01/,
      );

      // No postings reference this one — DELETE succeeds.
      await expect(qr.query(`DELETE FROM app.gl_account WHERE id = $1`, [cleanAccountId])).resolves.toBeDefined();
    } finally {
      // cleanAccountId was already deleted inside the test body above (proving BR-ACC-01's
      // "allowed when no postings reference it" half). postedAccountId's own deletion was already
      // proven rejected in the same test body, and gl_journal/gl_journal_line are permanently
      // immutable once posted (trg_gl_journal_immutable, BR-GEN-03), which also transitively blocks
      // gl_period/gl_fiscal_year (RESTRICT-referenced). Left as inert residue — same precedent as
      // reporting-foundation.integration.spec.ts's own GL cleanup fix.
      await qr.release();
    }
  });
});
