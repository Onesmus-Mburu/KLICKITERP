import { DataSource, QueryRunner } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, same
 * pattern as `pending-upcoming-invoices.integration.spec.ts` (Phase 6 Slice
 * 8 Part 2), which this test otherwise mirrors closely: Phase 6 Slice 8
 * (Part 4)'s `PayReceiptRepository.findAllPaginated()` (the global Receipts
 * list screen's backing query) filters/joins/paginates via real raw SQL
 * comparisons (`receipt_date >=/<=`, a raw `EXISTS` subquery against
 * `pay_receipt_split` for `method`) that can only be genuinely proven
 * against a real Postgres instance, not a mocked `QueryBuilder`.
 *
 * Fixture-building (journal/account/period/class/student/cashier rows,
 * `openPostingServiceConnection()`) mirrors
 * `payments-triggers.integration.spec.ts`'s own `createReceiptFixture()`
 * exactly (same NOT NULL FK chain `pay_receipt.journal_id` forces) —
 * duplicated locally rather than imported, matching every other integration
 * spec file's own "each file owns its fixture helpers" convention in this
 * codebase (no shared test-utils module exists to import from).
 *
 * Deliberately does NOT assume an empty `pay_receipt` table — every
 * assertion below either checks presence/absence of this test's own known
 * receipt ids within a real result set (robust regardless of how much other
 * real receipt data already exists in whatever dev DB this runs against), or
 * scopes a query by this fixture's own `studentId`/`cashierId` (DB-noise-
 * independent counts for the pagination proof).
 */
describe("PayReceiptRepository.findAllPaginated — Phase 6 Slice 8 (Part 4), global Receipts list (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;
  let repository: PayReceiptRepository;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
      repository = new PayReceiptRepository(dataSource.getRepository(PayReceiptEntity));
    } catch (error) {
      console.warn(
        `[pay-receipt-findall-paginated.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  /** Opens a dedicated connection with `application_name` set for a posting-service-simulated `gl_journal`/`gl_journal_line` write (`trg_gl_writer_guard`, migration `0060`). */
  async function openPostingServiceConnection(source: DataSource): Promise<QueryRunner> {
    const qr = source.createQueryRunner();
    await qr.connect();
    await qr.query(`SET application_name = 'kfe-posting-service'`);
    return qr;
  }

  it(
    "filters by cashierId/dateFrom/dateTo/method, orders receiptDate DESC, joins student/cashier, and paginates correctly",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[pay-receipt-findall-paginated.integration.spec] SKIPPED (no DB) — findAllPaginated filter/join/pagination check");
        return;
      }
      const source = dataSource;
      const suffix = `${Date.now()}`.slice(-10);
      const pqr = await openPostingServiceConnection(source);

      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      const accountAId = generateUuidV7();
      const accountBId = generateUuidV7();
      const journalId = generateUuidV7();
      const classId = generateUuidV7();
      const student1Id = generateUuidV7();
      const student2Id = generateUuidV7();
      const cashier1Id = generateUuidV7();
      const cashier2Id = generateUuidV7();
      const receipt1Id = generateUuidV7(); // student1/cashier1, 2026-01-10, CASH — oldest
      const receipt2Id = generateUuidV7(); // student2/cashier2, 2026-01-20, BANK
      const receipt3Id = generateUuidV7(); // student1/cashier2, 2026-02-01, CASH — newest

      try {
        // ---- FK chain a real pay_receipt row needs: fiscal year -> period -> 2 GL accounts -> a balanced journal.
        await source.query(
          `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
          [fiscalYearId, `RCPT-FY-${suffix}`],
        );
        await source.query(
          `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2026-01-01', '2026-02-28', 'OPEN')`,
          [periodId, fiscalYearId],
        );
        const [payAssetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
           VALUES ($1, $2, 'RCPT Cash', 'ASSET', $3, true, false, true)`,
          [accountAId, `RCPT-ACA-${suffix.slice(-8)}`, payAssetsParent?.id ?? null],
        );
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
           VALUES ($1, $2, 'RCPT AR', 'ASSET', $3, true, true, true)`,
          [accountBId, `RCPT-ACB-${suffix.slice(-8)}`, payAssetsParent?.id ?? null],
        );
        await pqr.query(
          `INSERT INTO app.gl_journal
             (id, number, journal_date, period_id, source_module, source_doc_type, source_doc_id,
              narration, journal_type, posted_by, posted_at)
           VALUES ($1, $2, '2026-01-15', $3, 'PAYMENTS', 'PAY_RECEIPT', $4, 'findAllPaginated test', 'MANUAL', $5, now())`,
          [journalId, `RCPT-JRN-${suffix}`, periodId, generateUuidV7(), generateUuidV7()],
        );
        await pqr.startTransaction();
        await pqr.query(
          `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit) VALUES ($1, $2, 1, $3, 2250.00, 0)`,
          [generateUuidV7(), journalId, accountAId],
        );
        await pqr.query(
          `INSERT INTO app.gl_journal_line (id, journal_id, line_no, account_id, debit, credit) VALUES ($1, $2, 2, $3, 0, 2250.00)`,
          [generateUuidV7(), journalId, accountBId],
        );
        await pqr.commitTransaction();

        // ---- 2 students, 2 cashiers (real names — real join-field proof below).
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `RCPT-CLASS-${suffix}`]);
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Receipt', 'StudentOne', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [student1Id, `RCPT-ADM1-${suffix}`, classId],
        );
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Receipt', 'StudentTwo', $3, 'ACTIVE', 'DAY', '2026-01-01')`,
          [student2Id, `RCPT-ADM2-${suffix}`, classId],
        );
        await source.query(
          `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'Receipt CashierOne', 'ACTIVE', $3)`,
          [cashier1Id, `rcpt-cashier1-${suffix}`, `+2547${suffix}1`],
        );
        await source.query(
          `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'Receipt CashierTwo', 'ACTIVE', $3)`,
          [cashier2Id, `rcpt-cashier2-${suffix}`, `+2547${suffix}2`],
        );

        // ---- 3 real receipts, each with exactly one split covering the full total (trg_pay_splits_sum, BR-PAY-01).
        async function insertReceipt(id: string, number: string, studentId: string, cashierId: string, receiptDate: string, total: string) {
          await source.query(
            `INSERT INTO app.pay_receipt (id, number, student_id, payer_name, receipt_date, total, status, cashier_id, journal_id, balance_after)
             VALUES ($1, $2, $3, 'Test Payer', $4, $5, 'POSTED', $6, $7, $5)`,
            [id, number, studentId, receiptDate, total, cashierId, journalId],
          );
        }
        await insertReceipt(receipt1Id, `RCPT-ONE-${suffix}`, student1Id, cashier1Id, "2026-01-10", "1000.0000");
        await source.query(`INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 1000.0000)`, [
          generateUuidV7(),
          receipt1Id,
        ]);
        await insertReceipt(receipt2Id, `RCPT-TWO-${suffix}`, student2Id, cashier2Id, "2026-01-20", "500.0000");
        await source.query(`INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'BANK', 500.0000)`, [
          generateUuidV7(),
          receipt2Id,
        ]);
        await insertReceipt(receipt3Id, `RCPT-THREE-${suffix}`, student1Id, cashier2Id, "2026-02-01", "750.0000");
        await source.query(`INSERT INTO app.pay_receipt_split (id, receipt_id, method, amount) VALUES ($1, $2, 'CASH', 750.0000)`, [
          generateUuidV7(),
          receipt3Id,
        ]);

        // ---- No filters: all 3 present, ordered receiptDate DESC (receipt3 -> receipt2 -> receipt1), real join fields populated.
        const all = await repository.findAllPaginated({}, { skip: 0, take: 100000 });
        const allIds = all.items.map((r) => r.id);
        expect(allIds).toContain(receipt1Id);
        expect(allIds).toContain(receipt2Id);
        expect(allIds).toContain(receipt3Id);
        expect(allIds.indexOf(receipt3Id)).toBeLessThan(allIds.indexOf(receipt2Id));
        expect(allIds.indexOf(receipt2Id)).toBeLessThan(allIds.indexOf(receipt1Id));
        const receipt1Row = all.items.find((r) => r.id === receipt1Id);
        expect(receipt1Row?.student?.admissionNo).toBe(`RCPT-ADM1-${suffix}`);
        expect(receipt1Row?.cashier?.fullName).toBe("Receipt CashierOne");

        // ---- cashierId filter: only receipt1 (cashier1's only receipt).
        const byCashier1 = await repository.findAllPaginated({ cashierId: cashier1Id }, { skip: 0, take: 100000 });
        expect(byCashier1.items.map((r) => r.id)).toEqual([receipt1Id]);

        // ---- dateFrom (inclusive): excludes receipt1 (Jan 10), includes receipt2 (Jan 20)/receipt3 (Feb 1).
        const fromJan15 = await repository.findAllPaginated({ dateFrom: "2026-01-15" }, { skip: 0, take: 100000 });
        const fromJan15Ids = fromJan15.items.map((r) => r.id);
        expect(fromJan15Ids).not.toContain(receipt1Id);
        expect(fromJan15Ids).toContain(receipt2Id);
        expect(fromJan15Ids).toContain(receipt3Id);

        // ---- dateTo (inclusive): includes receipt1/receipt2, excludes receipt3 (Feb 1).
        const toJan25 = await repository.findAllPaginated({ dateTo: "2026-01-25" }, { skip: 0, take: 100000 });
        const toJan25Ids = toJan25.items.map((r) => r.id);
        expect(toJan25Ids).toContain(receipt1Id);
        expect(toJan25Ids).toContain(receipt2Id);
        expect(toJan25Ids).not.toContain(receipt3Id);

        // ---- method filter (EXISTS subquery against pay_receipt_split, not the receipt itself): CASH -> receipt1+receipt3, not receipt2 (BANK).
        const cashOnly = await repository.findAllPaginated({ method: "CASH" }, { skip: 0, take: 100000 });
        const cashIds = cashOnly.items.map((r) => r.id);
        expect(cashIds).toContain(receipt1Id);
        expect(cashIds).toContain(receipt3Id);
        expect(cashIds).not.toContain(receipt2Id);

        // (`method`, unlike `cashierId` above, is a value real pre-existing DB rows may share —
        // e.g. other slices' own real BANK-method verification receipts — so this asserts
        // presence/absence within the full result set, not strict list equality.)
        const bankOnly = await repository.findAllPaginated({ method: "BANK" }, { skip: 0, take: 100000 });
        const bankIds = bankOnly.items.map((r) => r.id);
        expect(bankIds).toContain(receipt2Id);
        expect(bankIds).not.toContain(receipt1Id);
        expect(bankIds).not.toContain(receipt3Id);

        // ---- pagination, scoped by this fixture's own studentId (DB-noise-independent): student1 has exactly 2 receipts (receipt1, receipt3).
        const student1Page1 = await repository.findAllPaginated({ studentId: student1Id }, { skip: 0, take: 1 });
        expect(student1Page1.items).toHaveLength(1);
        expect(student1Page1.total).toBe(2);
        const student1Page2 = await repository.findAllPaginated({ studentId: student1Id }, { skip: 1, take: 1 });
        expect(student1Page2.items).toHaveLength(1);
        expect(student1Page2.total).toBe(2);
        expect(student1Page1.items[0]?.id).not.toBe(student1Page2.items[0]?.id);

        // ---- Phase 6 Slice 9 (Part B) — `q` ILIKE match against the joined student's `search_name`/`admission_no`.
        const byStudentName = await repository.findAllPaginated({ q: "receipt studentone" }, { skip: 0, take: 100000 });
        const byStudentNameIds = byStudentName.items.map((r) => r.id);
        expect(byStudentNameIds).toContain(receipt1Id);
        expect(byStudentNameIds).toContain(receipt3Id);
        expect(byStudentNameIds).not.toContain(receipt2Id);

        const byAdmissionNo = await repository.findAllPaginated({ q: `RCPT-ADM2-${suffix}` }, { skip: 0, take: 100000 });
        expect(byAdmissionNo.items.map((r) => r.id)).toEqual([receipt2Id]);

        const byNoMatch = await repository.findAllPaginated({ q: `no-such-admission-${suffix}` }, { skip: 0, take: 100000 });
        const byNoMatchIds = byNoMatch.items.map((r) => r.id);
        expect(byNoMatchIds).not.toContain(receipt1Id);
        expect(byNoMatchIds).not.toContain(receipt2Id);
        expect(byNoMatchIds).not.toContain(receipt3Id);
      } finally {
        // trg_pay_splits_sum (BR-PAY-01) is a DEFERRED constraint trigger —
        // deleting the splits and their receipts as two separate
        // auto-committed statements would make the FIRST statement's own
        // commit re-check the (now emptied) split sum against each
        // receipt's still-nonzero total and fail; both deletes must commit
        // together in one transaction, splits-first, so by COMMIT time the
        // receipts are gone too (same fix
        // `payments-triggers.integration.spec.ts`'s own splits-sum test
        // cleanup already documents).
        await runInTransaction(source, async (manager) => {
          await manager.query(`DELETE FROM app.pay_receipt_split WHERE receipt_id = ANY($1::uuid[])`, [
            [receipt1Id, receipt2Id, receipt3Id],
          ]);
          await manager.query(`DELETE FROM app.pay_receipt WHERE id = ANY($1::uuid[])`, [[receipt1Id, receipt2Id, receipt3Id]]);
        });
        await source.query(`DELETE FROM app.std_student WHERE id = ANY($1::uuid[])`, [[student1Id, student2Id]]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.usr_user WHERE id = ANY($1::uuid[])`, [[cashier1Id, cashier2Id]]);
        // gl_journal_line/gl_journal are permanently immutable once posted
        // (trg_gl_journal_immutable, BR-GEN-03), which transitively blocks
        // gl_account/gl_period/gl_fiscal_year (all RESTRICT-referenced) from
        // ever being deleted — left as inert, uniquely-suffixed residue, same
        // precedent `payments-triggers.integration.spec.ts`'s own
        // `destroyReceiptFixture()` documents.
        await pqr.release();
      }
    },
  );
});
