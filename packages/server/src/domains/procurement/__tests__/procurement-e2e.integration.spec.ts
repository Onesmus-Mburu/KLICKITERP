import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";

import { SettingsService } from "../../../platform/settings";
import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

import {
  ApprovalEngineService,
  ApprWorkflowDefEntity,
  ApprWorkflowVersionEntity,
  ApprLevelEntity,
  ApprRoutingRuleEntity,
  ApprInstanceEntity,
  ApprActionEntity,
  DelegationsService,
} from "../../../platform/approvals";
import { ApprWorkflowDefRepository } from "../../../platform/approvals/infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../../../platform/approvals/infrastructure/appr-workflow-version.repository";
import { ApprLevelRepository } from "../../../platform/approvals/infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../../../platform/approvals/infrastructure/appr-routing-rule.repository";
import { ApprInstanceRepository } from "../../../platform/approvals/infrastructure/appr-instance.repository";
import { ApprActionRepository } from "../../../platform/approvals/infrastructure/appr-action.repository";
import { UsersService, DepartmentsService } from "../../../platform/users";

import { GlAccountRepository, PostingService } from "../../../accounting";
import { GlAccountEntity } from "../../../accounting/domain/gl-account.entity";
import { GlJournalEntity } from "../../../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../../../accounting/domain/gl-journal-line.entity";
import { GlJournalLineRepository } from "../../../accounting/infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../../../accounting/infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalEntity } from "../../../accounting/domain/gl-period-account-total.entity";
import { GlPeriodAccountTotalRepository } from "../../../accounting/infrastructure/gl-period-account-total.repository";
import { GlPeriodEntity } from "../../../accounting/domain/gl-period.entity";
import { GlPeriodRepository } from "../../../accounting/infrastructure/gl-period.repository";
import { GlBudgetLineRepository } from "../../../accounting/infrastructure/gl-budget-line.repository";
import { GlBudgetRepository } from "../../../accounting/infrastructure/gl-budget.repository";

import { NotificationsService } from "../../../platform/comms";

import { ProcSupplierEntity } from "../domain/proc-supplier.entity";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcSupplierInvoiceEntity } from "../domain/proc-supplier-invoice.entity";
import { ProcPaymentVoucherEntity } from "../domain/proc-payment-voucher.entity";
import { ProcVoucherAllocationEntity } from "../domain/proc-voucher-allocation.entity";

import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";
import { ProcRequisitionRepository } from "../infrastructure/proc-requisition.repository";
import { ProcRequisitionLineRepository } from "../infrastructure/proc-requisition-line.repository";
import { ProcQuotationRepository } from "../infrastructure/proc-quotation.repository";
import { ProcPurchaseOrderRepository } from "../infrastructure/proc-purchase-order.repository";
import { ProcPoLineRepository } from "../infrastructure/proc-po-line.repository";
import { ProcGrnRepository } from "../infrastructure/proc-grn.repository";
import { ProcGrnLineRepository } from "../infrastructure/proc-grn-line.repository";
import { ProcSupplierInvoiceRepository } from "../infrastructure/proc-supplier-invoice.repository";
import { ProcPaymentVoucherRepository } from "../infrastructure/proc-payment-voucher.repository";
import { ProcVoucherAllocationRepository } from "../infrastructure/proc-voucher-allocation.repository";

import { RequisitionsService } from "../application/requisitions.service";
import { PurchaseOrdersService } from "../application/purchase-orders.service";
import { GrnService } from "../application/grn.service";
import { SupplierInvoicesService } from "../application/supplier-invoices.service";
import { PaymentVouchersService } from "../application/payment-vouchers.service";

/**
 * The capstone integration test for Module 12 (Procurement) PASS B — walks
 * the full procure-to-pay cycle against real service instances and a real
 * Postgres instance: create supplier -> requisition -> approve -> PO ->
 * issue -> GRN receive+post (P-19) -> supplier invoice capture+match+post
 * (P-20) -> payment voucher create+approve+execute (P-21), asserting
 * balanced GL at each posting step and the supplier invoice's
 * `paid_amount`/`status` end state. Mirrors `payments-e2e.integration.spec.ts`'s
 * pattern (real repository/service instances, no Nest DI) and
 * `procurement-triggers.integration.spec.ts`'s connectivity-probe self-skip.
 *
 * **This test's assumption**: migrations UP TO AND INCLUDING `0900` have
 * already run — `PROCUREMENT_REQUISITION`/`PROCUREMENT_PO`/`SUPPLIER_PAYMENTS`
 * `appr_workflow_def` rows must exist for `submit()`/`submitForApproval()` to
 * succeed, and it looks up the seeded `2015`/`5050`/`5060`/`1020` `gl_account`
 * rows by `code` (creating throwaway ones as a fresh-DB fallback if missing,
 * same pattern `payments-e2e.integration.spec.ts` uses for `1010`).
 *
 * **Approval decisions use each service's `onApprovalDecided()` manual-
 * trigger** (not `ApprovalEngineService.decide()`) — the same interim
 * pattern every domain module's own controller uses today (no event
 * dispatcher exists yet off a real decision). `submit()`/`submitForApproval()`
 * themselves DO run for real against the real `appr_workflow_def`/
 * `_version`/`_level` rows seeded by `0900` — genuine coverage that the seed
 * bootstrapping actually works — while `UsersService`/`DepartmentsService`/
 * `DelegationsService` are stubbed (never touched, since `0900` seeds ZERO
 * `appr_routing_rule` rows for any of these three domain codes, so
 * `ApprovalEngineService.submit()`'s `resolveApplicableLevels()` short-
 * circuits to "no routing rule matched" without ever calling them).
 */
describe("procurement module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[procurement-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
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
    "supplier -> requisition -> approve -> PO -> issue -> GRN receive+post (P-19) -> supplier invoice capture+match+post (P-20) -> payment voucher create+approve+execute (P-21)",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[procurement-e2e.integration.spec] SKIPPED (no DB) — end-to-end procurement capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- Wide-enough gl_period.
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `PROC-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      // ---- GL accounts: reuse the 0900-seeded rows if present, else create throwaway fallbacks.
      async function reuseOrCreateByCode(code: string, name: string, klass: string, controlDomain: string | null): Promise<{ id: string; created: boolean }> {
        const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [code]);
        if (existing.length > 0) return { id: existing[0].id, created: false };
        const id = generateUuidV7();
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, control_domain, is_active)
           VALUES ($1, $2, $3, $4, true, $5, $6, true)`,
          [id, code, name, klass, controlDomain !== null, controlDomain],
        );
        return { id, created: true };
      }
      const apAccount = await reuseOrCreateByCode("2010", "Accounts Payable - Suppliers", "LIABILITY", "AP_SUPPLIER");
      const grnAccrualAccount = await reuseOrCreateByCode("2015", "GRN Accrual", "LIABILITY", null);
      const expenseWipAccount = await reuseOrCreateByCode("5050", "Procurement Expense / Asset WIP", "EXPENSE", null);
      const varianceAccount = await reuseOrCreateByCode("5060", "Purchase Price Variance", "EXPENSE", null);
      const bankAccount = await reuseOrCreateByCode("1020", "Bank - Operating Account", "ASSET", null);
      const createdAccountIds = [apAccount, grnAccrualAccount, expenseWipAccount, varianceAccount, bankAccount]
        .filter((a) => a.created)
        .map((a) => a.id);

      // ---- Department + requester.
      const departmentId = generateUuidV7();
      const requesterId = generateUuidV7();
      await source.query(`INSERT INTO app.usr_department (id, name) VALUES ($1, $2)`, [departmentId, `PROC-E2E-DEPT-${suffix}`]);
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
         VALUES ($1, $2, 'hash', 'E2E Requester', 'ACTIVE', $3)`,
        [requesterId, `proc-e2e-requester-${suffix}`, `+2549${suffix}`.slice(0, 13)],
      );

      // ---- Supplier.
      const supplierId = generateUuidV7();
      await source.query(`INSERT INTO app.proc_supplier (id, name, status) VALUES ($1, $2, 'ACTIVE')`, [
        supplierId,
        `PROC-E2E-SUP-${suffix}`,
      ]);

      // ---- Service instantiation (real repositories, no Nest DI — see class doc comment).
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(
        numberingSeriesRepository,
        {} as unknown as AcademicCalendarService, // NEVER reset_policy for every PROC_* series here never touches this collaborator.
      );
      const glPeriodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const glPeriodAccountTotalRepository = new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity));
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        glPeriodAccountTotalRepository,
        glAccountRepository,
        glPeriodRepository,
        numberingService,
      );

      const settingsServiceStub = {
        getTyped: async <T>(_key: string, defaultValue: T): Promise<T> => defaultValue,
      } as unknown as SettingsService;

      const approvalEngine = new ApprovalEngineService(
        source,
        new ApprWorkflowDefRepository(source.getRepository(ApprWorkflowDefEntity)),
        new ApprWorkflowVersionRepository(source.getRepository(ApprWorkflowVersionEntity)),
        new ApprLevelRepository(source.getRepository(ApprLevelEntity)),
        new ApprRoutingRuleRepository(source.getRepository(ApprRoutingRuleEntity)),
        new ApprInstanceRepository(source.getRepository(ApprInstanceEntity)),
        new ApprActionRepository(source.getRepository(ApprActionEntity)),
        {} as unknown as UsersService, // never touched — 0900 seeds zero appr_routing_rule rows for these domain codes, see class doc comment.
        {} as unknown as DepartmentsService,
        {} as unknown as DelegationsService,
        new OutboxWriterService(),
      );

      const supplierRepository = new ProcSupplierRepository(source.getRepository(ProcSupplierEntity));
      const requisitionRepository = new ProcRequisitionRepository(source.getRepository(ProcRequisitionEntity));
      const requisitionLineRepository = new ProcRequisitionLineRepository(source.getRepository(ProcRequisitionLineEntity));
      const quotationRepository = new ProcQuotationRepository(source.getRepository(ProcQuotationEntity));
      const poRepository = new ProcPurchaseOrderRepository(source.getRepository(ProcPurchaseOrderEntity));
      const poLineRepository = new ProcPoLineRepository(source.getRepository(ProcPoLineEntity));
      const grnRepository = new ProcGrnRepository(source.getRepository(ProcGrnEntity));
      const grnLineRepository = new ProcGrnLineRepository(source.getRepository(ProcGrnLineEntity));
      const supplierInvoiceRepository = new ProcSupplierInvoiceRepository(source.getRepository(ProcSupplierInvoiceEntity));
      const paymentVoucherRepository = new ProcPaymentVoucherRepository(source.getRepository(ProcPaymentVoucherEntity));
      const voucherAllocationRepository = new ProcVoucherAllocationRepository(source.getRepository(ProcVoucherAllocationEntity));

      const requisitionsService = new RequisitionsService(
        requisitionRepository,
        requisitionLineRepository,
        {} as unknown as GlBudgetLineRepository, // unused — this test's requisition line has no budget_line_id.
        {} as unknown as GlBudgetRepository,
        glPeriodRepository,
        glPeriodAccountTotalRepository,
        approvalEngine,
        numberingService,
        source,
      );
      const purchaseOrdersService = new PurchaseOrdersService(
        poRepository,
        poLineRepository,
        supplierRepository,
        requisitionRepository,
        quotationRepository,
        requisitionsService,
        approvalEngine,
        numberingService,
      );
      const grnService = new GrnService(
        grnRepository,
        grnLineRepository,
        poLineRepository,
        poRepository,
        purchaseOrdersService,
        glAccountRepository,
        postingService,
        numberingService,
        settingsServiceStub,
      );
      const supplierInvoicesService = new SupplierInvoicesService(
        supplierInvoiceRepository,
        supplierRepository,
        poRepository,
        poLineRepository,
        grnRepository,
        grnLineRepository,
        glAccountRepository,
        postingService,
        numberingService,
        settingsServiceStub,
      );
      const notificationsServiceStub = {} as unknown as NotificationsService; // never touched — this test's supplier has no contacts.email.
      const paymentVouchersService = new PaymentVouchersService(
        paymentVoucherRepository,
        voucherAllocationRepository,
        supplierInvoiceRepository,
        supplierRepository,
        glAccountRepository,
        postingService,
        numberingService,
        approvalEngine,
        notificationsServiceStub,
      );

      let requisitionId: string | null = null;
      let requisitionApprovalRef: string | null = null;
      let poId: string | null = null;
      let poApprovalRef: string | null = null;
      let poLineId: string | null = null;
      let grnId: string | null = null;
      let grnJournalId: string | null = null;
      let invoiceId: string | null = null;
      let invoiceJournalId: string | null = null;
      let voucherId: string | null = null;
      let voucherApprovalRef: string | null = null;
      let voucherJournalId: string | null = null;

      try {
        // ---- 1. Requisition: create -> add line -> submit -> approve.
        const requisition = await requisitionsService.create(
          { requestedBy: requesterId, departmentId, justification: "E2E capstone requisition" },
          requesterId,
        );
        requisitionId = requisition.id;
        await requisitionsService.addLine(
          requisitionId,
          { freeText: "Widgets", qty: "10", estPrice: Money.fromInt(100) },
          requesterId,
        );
        const submittedRequisition = await runInTransaction(source, (manager) =>
          requisitionsService.submit(manager, requisitionId!, requesterId),
        );
        expect(submittedRequisition.status).toBe("PENDING_APPROVAL");
        requisitionApprovalRef = submittedRequisition.approvalRef;

        const approvedRequisition = await requisitionsService.onApprovalDecided(requisitionId, true, requesterId);
        expect(approvedRequisition.status).toBe("APPROVED");

        // ---- 2. PO: create from the approved requisition -> submit -> approve -> issue.
        const po = await runInTransaction(source, (manager) =>
          purchaseOrdersService.createFromRequisition(
            manager,
            {
              requisitionId,
              supplierId,
              lines: [{ description: "Widgets", qty: "10", unitPrice: Money.fromInt(100) }],
              bypassRequisition: false,
            },
            requesterId,
          ),
        );
        poId = po.id;
        expect(po.status).toBe("DRAFT");
        expect(po.total.equals(Money.fromInt(1000))).toBe(true);

        const submittedPo = await runInTransaction(source, (manager) => purchaseOrdersService.submitForApproval(manager, poId!, requesterId));
        poApprovalRef = submittedPo.approvalRef;
        const approvedPo = await purchaseOrdersService.onApprovalDecided(poId, true, requesterId);
        expect(approvedPo.status).toBe("APPROVED");
        const issuedPo = await runInTransaction(source, (manager) => purchaseOrdersService.issue(manager, poId!, requesterId));
        expect(issuedPo.status).toBe("ISSUED");
        expect(issuedPo.number.startsWith("DRAFT-")).toBe(false);

        const poLines = await purchaseOrdersService.listLines(poId);
        expect(poLines).toHaveLength(1);
        poLineId = poLines[0].id;

        // ---- 3. GRN: receive -> post (P-19 — item_id null, debits 5050, credits 2015).
        const grn = await runInTransaction(source, (manager) =>
          grnService.receive(manager, {
            poId: poId!,
            receivedBy: requesterId,
            lines: [{ poLineId: poLineId!, receivedQty: "10", unitCost: Money.fromInt(100) }],
          }),
        );
        grnId = grn.id;
        expect(grn.status).toBe("DRAFT");

        const postedGrn = await runInTransaction(source, (manager) => grnService.post(manager, grnId!, requesterId));
        expect(postedGrn.status).toBe("POSTED");
        grnJournalId = postedGrn.journalId;

        const grnLines = await source.getRepository(GlJournalLineEntity).find({ where: { journalId: grnJournalId! } });
        const grnDebitTotal = grnLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
        const grnCreditTotal = grnLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
        expect(grnDebitTotal.equals(grnCreditTotal)).toBe(true);
        expect(grnDebitTotal.equals(Money.fromInt(1000))).toBe(true);
        expect(grnLines.find((l) => l.accountId === expenseWipAccount.id)?.debit.equals(Money.fromInt(1000))).toBe(true);
        expect(grnLines.find((l) => l.accountId === grnAccrualAccount.id)?.credit.equals(Money.fromInt(1000))).toBe(true);

        // ---- 4. Supplier invoice: capture -> match (exact match, 0% variance) -> post (P-20, no variance line).
        const invoice = await runInTransaction(source, (manager) =>
          supplierInvoicesService.capture(
            manager,
            {
              supplierId,
              poId: poId!,
              supplierRef: `E2E-SUP-REF-${suffix}`,
              invoiceDate: "2026-07-01",
              dueDate: "2026-07-31",
              total: Money.fromInt(1000),
            },
            requesterId,
          ),
        );
        invoiceId = invoice.id;
        expect(invoice.status).toBe("UNMATCHED");

        const matchedInvoice = await runInTransaction(source, (manager) => supplierInvoicesService.matchAgainstPo(manager, invoiceId!, requesterId));
        expect(matchedInvoice.status).toBe("MATCHED");

        const postedInvoice = await runInTransaction(source, (manager) => supplierInvoicesService.post(manager, invoiceId!, requesterId));
        expect(postedInvoice.status).toBe("POSTED");
        invoiceJournalId = postedInvoice.journalId;

        const invoiceLines = await source.getRepository(GlJournalLineEntity).find({ where: { journalId: invoiceJournalId! } });
        const invoiceDebitTotal = invoiceLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
        const invoiceCreditTotal = invoiceLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
        expect(invoiceDebitTotal.equals(invoiceCreditTotal)).toBe(true);
        expect(invoiceDebitTotal.equals(Money.fromInt(1000))).toBe(true);
        expect(invoiceLines.find((l) => l.accountId === grnAccrualAccount.id)?.debit.equals(Money.fromInt(1000))).toBe(true);
        expect(invoiceLines.find((l) => l.accountId === apAccount.id)?.credit.equals(Money.fromInt(1000))).toBe(true);
        expect(invoiceLines.some((l) => l.accountId === varianceAccount.id)).toBe(false); // no variance — exact match

        // ---- 5. Payment voucher: create -> submit -> approve -> execute (P-21, BANK).
        const voucher = await runInTransaction(source, (manager) =>
          paymentVouchersService.create(
            manager,
            { supplierId, method: "BANK", allocations: [{ supplierInvoiceId: invoiceId!, amount: Money.fromInt(1000) }] },
            requesterId,
          ),
        );
        voucherId = voucher.id;
        expect(voucher.status).toBe("DRAFT");

        const submittedVoucher = await runInTransaction(source, (manager) => paymentVouchersService.submitForApproval(manager, voucherId!, requesterId));
        voucherApprovalRef = submittedVoucher.approvalRef;
        const approvedVoucher = await paymentVouchersService.onApprovalDecided(voucherId, true, requesterId);
        expect(approvedVoucher.status).toBe("APPROVED");

        const executedVoucher = await runInTransaction(source, (manager) => paymentVouchersService.execute(manager, voucherId!, requesterId));
        expect(executedVoucher.status).toBe("PAID");
        voucherJournalId = executedVoucher.journalId;

        const voucherLines = await source.getRepository(GlJournalLineEntity).find({ where: { journalId: voucherJournalId! } });
        const voucherDebitTotal = voucherLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
        const voucherCreditTotal = voucherLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
        expect(voucherDebitTotal.equals(voucherCreditTotal)).toBe(true);
        expect(voucherDebitTotal.equals(Money.fromInt(1000))).toBe(true);
        expect(voucherLines.find((l) => l.accountId === apAccount.id)?.debit.equals(Money.fromInt(1000))).toBe(true);
        expect(voucherLines.find((l) => l.accountId === bankAccount.id)?.credit.equals(Money.fromInt(1000))).toBe(true);

        // ---- 6. Final supplier-invoice end state: fully PAID.
        const finalInvoice = await supplierInvoiceRepository.findByIdOrFail(invoiceId);
        expect(finalInvoice.paidAmount.equals(Money.fromInt(1000))).toBe(true);
        expect(finalInvoice.status).toBe("PAID");
      } finally {
        // gl_journal_line/gl_journal are permanently immutable once posted
        // (trg_gl_journal_immutable, BR-GEN-03 — DELETE is unconditionally rejected, confirmed by
        // direct testing) — this test posts real journals via GrnService/SupplierInvoicesService/
        // PaymentVouchersService, so these rows are never reclaimable. Leaving them as inert,
        // uniquely-suffixed residue doesn't break re-runnability — same precedent as
        // inventory-e2e.integration.spec.ts's inv_movement fix / reporting-foundation's GL cleanup.
        const journalIds = [grnJournalId, invoiceJournalId, voucherJournalId].filter((x): x is string => Boolean(x));
        void journalIds;

        if (voucherId) {
          // Deleting proc_voucher_allocation BEFORE its parent proc_payment_voucher trips
          // trg_proc_voucher_allocation_sum (deferred to COMMIT) — same class of bug as
          // procurement-triggers.integration.spec.ts's own cleanup fix. Deleting the voucher alone
          // cascades (fk_proc_voucher_allocation_voucher_id ON DELETE CASCADE) to remove its
          // allocations in the same transaction, so the deferred check short-circuits cleanly.
          await source.query(`DELETE FROM app.proc_payment_voucher WHERE id = $1`, [voucherId]);
        }
        if (invoiceId) {
          await source.query(`DELETE FROM app.proc_supplier_invoice WHERE id = $1`, [invoiceId]);
        }
        if (grnId) {
          await source.query(`DELETE FROM app.proc_grn_line WHERE grn_id = $1`, [grnId]);
          await source.query(`DELETE FROM app.proc_grn WHERE id = $1`, [grnId]);
        }
        if (poLineId) {
          await source.query(`DELETE FROM app.proc_po_line WHERE id = $1`, [poLineId]);
        }
        if (poId) {
          await source.query(`DELETE FROM app.proc_purchase_order WHERE id = $1`, [poId]);
        }
        if (requisitionId) {
          await source.query(`DELETE FROM app.proc_requisition_line WHERE requisition_id = $1`, [requisitionId]);
          await source.query(`DELETE FROM app.proc_requisition WHERE id = $1`, [requisitionId]);
        }

        const approvalRefs = [requisitionApprovalRef, poApprovalRef, voucherApprovalRef].filter((x): x is string => Boolean(x));
        if (approvalRefs.length > 0) {
          await source.query(`DELETE FROM app.appr_instance WHERE id = ANY($1::uuid[])`, [approvalRefs]);
        }

        await source.query(`DELETE FROM app.proc_supplier WHERE id = $1`, [supplierId]);
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [requesterId]);
        await source.query(`DELETE FROM app.usr_department WHERE id = $1`, [departmentId]);

        // gl_period_account_total is writer-guarded (trg_gl_writer_guard) and, once this test's
        // real GRN/invoice/voucher postings exist, RESTRICT-referenced alongside gl_account/
        // gl_period/gl_fiscal_year by the now-permanent gl_journal_line rows (also removed from
        // this cleanup above) — none of this chain can succeed. Left as inert, uniquely-suffixed
        // residue — same precedent as reporting-foundation.integration.spec.ts's GL cleanup fix.
      }
    },
    60_000,
  );
});
