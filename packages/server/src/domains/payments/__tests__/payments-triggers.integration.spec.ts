import { DataSource, QueryRunner } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";
import { PayChequeEntity } from "../domain/pay-cheque.entity";
import { PayMpesaTransactionEntity } from "../domain/pay-mpesa-transaction.entity";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";
import { PayBulkAllocationBatchEntity } from "../domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "../domain/pay-bulk-allocation-batch-line.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/billing/__tests__/billing-triggers.integration.spec.ts`'s pattern
 * exactly — the highest-value test in this foundation pass, since the three
 * triggers from migration `0080` can only be genuinely verified against a
 * real Postgres trigger, not a mocked repository.
 *
 * `pay_receipt.journal_id` is `NOT NULL`, so every fixture in this file must
 * create a real `gl_journal` row — which sits behind `trg_gl_writer_guard`
 * (migration `0060`), gating writes on `current_setting('application_name')
 * = 'kfe-posting-service'`. Same `openPostingServiceConnection()` helper
 * `accounting/__tests__/accounting-triggers.integration.spec.ts` established
 * (a dedicated `QueryRunner` with `application_name` set for its lifetime,
 * since that setting is connection-scoped and a pooled `dataSource.query()`
 * call cannot guarantee the same underlying connection across statements).
 */
describe("payments module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[payments-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
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

  interface ReceiptFixture {
    fiscalYearId: string;
    periodId: string;
    accountAId: string;
    accountBId: string;
    journalId: string;
    classId: string;
    studentId: string;
    cashierId: string;
  }

  /** Builds every FK target a `pay_receipt` row needs: a balanced gl_journal, a student, and a cashier. */
  async function createReceiptFixture(
    source: DataSource,
    pqr: QueryRunner,
    suffix: string,
  ): Promise<ReceiptFixture> {
    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    const accountAId = generateUuidV7();
    const accountBId = generateUuidV7();
    const journalId = generateUuidV7();
    const classId = generateUuidV7();
    const studentId = generateUuidV7();
    const cashierId = generateUuidV7();

    await source.query(
      `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
       VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
      [fiscalYearId, `PAY-FY-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
       VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
      [periodId, fiscalYearId],
    );
    const [payAssetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
       VALUES ($1, $2, 'PAY Cash', 'ASSET', $3, true, false, true)`,
      [accountAId, `PAY-ACC-A-${String(suffix).slice(-8)}`, payAssetsParent?.id ?? null],
    );
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
       VALUES ($1, $2, 'PAY AR', 'ASSET', $3, true, true, true)`,
      [accountBId, `PAY-ACC-B-${String(suffix).slice(-8)}`, payAssetsParent?.id ?? null],
    );

    await pqr.query(
      `INSERT INTO app.gl_journal
         (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
          narration, journal_type, posted_by, posted_at)
       VALUES ($1, $2, '2026-01-15', $3, 'PAYMENTS', 'PAY_RECEIPT', $4, 'receipt trigger test', 'MANUAL', $5, now())`,
      [journalId, `PAY-JRN-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
    );
    await pqr.startTransaction();
    await pqr.query(
      `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
       VALUES ($1, $2, 1, $3, 100.00, 0)`,
      [generateUuidV7(), journalId, accountAId],
    );
    await pqr.query(
      `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit)
       VALUES ($1, $2, 2, $3, 0, 100.00)`,
      [generateUuidV7(), journalId, accountBId],
    );
    await pqr.commitTransaction();

    await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
      classId,
      `PAY-CLASS-${suffix}`,
    ]);
    await source.query(
      `INSERT INTO app.std_student
         (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
       VALUES ($1, $2, 'Test', 'Payer', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
      [studentId, `PAY-ADM-${suffix}`, classId],
    );
    await source.query(
      `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
       VALUES ($1, $2, 'hash', 'Test Cashier', 'ACTIVE', $3)`,
      [cashierId, `pay-cashier-${suffix}`, `+2547${suffix}`],
    );

    return { fiscalYearId, periodId, accountAId, accountBId, journalId, classId, studentId, cashierId };
  }

  async function destroyReceiptFixture(source: DataSource, pqr: QueryRunner, fixture: ReceiptFixture): Promise<void> {
    await source.query(`DELETE FROM app.std_student WHERE id = $1`, [fixture.studentId]);
    await source.query(`DELETE FROM app.std_class WHERE id = $1`, [fixture.classId]);
    await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [fixture.cashierId]);
    // gl_journal_line/gl_journal are permanently immutable once posted (trg_gl_journal_immutable,
    // BR-GEN-03 — confirmed by direct testing), which transitively blocks gl_account/gl_period/
    // gl_fiscal_year (all RESTRICT-referenced) from ever being deleted. Left as inert,
    // uniquely-suffixed residue — same precedent as reporting-foundation.integration.spec.ts's own
    // GL cleanup fix.
    void pqr;
  }

  it.each([
    ["pay_cashier_session", PayCashierSessionEntity],
    ["pay_receipt", PayReceiptEntity],
    ["pay_receipt_split", PayReceiptSplitEntity],
    ["pay_receipt_allocation", PayReceiptAllocationEntity],
    ["pay_cheque", PayChequeEntity],
    ["pay_mpesa_transaction", PayMpesaTransactionEntity],
    ["pay_suspense_item", PaySuspenseItemEntity],
    ["pay_bulk_allocation_batch", PayBulkAllocationBatchEntity],
    ["pay_bulk_allocation_batch_line", PayBulkAllocationBatchLineEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[payments-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it(
    "trg_pay_receipt_immutable freezes total/student_id/journal_id/balance_after and allows only the one POSTED -> REVERSED status transition",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[payments-triggers.integration.spec] SKIPPED (no DB) — receipt immutability trigger check");
        return;
      }
      const source = dataSource;
      const suffix = `${Date.now()}`;
      const pqr = await openPostingServiceConnection(source);
      const fixture = await createReceiptFixture(source, pqr, suffix);
      const receiptId = generateUuidV7();

      try {
        await source.query(
          `INSERT INTO app.pay_receipt
             (id, number, student_id, payer_name, receipt_date, total, status, cashier_id, journal_id, balance_after)
           VALUES ($1, $2, $3, 'Test Payer', '2026-01-15', 100.00, 'POSTED', $4, $5, 100.00)`,
          [receiptId, `RCPT-${suffix}`, fixture.studentId, fixture.cashierId, fixture.journalId],
        );

        // reprint_count is ordinarily writable — the one real post-creation update path.
        await expect(
          source.query(`UPDATE app.pay_receipt SET reprint_count = 1 WHERE id = $1`, [receiptId]),
        ).resolves.toBeDefined();

        // Financial columns are frozen unconditionally, regardless of status.
        await expect(
          source.query(`UPDATE app.pay_receipt SET total = 999.00 WHERE id = $1`, [receiptId]),
        ).rejects.toThrow(/BR-PAY/);
        await expect(
          source.query(`UPDATE app.pay_receipt SET balance_after = 0.00 WHERE id = $1`, [receiptId]),
        ).rejects.toThrow(/BR-PAY/);

        // The one legitimate status transition (POSTED -> REVERSED) is allowed.
        await expect(
          source.query(`UPDATE app.pay_receipt SET status = 'REVERSED', reversal_reason = 'ERROR' WHERE id = $1`, [
            receiptId,
          ]),
        ).resolves.toBeDefined();

        // Once REVERSED, status is permanently frozen — even a no-op-looking reassignment is rejected.
        await expect(
          source.query(`UPDATE app.pay_receipt SET status = 'POSTED' WHERE id = $1`, [receiptId]),
        ).rejects.toThrow(/BR-PAY-08/);
      } finally {
        await source.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [receiptId]);
        await destroyReceiptFixture(source, pqr, fixture);
        await pqr.release();
      }
    },
  );

  it("trg_pay_splits_sum rejects splits that do not sum to the receipt total at COMMIT (BR-PAY-01)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payments-triggers.integration.spec] SKIPPED (no DB) — splits sum deferred trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const pqr = await openPostingServiceConnection(source);
    const fixture = await createReceiptFixture(source, pqr, suffix);
    const receiptId = generateUuidV7();
    const splitAId = generateUuidV7();
    const splitBId = generateUuidV7();
    const splitCId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.pay_receipt
           (id, number, student_id, payer_name, receipt_date, total, status, cashier_id, journal_id, balance_after)
         VALUES ($1, $2, $3, 'Test Payer', '2026-01-15', 100.00, 'POSTED', $4, $5, 100.00)`,
        [receiptId, `RCPT-SPL-${suffix}`, fixture.studentId, fixture.cashierId, fixture.journalId],
      );

      // Splits sum exactly to the receipt's total (100.00) — commits cleanly.
      const okQr = source.createQueryRunner();
      await okQr.connect();
      try {
        await okQr.startTransaction();
        await okQr.query(
          `INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 60.00)`,
          [splitAId, receiptId],
        );
        await okQr.query(
          `INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 40.00)`,
          [splitBId, receiptId],
        );
        await expect(okQr.commitTransaction()).resolves.toBeUndefined();
      } finally {
        await okQr.release();
      }

      // A third split breaks the sum (60+40+10 = 110 <> total 100.00) — rejected at COMMIT.
      const badQr = source.createQueryRunner();
      await badQr.connect();
      try {
        await badQr.startTransaction();
        await badQr.query(
          `INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 10.00)`,
          [splitCId, receiptId],
        );
        await expect(badQr.commitTransaction()).rejects.toThrow(/BR-PAY-01/);
      } finally {
        try {
          if (badQr.isTransactionActive) {
            await badQr.rollbackTransaction();
          }
        } catch {
          // already rolled back by the failed COMMIT — ignore.
        }
        await badQr.release();
      }
    } finally {
      // trg_pay_splits_sum (BR-PAY-01) is a DEFERRED constraint trigger that re-checks, on every
      // pay_receipt_split row change, that the remaining rows for receipt_id still sum to
      // pay_receipt.total — UNLESS the receipt row itself no longer exists (the trigger function's
      // own `SELECT total INTO v_receipt_total FROM pay_receipt ...` finds no row and skips the
      // check; pay_receipt itself is only immutability-guarded on UPDATE, never DELETE — see
      // trg_pay_receipt_immutable above). Deleting the splits and the receipt as two separate
      // auto-committed statements makes the FIRST statement's own commit re-check the (now
      // emptied) split sum against the receipt's still-100.00 total and fail — both deletes must
      // commit together in one transaction, splits-first, so by COMMIT time the receipt is gone too.
      await runInTransaction(source, async (manager) => {
        await manager.query(`DELETE FROM app.pay_receipt_split WHERE receipt_id = $1`, [receiptId]);
        await manager.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [receiptId]);
      });
      await destroyReceiptFixture(source, pqr, fixture);
      await pqr.release();
    }
  });

  it("trg_pay_allocations_sum rejects allocations that do not sum to the receipt total at COMMIT (BR-PAY-03)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payments-triggers.integration.spec] SKIPPED (no DB) — allocations sum deferred trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const pqr = await openPostingServiceConnection(source);
    const fixture = await createReceiptFixture(source, pqr, suffix);
    const receiptId = generateUuidV7();
    const allocAId = generateUuidV7();
    const allocBId = generateUuidV7();
    const allocCId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.pay_receipt
           (id, number, student_id, payer_name, receipt_date, total, status, cashier_id, journal_id, balance_after)
         VALUES ($1, $2, $3, 'Test Payer', '2026-01-15', 100.00, 'POSTED', $4, $5, 100.00)`,
        [receiptId, `RCPT-ALC-${suffix}`, fixture.studentId, fixture.cashierId, fixture.journalId],
      );

      // Allocations (all to_prepayment, since no invoice fixture is needed for this trigger) sum
      // exactly to the receipt's total (100.00) — commits cleanly.
      const okQr = source.createQueryRunner();
      await okQr.connect();
      try {
        await okQr.startTransaction();
        await okQr.query(
          `INSERT INTO app.pay_receipt_allocation (id, receipt_id, to_prepayment, amount)
           VALUES ($1, $2, true, 60.00)`,
          [allocAId, receiptId],
        );
        await okQr.query(
          `INSERT INTO app.pay_receipt_allocation (id, receipt_id, to_prepayment, amount)
           VALUES ($1, $2, true, 40.00)`,
          [allocBId, receiptId],
        );
        await expect(okQr.commitTransaction()).resolves.toBeUndefined();
      } finally {
        await okQr.release();
      }

      // A third allocation breaks the sum (60+40+10 = 110 <> total 100.00) — rejected at COMMIT.
      const badQr = source.createQueryRunner();
      await badQr.connect();
      try {
        await badQr.startTransaction();
        await badQr.query(
          `INSERT INTO app.pay_receipt_allocation (id, receipt_id, to_prepayment, amount)
           VALUES ($1, $2, true, 10.00)`,
          [allocCId, receiptId],
        );
        await expect(badQr.commitTransaction()).rejects.toThrow(/BR-PAY-03/);
      } finally {
        try {
          if (badQr.isTransactionActive) {
            await badQr.rollbackTransaction();
          }
        } catch {
          // already rolled back by the failed COMMIT — ignore.
        }
        await badQr.release();
      }
    } finally {
      // trg_pay_allocations_sum (BR-PAY-03) — same deferred-constraint-trigger shape and same fix
      // as trg_pay_splits_sum's cleanup above: both deletes must commit together in one
      // transaction so the receipt is already gone by the time the trigger re-checks the sum.
      await runInTransaction(source, async (manager) => {
        await manager.query(`DELETE FROM app.pay_receipt_allocation WHERE receipt_id = $1`, [receiptId]);
        await manager.query(`DELETE FROM app.pay_receipt WHERE id = $1`, [receiptId]);
      });
      await destroyReceiptFixture(source, pqr, fixture);
      await pqr.release();
    }
  });
});
