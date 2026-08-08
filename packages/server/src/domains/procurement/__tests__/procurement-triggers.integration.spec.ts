import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";
import { ProcQuotationLineEntity } from "../domain/proc-quotation-line.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcSupplierInvoiceEntity } from "../domain/proc-supplier-invoice.entity";
import { ProcPaymentVoucherEntity } from "../domain/proc-payment-voucher.entity";
import { ProcVoucherAllocationEntity } from "../domain/proc-voucher-allocation.entity";
import { ProcContractEntity } from "../domain/proc-contract.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/payments/__tests__/payments-triggers.integration.spec.ts`'s
 * pattern exactly — the highest-value test in this foundation pass, since
 * the three triggers from migration `0100` can only be genuinely verified
 * against a real Postgres trigger, not a mocked repository.
 */
describe("procurement module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[procurement-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface SupplierFixture {
    supplierId: string;
  }

  async function createSupplierFixture(source: DataSource, suffix: string): Promise<SupplierFixture> {
    const supplierId = generateUuidV7();
    await source.query(
      `INSERT INTO app.proc_supplier (id, name, status) VALUES ($1, $2, 'ACTIVE')`,
      [supplierId, `PROC-SUP-${suffix}`],
    );
    return { supplierId };
  }

  async function destroySupplierFixture(source: DataSource, fixture: SupplierFixture): Promise<void> {
    await source.query(`DELETE FROM app.proc_supplier WHERE id = $1`, [fixture.supplierId]);
  }

  it.each([
    ["proc_supplier", ProcSupplierEntity],
    ["proc_requisition", ProcRequisitionEntity],
    ["proc_requisition_line", ProcRequisitionLineEntity],
    ["proc_quotation", ProcQuotationEntity],
    ["proc_quotation_line", ProcQuotationLineEntity],
    ["proc_purchase_order", ProcPurchaseOrderEntity],
    ["proc_po_line", ProcPoLineEntity],
    ["proc_grn", ProcGrnEntity],
    ["proc_grn_line", ProcGrnLineEntity],
    ["proc_supplier_invoice", ProcSupplierInvoiceEntity],
    ["proc_payment_voucher", ProcPaymentVoucherEntity],
    ["proc_voucher_allocation", ProcVoucherAllocationEntity],
    ["proc_contract", ProcContractEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[procurement-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("trg_proc_po_immutable freezes subtotal/tax_amount/total/supplier_id once status reaches ISSUED or beyond, but allows status/issued_at to keep progressing (FR-PROC-004.1)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[procurement-triggers.integration.spec] SKIPPED (no DB) — PO immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const supplier = await createSupplierFixture(source, suffix);
    const otherSupplier = await createSupplierFixture(source, `${suffix}-other`);
    const poId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.proc_purchase_order
           (id, number, supplier_id, status, order_date, payment_terms_days, subtotal, tax_amount, total)
         VALUES ($1, $2, $3, 'DRAFT', '2026-01-15', 30, 100.00, 16.00, 116.00)`,
        [poId, `PO-${suffix}`, supplier.supplierId],
      );

      // While DRAFT, financial columns are freely editable.
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET total = 200.00 WHERE id = $1`, [poId]),
      ).resolves.toBeDefined();

      // Progress the PO to ISSUED — status/issued_at remain writable throughout.
      await expect(
        source.query(
          `UPDATE app.proc_purchase_order SET status = 'PENDING_APPROVAL' WHERE id = $1`,
          [poId],
        ),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET status = 'APPROVED' WHERE id = $1`, [poId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(
          `UPDATE app.proc_purchase_order SET status = 'ISSUED', issued_at = now() WHERE id = $1`,
          [poId],
        ),
      ).resolves.toBeDefined();

      // Once ISSUED, the commercial columns are frozen.
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET total = 999.00 WHERE id = $1`, [poId]),
      ).rejects.toThrow(/FR-PROC-004\.1/);
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET subtotal = 500.00 WHERE id = $1`, [poId]),
      ).rejects.toThrow(/FR-PROC-004\.1/);
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET tax_amount = 1.00 WHERE id = $1`, [poId]),
      ).rejects.toThrow(/FR-PROC-004\.1/);
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET supplier_id = $2 WHERE id = $1`, [
          poId,
          otherSupplier.supplierId,
        ]),
      ).rejects.toThrow(/FR-PROC-004\.1/);

      // status/issued_at remain writable even after ISSUED (the revision/closure path).
      await expect(
        source.query(`UPDATE app.proc_purchase_order SET status = 'PARTIALLY_RECEIVED' WHERE id = $1`, [poId]),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.proc_purchase_order WHERE id = $1`, [poId]);
      await destroySupplierFixture(source, otherSupplier);
      await destroySupplierFixture(source, supplier);
    }
  });

  it("trg_proc_grn_qty_cap rejects cumulative received qty beyond the PO line's qty plus the 5% hard tolerance (BR-PROC-03)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[procurement-triggers.integration.spec] SKIPPED (no DB) — GRN qty cap trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const supplier = await createSupplierFixture(source, suffix);
    const poId = generateUuidV7();
    const poLineId = generateUuidV7();
    const receiverId = generateUuidV7();
    const grnId = generateUuidV7();
    const grnLineAId = generateUuidV7();
    const grnLineBId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.proc_purchase_order
           (id, number, supplier_id, status, order_date, payment_terms_days, subtotal, tax_amount, total)
         VALUES ($1, $2, $3, 'ISSUED', '2026-01-15', 30, 100.00, 0, 100.00)`,
        [poId, `PO-GRN-${suffix}`, supplier.supplierId],
      );
      await source.query(
        `INSERT INTO app.proc_po_line (id, po_id, line_no, description, qty, unit_price)
         VALUES ($1, $2, 1, 'Test line', 100.0000, 10.00)`,
        [poLineId, poId],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
         VALUES ($1, $2, 'hash', 'Test Receiver', 'ACTIVE', $3)`,
        [receiverId, `proc-receiver-${suffix}`, `+2548${suffix}`],
      );
      await source.query(
        `INSERT INTO app.proc_grn (id, number, po_id, received_by, received_at, status)
         VALUES ($1, $2, $3, $4, now(), 'DRAFT')`,
        [grnId, `GRN-${suffix}`, poId, receiverId],
      );

      // Within qty (100) + 5% tolerance (105) — first receipt of 90 commits cleanly.
      await expect(
        source.query(
          `INSERT INTO app.proc_grn_line (id, grn_id, po_line_id, received_qty, unit_cost)
           VALUES ($1, $2, $3, 90.0000, 10.00)`,
          [grnLineAId, grnId, poLineId],
        ),
      ).resolves.toBeDefined();

      // A second receipt of 10 would bring the cumulative total to 100 — still within tolerance, commits.
      await expect(
        source.query(
          `INSERT INTO app.proc_grn_line (id, grn_id, po_line_id, received_qty, unit_cost)
           VALUES ($1, $2, $3, 10.0000, 10.00)`,
          [grnLineBId, grnId, poLineId],
        ),
      ).resolves.toBeDefined();

      // A further UPDATE bumping that second line to 20 (cumulative 110) breaches the 105 hard ceiling.
      await expect(
        source.query(`UPDATE app.proc_grn_line SET received_qty = 20.0000 WHERE id = $1`, [grnLineBId]),
      ).rejects.toThrow(/BR-PROC-03/);
    } finally {
      await source.query(`DELETE FROM app.proc_grn_line WHERE grn_id = $1`, [grnId]);
      await source.query(`DELETE FROM app.proc_grn WHERE id = $1`, [grnId]);
      await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [receiverId]);
      await source.query(`DELETE FROM app.proc_po_line WHERE id = $1`, [poLineId]);
      await source.query(`DELETE FROM app.proc_purchase_order WHERE id = $1`, [poId]);
      await destroySupplierFixture(source, supplier);
    }
  });

  it("trg_proc_voucher_allocation_sum rejects allocations that do not sum to the voucher total at COMMIT (BR-PROC-04, sum half)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[procurement-triggers.integration.spec] SKIPPED (no DB) — voucher allocation sum trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const supplier = await createSupplierFixture(source, suffix);
    const voucherId = generateUuidV7();
    const invoiceAId = generateUuidV7();
    const invoiceBId = generateUuidV7();
    const allocAId = generateUuidV7();
    const allocBId = generateUuidV7();
    const allocCId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.proc_payment_voucher (id, number, supplier_id, method, total, status)
         VALUES ($1, $2, $3, 'BANK', 100.00, 'DRAFT')`,
        [voucherId, `PV-${suffix}`, supplier.supplierId],
      );
      await source.query(
        `INSERT INTO app.proc_supplier_invoice
           (id, number, supplier_ref, supplier_id, invoice_date, due_date, total, status)
         VALUES ($1, $2, $3, $4, '2026-01-01', '2026-02-01', 60.00, 'POSTED')`,
        [invoiceAId, `INV-A-${suffix}`, `SUP-REF-A-${suffix}`, supplier.supplierId],
      );
      await source.query(
        `INSERT INTO app.proc_supplier_invoice
           (id, number, supplier_ref, supplier_id, invoice_date, due_date, total, status)
         VALUES ($1, $2, $3, $4, '2026-01-01', '2026-02-01', 40.00, 'POSTED')`,
        [invoiceBId, `INV-B-${suffix}`, `SUP-REF-B-${suffix}`, supplier.supplierId],
      );

      // Allocations sum exactly to the voucher's total (100.00) — commits cleanly.
      const okQr = source.createQueryRunner();
      await okQr.connect();
      try {
        await okQr.startTransaction();
        await okQr.query(
          `INSERT INTO app.proc_voucher_allocation (id, voucher_id, supplier_invoice_id, amount)
           VALUES ($1, $2, $3, 60.00)`,
          [allocAId, voucherId, invoiceAId],
        );
        await okQr.query(
          `INSERT INTO app.proc_voucher_allocation (id, voucher_id, supplier_invoice_id, amount)
           VALUES ($1, $2, $3, 40.00)`,
          [allocBId, voucherId, invoiceBId],
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
          `INSERT INTO app.proc_voucher_allocation (id, voucher_id, supplier_invoice_id, amount)
           VALUES ($1, $2, $3, 10.00)`,
          [allocCId, voucherId, invoiceAId],
        );
        await expect(badQr.commitTransaction()).rejects.toThrow(/BR-PROC-04/);
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
      // Deleting proc_voucher_allocation BEFORE its parent proc_payment_voucher trips
      // trg_proc_voucher_allocation_sum (migration 0100, deferred to COMMIT): with the
      // allocations gone but the voucher row still present, the recomputed allocation-sum (0)
      // no longer matches voucher.total, so the trigger rejects the delete. Same class of bug
      // (and same fix) as reporting-foundation.integration.spec.ts's pay_receipt_split cleanup —
      // fk_proc_voucher_allocation_voucher_id is ON DELETE CASCADE, so deleting the voucher alone
      // removes its allocations in the same transaction, and by the time the deferred trigger
      // checks, the voucher row is gone too and the check short-circuits cleanly.
      await source.query(`DELETE FROM app.proc_payment_voucher WHERE id = $1`, [voucherId]);
      await source.query(`DELETE FROM app.proc_supplier_invoice WHERE id IN ($1, $2)`, [invoiceAId, invoiceBId]);
      await destroySupplierFixture(source, supplier);
    }
  });
});
