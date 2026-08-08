import { DataSource, EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import {
  PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE,
  RequisitionsService,
} from "../application/requisitions.service";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";

function makeRequisition(overrides: Partial<ProcRequisitionEntity>): ProcRequisitionEntity {
  return {
    id: "req-1",
    number: "PRO-000001",
    requestedBy: "user-1",
    departmentId: "dept-1",
    justification: "Need supplies",
    status: "DRAFT",
    approvalRef: null,
    budgetSnapshot: null,
    totalEstimate: Money.ZERO,
    ...overrides,
  } as ProcRequisitionEntity;
}

function makeLine(overrides: Partial<ProcRequisitionLineEntity>): ProcRequisitionLineEntity {
  return {
    id: "line-1",
    requisitionId: "req-1",
    itemId: null,
    freeText: "Stationery",
    qty: "2.0000",
    estPrice: Money.fromInt(100),
    budgetLineId: null,
    ...overrides,
  } as ProcRequisitionLineEntity;
}

describe("RequisitionsService", () => {
  let requisitionRepository: {
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let requisitionLineRepository: {
    findByRequisitionId: jest.Mock;
    findByIdOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let budgetLineRepository: { findByIdOrFail: jest.Mock };
  let budgetRepository: { findByIdOrFail: jest.Mock };
  let periodRepository: { listByFiscalYear: jest.Mock };
  let periodAccountTotalRepository: { listByAccount: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let dataSource: DataSource;
  let service: RequisitionsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    requisitionRepository = {
      findByIdOrFail: jest.fn(async () => makeRequisition({})),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeRequisition(data)),
      save: jest.fn(async (e) => e),
    };
    requisitionLineRepository = {
      findByRequisitionId: jest.fn(async () => []),
      findByIdOrFail: jest.fn(),
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    budgetLineRepository = { findByIdOrFail: jest.fn() };
    budgetRepository = { findByIdOrFail: jest.fn(async () => ({ id: "budget-1", fiscalYearId: "fy-1" })) };
    periodRepository = { listByFiscalYear: jest.fn(async () => [{ id: "period-1" }, { id: "period-2" }]) };
    periodAccountTotalRepository = { listByAccount: jest.fn(async () => []) };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    numberingService = { allocate: jest.fn(async () => "PRO-000001") };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work(em)),
    } as unknown as DataSource;

    service = new RequisitionsService(
      requisitionRepository as never,
      requisitionLineRepository as never,
      budgetLineRepository as never,
      budgetRepository as never,
      periodRepository as never,
      periodAccountTotalRepository as never,
      approvalEngine as never,
      numberingService as never,
      dataSource,
    );
  });

  describe("create", () => {
    it("allocates a number via NumberingService inside a transaction and starts DRAFT", async () => {
      await service.create({ requestedBy: "user-1", departmentId: "dept-1", justification: "Need supplies" }, "actor-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PROC_REQUISITION");
      expect(requisitionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ number: "PRO-000001", status: "DRAFT", budgetSnapshot: null }),
        em,
      );
    });
  });

  describe("line editing — DRAFT-only", () => {
    it("addLine rejects a line with neither item_id nor free_text", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      await expect(
        service.addLine("req-1", { qty: "1", estPrice: Money.fromInt(10) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("addLine rejects once the requisition is no longer DRAFT", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "SUBMITTED" }));
      await expect(
        service.addLine("req-1", { freeText: "Pens", qty: "1", estPrice: Money.fromInt(10) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("addLine recomputes totalEstimate from all lines", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      requisitionLineRepository.findByRequisitionId.mockResolvedValue([
        makeLine({ qty: "2", estPrice: Money.fromInt(100) }),
        makeLine({ id: "line-2", qty: "3", estPrice: Money.fromInt(50) }),
      ]);
      await service.addLine("req-1", { freeText: "Pens", qty: "2", estPrice: Money.fromInt(100) }, "actor-1");
      expect(requisitionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalEstimate: Money.fromInt(350) }),
      );
    });

    it("removeLine rejects once the requisition is no longer DRAFT", async () => {
      requisitionLineRepository.findByIdOrFail.mockResolvedValue(makeLine({}));
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "APPROVED" }));
      await expect(service.removeLine("line-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("submit", () => {
    it("rejects submitting a non-DRAFT requisition", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "APPROVED" }));
      await expect(service.submit(em, "req-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects submitting a requisition with no lines", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      requisitionLineRepository.findByRequisitionId.mockResolvedValue([]);
      await expect(service.submit(em, "req-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("computes totalEstimate, calls ApprovalEngineService.submit, and transitions to PENDING_APPROVAL", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      requisitionLineRepository.findByRequisitionId.mockResolvedValue([
        makeLine({ qty: "2", estPrice: Money.fromInt(100), budgetLineId: null }),
      ]);

      const result = await service.submit(em, "req-1", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          domainCode: PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE,
          entityType: "proc_requisition",
          entityId: "req-1",
          amount: Money.fromInt(200),
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("instance-1");
      expect(result.totalEstimate).toEqual(Money.fromInt(200));
    });

    it("budget_snapshot: unbudgeted lines (no budget_line_id) are recorded as budgeted:false", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      requisitionLineRepository.findByRequisitionId.mockResolvedValue([
        makeLine({ qty: "1", estPrice: Money.fromInt(50), budgetLineId: null }),
      ]);

      const result = await service.submit(em, "req-1", "initiator-1");
      const snapshot = result.budgetSnapshot as { lines: Array<{ budgeted: boolean; lineEstimate: string }> };
      expect(snapshot.lines[0]).toMatchObject({ budgeted: false, lineEstimate: "50.0000" });
    });

    it("budget_snapshot: budgeted lines compute actuals from gl_period_account_total within the budget's fiscal year, and available = annual - actuals - openCommitments(0)", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      requisitionLineRepository.findByRequisitionId.mockResolvedValue([
        makeLine({ qty: "2", estPrice: Money.fromInt(100), budgetLineId: "budget-line-1" }),
      ]);
      budgetLineRepository.findByIdOrFail.mockResolvedValue({
        id: "budget-line-1",
        budgetId: "budget-1",
        accountId: "acc-1",
        costCenterId: null,
        annualAmount: Money.fromInt(1000),
      });
      budgetRepository.findByIdOrFail.mockResolvedValue({ id: "budget-1", fiscalYearId: "fy-1" });
      periodRepository.listByFiscalYear.mockResolvedValue([{ id: "period-1" }, { id: "period-2" }]);
      periodAccountTotalRepository.listByAccount.mockResolvedValue([
        // Inside the fiscal year — counted.
        { periodId: "period-1", accountId: "acc-1", costCenterId: null, debitTotal: Money.fromInt(300), creditTotal: Money.ZERO },
        // Outside the fiscal year's own periods — excluded.
        { periodId: "period-99", accountId: "acc-1", costCenterId: null, debitTotal: Money.fromInt(999), creditTotal: Money.ZERO },
      ]);

      const result = await service.submit(em, "req-1", "initiator-1");
      const snapshot = result.budgetSnapshot as {
        lines: Array<{ budgeted: boolean; annualAmount: string; actuals: string; openCommitments: string; available: string; withinAvailable: boolean }>;
      };
      expect(snapshot.lines[0]).toMatchObject({
        budgeted: true,
        annualAmount: "1000.0000",
        actuals: "300.0000",
        openCommitments: "0.0000",
        available: "700.0000",
        withinAvailable: true,
      });
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a requisition that is not PENDING_APPROVAL", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("req-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved=true -> APPROVED", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("req-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("approved=false -> REJECTED", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("req-1", false, "actor-1");
      expect(result.status).toBe("REJECTED");
    });
  });

  describe("markConverted", () => {
    it("rejects a requisition that is not APPROVED", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "DRAFT" }));
      await expect(service.markConverted("req-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("APPROVED -> CONVERTED", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "APPROVED" }));
      const result = await service.markConverted("req-1", "actor-1");
      expect(result.status).toBe("CONVERTED");
    });
  });

  describe("cancel", () => {
    it.each(["CONVERTED", "CANCELLED", "REJECTED"] as const)("rejects cancelling from %s", async (status) => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status }));
      await expect(service.cancel("req-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it.each(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED"] as const)("cancels from %s", async (status) => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status }));
      const result = await service.cancel("req-1", "actor-1");
      expect(result.status).toBe("CANCELLED");
    });
  });
});
