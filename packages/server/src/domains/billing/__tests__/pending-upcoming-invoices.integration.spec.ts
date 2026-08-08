import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, same
 * pattern as `billing-triggers.integration.spec.ts`. Phase 6 Slice 8 (Part
 * 2)'s `BillInvoiceRepository.findOpenPaginated()` bucketing logic can only
 * be genuinely proven against real due-date comparisons in Postgres (raw
 * `<`/`>=` string-date comparisons, not TypeORM operators — see that
 * method's own doc comment) — a mocked `QueryBuilder` would only prove the
 * mock was called correctly, not that the actual SQL predicate buckets
 * correctly at the boundary.
 *
 * Deliberately does NOT scope by `studentId` (the real endpoint/repository
 * method has no such filter — it's a global open-invoices view) — instead,
 * every assertion below checks PRESENCE/ABSENCE of this test's own known
 * invoice ids within the full result set, which is robust regardless of how
 * many other real PENDING/UPCOMING invoices already exist in whatever dev DB
 * this runs against.
 */
describe("BillInvoiceRepository.findOpenPaginated — Pending/Upcoming due-date boundary (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;
  let repository: BillInvoiceRepository;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
      repository = new BillInvoiceRepository(dataSource.getRepository(BillInvoiceEntity));
    } catch (error) {
      console.warn(
        `[pending-upcoming-invoices.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "buckets an invoice due yesterday as PENDING, one due exactly today and one due tomorrow as UPCOMING — " +
      "a VOID overdue invoice and a fully-paid (balance=0) overdue invoice are excluded from both",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[pending-upcoming-invoices.integration.spec] SKIPPED (no DB) — due-date boundary check");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();
      // A fixed, safely-past issue date — no longer REQUIRED to precede
      // every due date (migration `0232`, Slice 10 correction, dropped
      // `ck_bill_invoice_due_after_issue`), kept anyway for realism: these
      // fixture invoices represent real bills issued well before the
      // yesterday/today/tomorrow due dates this test's own boundary check
      // exercises, computed relative to whenever this test actually runs.
      const issueDate = "2000-01-01";
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const academicYearId = generateUuidV7();
      const termId = generateUuidV7();
      const classId = generateUuidV7();
      const studentId = generateUuidV7();
      const overdueInvoiceId = generateUuidV7();
      const dueTodayInvoiceId = generateUuidV7();
      const dueTomorrowInvoiceId = generateUuidV7();
      const voidedOverdueInvoiceId = generateUuidV7();
      const paidOverdueInvoiceId = generateUuidV7();

      async function insertInvoice(id: string, number: string, dueDate: string, status: string, paidAmount: string, balance: string) {
        await source.query(
          `INSERT INTO app.bill_invoice
             (id, number, student_id, term_id, issue_date, due_date, status, source, subtotal, total, paid_amount, balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADHOC', 100.00, 100.00, $8, $9)`,
          [id, number, studentId, termId, issueDate, dueDate, status, paidAmount, balance],
        );
      }

      try {
        await source.query(
          `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2000-01-01', '2099-12-31')`,
          [academicYearId, `PU-AY-${suffix}`],
        );
        await source.query(
          `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
           VALUES ($1, $2, 'Term 1', 1, '2000-01-01', '2099-12-31')`,
          [termId, academicYearId],
        );
        await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `PU-CLASS-${suffix}`]);
        await source.query(
          `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
           VALUES ($1, $2, 'Pending', 'Upcoming', $3, 'ACTIVE', 'DAY', '2000-01-01')`,
          [studentId, `PU-ADM-${suffix}`, classId],
        );

        await insertInvoice(overdueInvoiceId, `PU-OVERDUE-${suffix}`, yesterday, "POSTED", "0.00", "100.00");
        await insertInvoice(dueTodayInvoiceId, `PU-TODAY-${suffix}`, today, "POSTED", "0.00", "100.00");
        await insertInvoice(dueTomorrowInvoiceId, `PU-TOMORROW-${suffix}`, tomorrow, "POSTED", "0.00", "100.00");
        // Overdue by due_date, but VOID — must be excluded from PENDING (status <> 'VOID').
        await insertInvoice(voidedOverdueInvoiceId, `PU-VOIDED-${suffix}`, yesterday, "VOID", "0.00", "100.00");
        // Overdue by due_date, but fully paid (balance = 0) — must be excluded from PENDING (balance > 0).
        await insertInvoice(paidOverdueInvoiceId, `PU-PAID-${suffix}`, yesterday, "PAID", "100.00", "0.00");

        const pending = await repository.findOpenPaginated("PENDING", today, { skip: 0, take: 100000 });
        const pendingIds = new Set(pending.items.map((i) => i.id));
        expect(pendingIds.has(overdueInvoiceId)).toBe(true);
        expect(pendingIds.has(dueTodayInvoiceId)).toBe(false);
        expect(pendingIds.has(dueTomorrowInvoiceId)).toBe(false);
        expect(pendingIds.has(voidedOverdueInvoiceId)).toBe(false);
        expect(pendingIds.has(paidOverdueInvoiceId)).toBe(false);

        const upcoming = await repository.findOpenPaginated("UPCOMING", today, { skip: 0, take: 100000 });
        const upcomingIds = new Set(upcoming.items.map((i) => i.id));
        expect(upcomingIds.has(dueTodayInvoiceId)).toBe(true);
        expect(upcomingIds.has(dueTomorrowInvoiceId)).toBe(true);
        expect(upcomingIds.has(overdueInvoiceId)).toBe(false);
        expect(upcomingIds.has(voidedOverdueInvoiceId)).toBe(false);
        expect(upcomingIds.has(paidOverdueInvoiceId)).toBe(false);

        // The joined student — real fields off the entity's own `student` relation, not a second lookup.
        const upcomingTodayRow = upcoming.items.find((i) => i.id === dueTodayInvoiceId);
        expect(upcomingTodayRow?.student?.admissionNo).toBe(`PU-ADM-${suffix}`);
        expect(upcomingTodayRow?.student?.classId).toBe(classId);
        expect(upcomingTodayRow?.studentId).toBe(studentId);

        // `take` limits the returned page; `total` reflects the whole matching set regardless of
        // page size — a real, DB-noise-robust pagination proof (doesn't assume how many OTHER real
        // pending invoices already exist in whatever dev DB this runs against).
        const pendingSmallPage = await repository.findOpenPaginated("PENDING", today, { skip: 0, take: 1 });
        expect(pendingSmallPage.items).toHaveLength(1);
        expect(pendingSmallPage.total).toBe(pending.total);

        // Phase 6 Slice 9 (Part B) — `q` ILIKE match against the joined
        // student's `search_name` (name concat) or `admission_no`, real
        // against this fixture's own known student ("Pending Upcoming",
        // admission `PU-ADM-${suffix}`).
        const byName = await repository.findOpenPaginated("PENDING", today, { skip: 0, take: 100000 }, "pending upcoming");
        expect(byName.items.map((i) => i.id)).toContain(overdueInvoiceId);

        const byAdmissionNo = await repository.findOpenPaginated("PENDING", today, { skip: 0, take: 100000 }, `PU-ADM-${suffix}`);
        expect(byAdmissionNo.items.map((i) => i.id)).toContain(overdueInvoiceId);

        const byNoMatch = await repository.findOpenPaginated("PENDING", today, { skip: 0, take: 100000 }, `no-such-name-${suffix}`);
        expect(byNoMatch.items.map((i) => i.id)).not.toContain(overdueInvoiceId);
      } finally {
        await source.query(`DELETE FROM app.bill_invoice WHERE student_id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
        await source.query(`DELETE FROM app.std_class WHERE id = $1`, [classId]);
        await source.query(`DELETE FROM app.set_term WHERE id = $1`, [termId]);
        await source.query(`DELETE FROM app.set_academic_year WHERE id = $1`, [academicYearId]);
      }
    },
  );
});
