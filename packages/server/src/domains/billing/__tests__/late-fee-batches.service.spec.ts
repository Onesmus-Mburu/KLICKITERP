import { DataSource, EntityManager } from "typeorm";
import {
  BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE,
  LATE_FEE_INCOME_CATEGORY_NAME,
  LateFeeBatchesService,
  LateFeeBatchSummary,
} from "../application/late-fee-batches.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";

const EM = {} as EntityManager;

function makePolicy(overrides: Partial<BillLateFeePolicyEntity>): BillLateFeePolicyEntity {
  return {
    id: "policy-1",
    name: "Standard late fee",
    mode: "FLAT",
    params: { amount: "100" },
    graceDays: 5,
    requiresApproval: false,
    isActive: true,
    ...overrides,
  } as BillLateFeePolicyEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    studentId: "student-1",
    termId: "term-1",
    status: "POSTED",
    dueDate: "2026-07-01",
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

function makeBatch(overrides: Partial<BillLateFeeBatchEntity>): BillLateFeeBatchEntity {
  return {
    id: "batch-1",
    policyId: "policy-1",
    runDate: "2026-07-15",
    status: "DRAFT",
    approvalRef: null,
    summary: { totalAssessed: "0.0000", studentCount: 0, entries: [] },
    ...overrides,
  } as BillLateFeeBatchEntity;
}

describe("LateFeeBatchesService", () => {
  let batchRepository: { findByIdOrFail: jest.Mock; listByPolicy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let policyRepository: { findByIdOrFail: jest.Mock };
  let invoiceRepository: { findOverdueOpen: jest.Mock };
  let feeCategoryRepository: { findByName: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let dataSource: DataSource;
  let service: LateFeeBatchesService;

  beforeEach(() => {
    batchRepository = {
      findByIdOrFail: jest.fn(async () => makeBatch({})),
      listByPolicy: jest.fn(async () => []),
      create: jest.fn(async (data) => makeBatch(data)),
      save: jest.fn(async (e) => e),
    };
    policyRepository = { findByIdOrFail: jest.fn(async () => makePolicy({})) };
    invoiceRepository = { findOverdueOpen: jest.fn(async () => []) };
    feeCategoryRepository = { findByName: jest.fn(async () => ({ id: "cat-late-fee", name: LATE_FEE_INCOME_CATEGORY_NAME })) };
    invoicingService = {
      generateInvoice: jest.fn(async () => ({ id: "invoice-lf-1" })),
      postInvoice: jest.fn(async () => ({ id: "invoice-lf-1", journalId: "journal-lf-1" })),
    };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new LateFeeBatchesService(
      batchRepository as never,
      policyRepository as never,
      invoiceRepository as never,
      feeCategoryRepository as never,
      invoicingService as never,
      approvalEngine as never,
      dataSource,
    );
  });

  describe("runBatch — overdue-invoice selection", () => {
    it("rejects an inactive policy", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ isActive: false }));
      await expect(service.runBatch("policy-1", "2026-07-15", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("resolves the overdue population via cutoffDate = runDate - grace_days", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ graceDays: 5 }));
      await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      expect(invoiceRepository.findOverdueOpen).toHaveBeenCalledWith("2026-07-10", {});
    });

    it("findOverdueOpen already excludes VOID/zero-balance invoices — the batch just consumes its result set as-is", async () => {
      invoiceRepository.findOverdueOpen.mockResolvedValue([
        makeInvoice({ id: "invoice-1", balance: Money.fromInt(500) }),
      ]);
      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.entries).toHaveLength(1);
    });
  });

  describe("runBatch — computeCharge per mode", () => {
    it("FLAT: charges the fixed params.amount per overdue invoice", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ mode: "FLAT", params: { amount: "100" } }));
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ balance: Money.fromInt(1000) })]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.totalAssessed).toBe("100.0000");
      expect(summary.entries[0].amount).toBe("100.0000");
    });

    it("PERCENT: charges params.rate applied to the invoice's own balance", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ mode: "PERCENT", params: { rate: "0.05" } }));
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ balance: Money.fromInt(1000) })]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.totalAssessed).toBe("50.0000");
    });

    it("TIERED: the first tier whose [min,max] contains daysOverdue wins, amount takes precedence over rate", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(
        makePolicy({
          mode: "TIERED",
          graceDays: 0,
          params: {
            tiers: [
              { minDaysOverdue: 0, maxDaysOverdue: 9, amount: "50" },
              { minDaysOverdue: 10, maxDaysOverdue: 29, rate: "0.10" },
              { minDaysOverdue: 30, amount: "500", rate: "0.99" },
            ],
          },
        }),
      );
      // runDate 2026-07-15, dueDate 2026-07-01 -> 14 days overdue -> tier 2 (rate 0.10) on balance 1000 -> 100
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ dueDate: "2026-07-01", balance: Money.fromInt(1000) })]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.totalAssessed).toBe("100.0000");
    });

    it("TIERED: an open-ended top tier (no maxDaysOverdue) prefers amount over rate when both are set", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(
        makePolicy({
          mode: "TIERED",
          graceDays: 0,
          params: { tiers: [{ minDaysOverdue: 30, amount: "500", rate: "0.99" }] },
        }),
      );
      // 2026-07-15 - 2026-05-01 = 75 days overdue -> matches the open-ended tier -> flat 500, not 990
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ dueDate: "2026-05-01", balance: Money.fromInt(1000) })]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.totalAssessed).toBe("500.0000");
    });

    it("TIERED: no matching tier means no charge for that invoice", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(
        makePolicy({ mode: "TIERED", graceDays: 0, params: { tiers: [{ minDaysOverdue: 30, amount: "500" }] } }),
      );
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ dueDate: "2026-07-10", balance: Money.fromInt(1000) })]); // 5 days overdue, no tier matches

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.entries).toHaveLength(0);
      expect(summary.totalAssessed).toBe("0.0000");
    });
  });

  describe("runBatch — grouping and empty-total short-circuit", () => {
    it("groups entries by (studentId, termId), not studentId alone", async () => {
      invoiceRepository.findOverdueOpen.mockResolvedValue([
        makeInvoice({ id: "invoice-1", studentId: "student-1", termId: "term-1", balance: Money.fromInt(1000) }),
        makeInvoice({ id: "invoice-2", studentId: "student-1", termId: "term-2", balance: Money.fromInt(1000) }),
        makeInvoice({ id: "invoice-3", studentId: "student-2", termId: "term-1", balance: Money.fromInt(1000) }),
      ]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");
      const summary = batch.summary as unknown as LateFeeBatchSummary;
      expect(summary.entries).toHaveLength(3);
      expect(summary.studentCount).toBe(2);
    });

    it("zero total (nothing overdue): stays DRAFT with empty summary, no approval submission, no posting", async () => {
      invoiceRepository.findOverdueOpen.mockResolvedValue([]);

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");

      expect(batch.status).toBe("DRAFT");
      expect(approvalEngine.submit).not.toHaveBeenCalled();
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    });
  });

  describe("runBatch — requires_approval branching", () => {
    beforeEach(() => {
      invoiceRepository.findOverdueOpen.mockResolvedValue([makeInvoice({ balance: Money.fromInt(1000) })]);
    });

    it("requires_approval=true: stages PENDING_APPROVAL and calls ApprovalEngineService.submit(domainCode:'BILLING_LATE_FEE')", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ requiresApproval: true }));

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          domainCode: BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE,
          entityType: "bill_late_fee_batch",
          initiatorId: "initiator-1",
        }),
      );
      expect(batch.status).toBe("PENDING_APPROVAL");
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    });

    it("requires_approval=false: proceeds straight to posting", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ requiresApproval: false }));

      const batch = await service.runBatch("policy-1", "2026-07-15", "initiator-1");

      expect(approvalEngine.submit).not.toHaveBeenCalled();
      expect(invoicingService.generateInvoice).toHaveBeenCalled();
      expect(invoicingService.postInvoice).toHaveBeenCalled();
      expect(batch.status).toBe("POSTED");
    });
  });

  describe("post()", () => {
    it("rejects an already-POSTED batch", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(makeBatch({ status: "POSTED" }));
      await expect(service.post(EM, "batch-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts a DRAFT batch and posts", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(
        makeBatch({
          status: "DRAFT",
          summary: {
            totalAssessed: "100.0000",
            studentCount: 1,
            entries: [{ studentId: "student-1", termId: "term-1", amount: "100.0000", invoices: [] }],
          },
        }),
      );
      const result = await service.post(EM, "batch-1", "actor-1");
      expect(result.status).toBe("POSTED");
    });

    it("accepts a PENDING_APPROVAL batch and posts", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(
        makeBatch({
          status: "PENDING_APPROVAL",
          summary: {
            totalAssessed: "100.0000",
            studentCount: 1,
            entries: [{ studentId: "student-1", termId: "term-1", amount: "100.0000", invoices: [] }],
          },
        }),
      );
      const result = await service.post(EM, "batch-1", "actor-1");
      expect(result.status).toBe("POSTED");
    });

    it("delegates to InvoicingService per affected (student, term) entry with the late-fee-income category", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(
        makeBatch({
          status: "DRAFT",
          summary: {
            totalAssessed: "150.0000",
            studentCount: 2,
            entries: [
              { studentId: "student-1", termId: "term-1", amount: "100.0000", invoices: [] },
              { studentId: "student-2", termId: "term-1", amount: "50.0000", invoices: [] },
            ],
          },
        }),
      );

      await service.post(EM, "batch-1", "actor-1");

      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
      expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
      const firstCallArgs = invoicingService.generateInvoice.mock.calls[0][1];
      expect(firstCallArgs).toEqual(
        expect.objectContaining({
          studentId: "student-1",
          termId: "term-1",
          source: "ADHOC",
          adhocLines: [expect.objectContaining({ feeCategoryId: "cat-late-fee", amount: expect.objectContaining({}) })],
        }),
      );
      expect(feeCategoryRepository.findByName).toHaveBeenCalledWith(LATE_FEE_INCOME_CATEGORY_NAME, EM);
    });

    it("throws NotFoundException when the designated late-fee-income category has not been seeded", async () => {
      feeCategoryRepository.findByName.mockResolvedValue(null);
      batchRepository.findByIdOrFail.mockResolvedValue(
        makeBatch({
          status: "DRAFT",
          summary: { totalAssessed: "100.0000", studentCount: 1, entries: [{ studentId: "student-1", termId: "term-1", amount: "100.0000", invoices: [] }] },
        }),
      );
      await expect(service.post(EM, "batch-1", "actor-1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a batch that is not PENDING_APPROVAL", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(makeBatch({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("batch-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved=true posts directly (no distinct APPROVED state)", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(
        makeBatch({
          status: "PENDING_APPROVAL",
          summary: { totalAssessed: "100.0000", studentCount: 1, entries: [{ studentId: "student-1", termId: "term-1", amount: "100.0000", invoices: [] }] },
        }),
      );
      const result = await service.onApprovalDecided("batch-1", true, "actor-1");
      expect(result.status).toBe("POSTED");
      expect(invoicingService.postInvoice).toHaveBeenCalled();
    });

    it("approved=false reverts to DRAFT", async () => {
      batchRepository.findByIdOrFail.mockResolvedValue(makeBatch({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("batch-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    });
  });
});
