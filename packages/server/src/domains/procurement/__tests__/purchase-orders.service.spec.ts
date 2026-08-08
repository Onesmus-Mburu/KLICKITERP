import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PROCUREMENT_PO_APPROVAL_DOMAIN_CODE, PurchaseOrdersService } from "../application/purchase-orders.service";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";

function makePo(overrides: Partial<ProcPurchaseOrderEntity>): ProcPurchaseOrderEntity {
  return {
    id: "po-1",
    number: "DRAFT-po-1",
    revision: 0,
    supersedesId: null,
    supplierId: "supplier-1",
    requisitionId: "req-1",
    quotationId: null,
    status: "DRAFT",
    approvalRef: null,
    orderDate: "2026-07-01",
    deliveryTerms: null,
    paymentTermsDays: 30,
    subtotal: Money.fromInt(500),
    taxAmount: Money.ZERO,
    total: Money.fromInt(500),
    issuedAt: null,
    ...overrides,
  } as ProcPurchaseOrderEntity;
}

function makeRequisition(overrides: Partial<ProcRequisitionEntity>): ProcRequisitionEntity {
  return { id: "req-1", status: "APPROVED", ...overrides } as ProcRequisitionEntity;
}

function makeSupplier(overrides: Partial<ProcSupplierEntity>): ProcSupplierEntity {
  return { id: "supplier-1", status: "ACTIVE", paymentTermsDays: 45, ...overrides } as ProcSupplierEntity;
}

function makePoLine(overrides: Partial<ProcPoLineEntity>): ProcPoLineEntity {
  return {
    id: "poline-1",
    poId: "po-1",
    lineNo: 1,
    itemId: null,
    description: "Item A",
    qty: "10.0000",
    unitPrice: Money.fromInt(50),
    receivedQty: "0.0000",
    ...overrides,
  } as ProcPoLineEntity;
}

describe("PurchaseOrdersService", () => {
  let poRepository: { findByIdOrFail: jest.Mock; findById: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let poLineRepository: { findByPoId: jest.Mock; create: jest.Mock; save: jest.Mock };
  let supplierRepository: { findByIdOrFail: jest.Mock };
  let requisitionRepository: { findByIdOrFail: jest.Mock; findById: jest.Mock };
  let quotationRepository: { findByIdOrFail: jest.Mock };
  let requisitionsService: { markConverted: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let service: PurchaseOrdersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    poRepository = {
      findByIdOrFail: jest.fn(async () => makePo({})),
      findById: jest.fn(),
      create: jest.fn(async (data) => makePo(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    poLineRepository = {
      findByPoId: jest.fn(async () => []),
      create: jest.fn(async (data) => makePoLine(data)),
      save: jest.fn(async (e) => e),
    };
    supplierRepository = { findByIdOrFail: jest.fn(async () => makeSupplier({})) };
    requisitionRepository = {
      findByIdOrFail: jest.fn(async () => makeRequisition({})),
      findById: jest.fn(async () => null),
    };
    quotationRepository = { findByIdOrFail: jest.fn() };
    requisitionsService = { markConverted: jest.fn(async () => undefined) };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    numberingService = { allocate: jest.fn(async () => "PO-000001") };

    service = new PurchaseOrdersService(
      poRepository as never,
      poLineRepository as never,
      supplierRepository as never,
      requisitionRepository as never,
      quotationRepository as never,
      requisitionsService as never,
      approvalEngine as never,
      numberingService as never,
    );
  });

  describe("createFromRequisition", () => {
    const oneLine = [{ description: "Item A", qty: "10", unitPrice: Money.fromInt(50) }];

    it("rejects zero lines", async () => {
      await expect(
        service.createFromRequisition(em, { requisitionId: "req-1", supplierId: "supplier-1", lines: [] }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when requisitionId is omitted and bypassRequisition is not set", async () => {
      await expect(
        service.createFromRequisition(em, { supplierId: "supplier-1", lines: oneLine }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-01: rejects when the requisition is not APPROVED", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "SUBMITTED" }));
      await expect(
        service.createFromRequisition(em, { requisitionId: "req-1", supplierId: "supplier-1", lines: oneLine }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-05: rejects a BLACKLISTED supplier", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "BLACKLISTED" }));
      await expect(
        service.createFromRequisition(em, { requisitionId: "req-1", supplierId: "supplier-1", lines: oneLine }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates a DRAFT PO with a placeholder number, snapshots supplier payment_terms_days, and marks the requisition CONVERTED", async () => {
      const po = await service.createFromRequisition(
        em,
        { requisitionId: "req-1", supplierId: "supplier-1", lines: oneLine },
        "initiator-1",
      );
      expect(po.status).toBe("DRAFT");
      expect(po.number).toMatch(/^DRAFT-/);
      expect(po.paymentTermsDays).toBe(45);
      expect(po.subtotal).toEqual(Money.fromInt(500));
      expect(requisitionsService.markConverted).toHaveBeenCalledWith("req-1", "initiator-1", em);
    });

    it("bypassRequisition=true with no requisitionId succeeds and never marks a requisition converted", async () => {
      const po = await service.createFromRequisition(
        em,
        { supplierId: "supplier-1", lines: oneLine, bypassRequisition: true },
        "initiator-1",
      );
      expect(po.requisitionId).toBeNull();
      expect(requisitionsService.markConverted).not.toHaveBeenCalled();
    });
  });

  describe("submitForApproval", () => {
    it("rejects a non-DRAFT PO", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "APPROVED" }));
      await expect(service.submitForApproval(em, "po-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("calls ApprovalEngineService.submit with amount=po.total and transitions to PENDING_APPROVAL", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "DRAFT", total: Money.fromInt(500) }));
      const result = await service.submitForApproval(em, "po-1", "initiator-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          domainCode: PROCUREMENT_PO_APPROVAL_DOMAIN_CODE,
          entityType: "proc_purchase_order",
          entityId: "po-1",
          amount: Money.fromInt(500),
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
    });
  });

  describe("onApprovalDecided", () => {
    it("approved=true -> APPROVED", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("po-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("approved=false -> back to DRAFT", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("po-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
    });
  });

  describe("issue — freezing point", () => {
    it("rejects a non-APPROVED PO", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "DRAFT" }));
      await expect(service.issue(em, "po-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("allocates the real number, sets status=ISSUED, and stamps issued_at", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "APPROVED", supersedesId: null }));
      const result = await service.issue(em, "po-1", "actor-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PROC_PO");
      expect(result.number).toBe("PO-000001");
      expect(result.status).toBe("ISSUED");
      expect(result.issuedAt).toBeInstanceOf(Date);
    });

    it("a revision (supersedes_id set) derives its number from the original and cancels the original", async () => {
      const original = makePo({ id: "po-1", number: "PO-000001", revision: 0, status: "ISSUED" });
      const revision = makePo({ id: "po-2", number: "DRAFT-po-2", revision: 1, supersedesId: "po-1", status: "APPROVED" });
      poRepository.findByIdOrFail.mockImplementation(async (id: string) => (id === "po-1" ? original : revision));

      const result = await service.issue(em, "po-2", "actor-1");

      expect(numberingService.allocate).not.toHaveBeenCalled();
      expect(result.number).toBe("PO-000001-R1");
      expect(poRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "po-1", status: "CANCELLED" }), em);
    });
  });

  describe("revise — PO-revision-superseding", () => {
    it("rejects revising a PO that has never been ISSUED", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "APPROVED" }));
      await expect(service.revise(em, "po-1", {}, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects revising a PO that is RECEIVED/CLOSED/CANCELLED", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "RECEIVED" }));
      await expect(service.revise(em, "po-1", {}, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-05: rejects revising onto a BLACKLISTED supplier", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "ISSUED" }));
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ status: "BLACKLISTED" }));
      await expect(service.revise(em, "po-1", { supplierId: "supplier-2" }, "initiator-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("creates a new DRAFT row with revision+1, supersedes_id set, carrying forward the original's lines when none supplied", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ id: "po-1", status: "ISSUED", revision: 0 }));
      poLineRepository.findByPoId.mockResolvedValue([makePoLine({ qty: "10", unitPrice: Money.fromInt(50) })]);

      const revised = await service.revise(em, "po-1", {}, "initiator-1");

      expect(revised.status).toBe("DRAFT");
      expect(revised.revision).toBe(1);
      expect(revised.supersedesId).toBe("po-1");
      expect(revised.number).toMatch(/^DRAFT-/);
      expect(revised.subtotal).toEqual(Money.fromInt(500));
    });
  });

  describe("updateReceivingStatus", () => {
    it("stays ISSUED when nothing has been received yet", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "ISSUED" }));
      poLineRepository.findByPoId.mockResolvedValue([makePoLine({ qty: "10", receivedQty: "0" })]);
      await service.updateReceivingStatus(em, "po-1");
      expect(poRepository.save).not.toHaveBeenCalled();
    });

    it("transitions to PARTIALLY_RECEIVED when some but not all qty has been received", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "ISSUED" }));
      poLineRepository.findByPoId.mockResolvedValue([makePoLine({ qty: "10", receivedQty: "4" })]);
      const result = await service.updateReceivingStatus(em, "po-1");
      expect(result.status).toBe("PARTIALLY_RECEIVED");
    });

    it("transitions to RECEIVED when total received_qty >= total qty", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "PARTIALLY_RECEIVED" }));
      poLineRepository.findByPoId.mockResolvedValue([makePoLine({ qty: "10", receivedQty: "10" })]);
      const result = await service.updateReceivingStatus(em, "po-1");
      expect(result.status).toBe("RECEIVED");
    });
  });
});
