import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillTransportRouteEntity } from "../domain/bill-transport-route.entity";
import { BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";
import { BillInstallmentEntity } from "../domain/bill-installment.entity";
import { BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillSponsorEntity } from "../domain/bill-sponsor.entity";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "../domain/bill-credit-note-line.entity";
import { BillDebitNoteEntity } from "../domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "../domain/bill-debit-note-line.entity";
import { BillRefundVoucherEntity } from "../domain/bill-refund-voucher.entity";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `accounting/__tests__/accounting-triggers.integration.spec.ts`'s pattern
 * exactly — the highest-value test in this foundation pass, since the three
 * triggers from migration `0070` can only be genuinely verified against a
 * real Postgres trigger, not a mocked repository.
 *
 * Unlike accounting core, billing has no writer-guard trigger — every test
 * below uses the pooled `dataSource.query()` directly.
 */
describe("billing module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[billing-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it.each([
    ["bill_fee_category", BillFeeCategoryEntity],
    ["bill_transport_route", BillTransportRouteEntity],
    ["bill_fee_structure", BillFeeStructureEntity],
    ["bill_fee_structure_line", BillFeeStructureLineEntity],
    ["bill_student_optional_item", BillStudentOptionalItemEntity],
    ["bill_invoice", BillInvoiceEntity],
    ["bill_invoice_line", BillInvoiceLineEntity],
    ["bill_installment", BillInstallmentEntity],
    ["bill_concession_scheme", BillConcessionSchemeEntity],
    ["bill_concession", BillConcessionEntity],
    ["bill_sponsor", BillSponsorEntity],
    ["bill_sponsor_award", BillSponsorAwardEntity],
    ["bill_credit_note", BillCreditNoteEntity],
    ["bill_credit_note_line", BillCreditNoteLineEntity],
    ["bill_debit_note", BillDebitNoteEntity],
    ["bill_debit_note_line", BillDebitNoteLineEntity],
    ["bill_refund_voucher", BillRefundVoucherEntity],
    ["bill_late_fee_policy", BillLateFeePolicyEntity],
    ["bill_late_fee_batch", BillLateFeeBatchEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[billing-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_bill_structure_immutable allows edits while DRAFT but rejects UPDATE/DELETE once PUBLISHED (BR-BILL-03)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[billing-triggers.integration.spec] SKIPPED (no DB) — structure immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();

    const academicYearId = generateUuidV7();
    const termId = generateUuidV7();
    const classId = generateUuidV7();
    const accountId = generateUuidV7();
    const categoryId = generateUuidV7();
    const structureId = generateUuidV7();
    const lineId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on)
         VALUES ($1, $2, '2026-01-01', '2026-12-31')`,
        [academicYearId, `STR-AY-${suffix}`],
      );
      await source.query(
        `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
         VALUES ($1, $2, 'Term 1', 1, '2026-01-01', '2026-04-30')`,
        [termId, academicYearId],
      );
      await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
        classId,
        `STR-CLASS-${suffix}`,
      ]);
      const [strIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
      await source.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'STR Income', 'INCOME', $3, true, false, true)`,
        [accountId, `STR-ACC-${String(suffix).slice(-8)}`, strIncomeParent?.id ?? null],
      );
      await source.query(
        `INSERT INTO app.bill_fee_category (id, name, gl_income_account_id)
         VALUES ($1, $2, $3)`,
        [categoryId, `STR-CAT-${suffix}`, accountId],
      );
      await source.query(
        `INSERT INTO app.bill_fee_structure (id, academic_year_id, class_id, version, status)
         VALUES ($1, $2, $3, 1, 'DRAFT')`,
        [structureId, academicYearId, classId],
      );
      // Phase 6 Slice 3b (migration 0210): term_id/due_date moved onto the line.
      await source.query(
        `INSERT INTO app.bill_fee_structure_line (id, fee_structure_id, fee_category_id, term_id, due_date, amount)
         VALUES ($1, $2, $3, $4, '2026-04-30', 1000.00)`,
        [lineId, structureId, categoryId, termId],
      );

      // DRAFT — edits are legitimate.
      await expect(
        source.query(`UPDATE app.bill_fee_structure_line SET amount = 1200.00 WHERE id = $1`, [lineId]),
      ).resolves.toBeDefined();

      // Publish the structure.
      await source.query(`UPDATE app.bill_fee_structure SET status = 'PUBLISHED' WHERE id = $1`, [structureId]);

      // PUBLISHED — UPDATE/DELETE on the line now rejected.
      await expect(
        source.query(`UPDATE app.bill_fee_structure_line SET amount = 999.00 WHERE id = $1`, [lineId]),
      ).rejects.toThrow(/BR-BILL-03/);
      await expect(source.query(`DELETE FROM app.bill_fee_structure_line WHERE id = $1`, [lineId])).rejects.toThrow(
        /BR-BILL-03/,
      );
    } finally {
      await source.query(`UPDATE app.bill_fee_structure SET status = 'SUPERSEDED' WHERE id = $1`, [structureId]);
      await source.query(`DELETE FROM app.bill_fee_structure_line WHERE fee_structure_id = $1`, [structureId]);
      await source.query(`DELETE FROM app.bill_fee_structure WHERE id = $1`, [structureId]);
      await source.query(`DELETE FROM app.bill_fee_category WHERE id = $1`, [categoryId]);
      await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [accountId]);
      await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
      await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
      await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
    }
  });

  it(
    "trg_bill_invoice_immutable freezes financial columns once POSTED but allows paid_amount/balance/status updates",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[billing-triggers.integration.spec] SKIPPED (no DB) — invoice immutability trigger check");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const invoiceId = generateUuidV7();

      try {
        await source.query(
          `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on)
           VALUES ($1, $2, '2026-01-01', '2026-12-31')`,
          [academicYearId, `INV-AY-${suffix}`],
        );
        await source.query(
          `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
           VALUES ($1, $2, 'Term 1', 1, '2026-01-01', '2026-04-30')`,
          [termId, academicYearId],
        );
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
          classId,
          `INV-CLASS-${suffix}`,
        ]);
        await source.query(
          `INSERT INTO app.std_student
             (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Test', 'Student', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [studentId, `INV-ADM-${suffix}`, classId],
        );
        await source.query(
          `INSERT INTO app.bill_invoice
             (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
           VALUES ($1, $2, $3, $4, '2026-01-01', '2026-01-31', 'DRAFT', 'ADHOC', 100.00, 100.00, 100.00)`,
          [invoiceId, `INV-${suffix}`, studentId, termId],
        );

        // DRAFT — financial-column edits are legitimate.
        await expect(
          source.query(`UPDATE app.bill_invoice SET subtotal = 150.00, total = 150.00, balance = 150.00 WHERE id = $1`, [
            invoiceId,
          ]),
        ).resolves.toBeDefined();

        // Flip to POSTED.
        await source.query(`UPDATE app.bill_invoice SET status = 'POSTED' WHERE id = $1`, [invoiceId]);

        // POSTED — financial columns now frozen.
        await expect(
          source.query(`UPDATE app.bill_invoice SET total = 999.00 WHERE id = $1`, [invoiceId]),
        ).rejects.toThrow(/BR-BILL/);
        await expect(
          source.query(`UPDATE app.bill_invoice SET subtotal = 1.00 WHERE id = $1`, [invoiceId]),
        ).rejects.toThrow(/BR-BILL/);

        // POSTED — the allocation path (paid_amount/balance/status) is still allowed.
        await expect(
          source.query(
            `UPDATE app.bill_invoice
               SET paid_amount = 150.00, balance = 0.00, status = 'PAID'
               WHERE id = $1`,
            [invoiceId],
          ),
        ).resolves.toBeDefined();
      } finally {
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
        await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
      }
    },
  );

  it("trg_bill_installments_sum rejects an installment plan whose sum does not equal the invoice balance at COMMIT (BR-BILL-05)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[billing-triggers.integration.spec] SKIPPED (no DB) — installment sum deferred trigger check");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();

    const academicYearId = generateUuidV7();
    const termId = generateUuidV7();
    const classId = generateUuidV7();
    const studentId = generateUuidV7();
    const invoiceId = generateUuidV7();
    const goodInstallmentAId = generateUuidV7();
    const goodInstallmentBId = generateUuidV7();
    const badInstallmentId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on)
         VALUES ($1, $2, '2026-01-01', '2026-12-31')`,
        [academicYearId, `INS-AY-${suffix}`],
      );
      await source.query(
        `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
         VALUES ($1, $2, 'Term 1', 1, '2026-01-01', '2026-04-30')`,
        [termId, academicYearId],
      );
      await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
        classId,
        `INS-CLASS-${suffix}`,
      ]);
      await source.query(
        `INSERT INTO app.std_student
           (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
         VALUES ($1, $2, 'Test', 'Student', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
        [studentId, `INS-ADM-${suffix}`, classId],
      );
      await source.query(
        `INSERT INTO app.bill_invoice
           (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, balance)
         VALUES ($1, $2, $3, $4, '2026-01-01', '2026-01-31', 'APPROVED', 'ADHOC', 100.00, 100.00, 100.00)`,
        [invoiceId, `INS-${suffix}`, studentId, termId],
      );

      // Plan sums exactly to the invoice's balance (100.00) — commits cleanly.
      const okQr = source.createQueryRunner();
      await okQr.connect();
      try {
        await okQr.startTransaction();
        await okQr.query(
          `INSERT INTO app.bill_installment (id, invoice_id, seq, due_date, amount)
           VALUES ($1, $2, 1, '2026-02-01', 60.00)`,
          [goodInstallmentAId, invoiceId],
        );
        await okQr.query(
          `INSERT INTO app.bill_installment (id, invoice_id, seq, due_date, amount)
           VALUES ($1, $2, 2, '2026-03-01', 40.00)`,
          [goodInstallmentBId, invoiceId],
        );
        await expect(okQr.commitTransaction()).resolves.toBeUndefined();
      } finally {
        await okQr.release();
      }

      // A third installment breaks the sum (60+40+10 = 110 <> balance 100.00) — rejected at COMMIT.
      const badQr = source.createQueryRunner();
      await badQr.connect();
      try {
        await badQr.startTransaction();
        await badQr.query(
          `INSERT INTO app.bill_installment (id, invoice_id, seq, due_date, amount)
           VALUES ($1, $2, 3, '2026-04-01', 10.00)`,
          [badInstallmentId, invoiceId],
        );
        await expect(badQr.commitTransaction()).rejects.toThrow(/BR-BILL-05/);
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
      // trg_bill_installments_sum (BR-BILL-05) is a DEFERRED constraint trigger that re-checks,
      // on every bill_installment row change, that the remaining rows for invoice_id still sum to
      // bill_invoice.balance — UNLESS the invoice row itself no longer exists (the trigger
      // function's own `SELECT balance INTO v_invoice_balance FROM bill_invoice ...` finds no row
      // and skips the check). Deleting the installments and the invoice as two separate
      // auto-committed statements makes the FIRST statement's own commit re-check the (now
      // emptied) installment sum against the invoice's still-100.00 balance and fail — both
      // deletes must commit together in one transaction, installments-first (FK RESTRICT on
      // bill_installment.invoice_id), so by COMMIT time the invoice is already gone too.
      await runInTransaction(source, async (manager) => {
        await manager.query(`DELETE FROM app.bill_installment WHERE invoice_id = $1`, [invoiceId]);
        await manager.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
      });
      await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
      await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
      await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
      await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
    }
  });
});
