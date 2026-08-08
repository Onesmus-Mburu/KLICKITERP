import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { GRN_ACCRUAL_ACCOUNT_CODE, PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE } from "../application/gl-grn-accounts.util";
import { GrnService } from "../application/grn.service";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";

function makeGrn(overrides: Partial<ProcGrnEntity>): ProcGrnEntity {
  return {
    id: "grn-1",
    number: "DRAFT-grn-1",
    poId: "po-1",
    receivedBy: "user-1",
    receivedAt: new Date("2026-07-10T00:00:00.000Z"),
    status: "DRAFT",
    journalId: null,
    notes: null,
    ...overrides,
  } as ProcGrnEntity;
}

function makeGrnLine(overrides: Partial<ProcGrnLineEntity>): ProcGrnLineEntity {
  return {
    id: "grnline-1",
    grnId: "grn-1",
    poLineId: "poline-1",
    receivedQty: "10.0000",
    rejectedQty: "0.0000",
    rejectionReason: null,
    unitCost: Money.fromInt(20),
    ...overrides,
  } as ProcGrnLineEntity;
}

function makePoLine(overrides: Partial<ProcPoLineEntity>): ProcPoLineEntity {
  return {
    id: "poline-1",
    poId: "po-1",
    lineNo: 1,
    itemId: null,
    description: "Item A",
    qty: "10.0000",
    unitPrice: Money.fromInt(20),
    receivedQty: "0.0000",
    ...overrides,
  } as ProcPoLineEntity;
}

function makePo(overrides: Partial<ProcPurchaseOrderEntity>): ProcPurchaseOrderEntity {
  return {
    id: "po-1",
    number: "PO-000001",
    status: "ISSUED",
    ...overrides,
  } as ProcPurchaseOrderEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("GrnService", () => {
  let grnRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; findByPoId: jest.Mock };
  let grnLineRepository: { findByGrnId: jest.Mock; findByPoLineId: jest.Mock; create: jest.Mock };
  let poLineRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let poRepository: { findByIdOrFail: jest.Mock };
  let purchaseOrdersService: { updateReceivingStatus: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let service: GrnService;

  const em = {} as EntityManager;

  beforeEach(() => {
    grnRepository = {
      findByIdOrFail: jest.fn(async () => makeGrn({})),
      create: jest.fn(async (data) => makeGrn(data)),
      save: jest.fn(async (e) => e),
      findByPoId: jest.fn(async () => []),
    };
    grnLineRepository = {
      findByGrnId: jest.fn(async () => []),
      findByPoLineId: jest.fn(async () => []),
      create: jest.fn(async (data) => makeGrnLine(data)),
    };
    poLineRepository = {
      findByIdOrFail: jest.fn(async () => makePoLine({})),
      save: jest.fn(async (e) => e),
    };
    poRepository = { findByIdOrFail: jest.fn(async () => makePo({})) };
    purchaseOrdersService = { updateReceivingStatus: jest.fn(async () => undefined) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async () => [makeAccount({ id: "inventory-acc" })]),
      findByCode: jest.fn(async (code: string) => {
        if (code === GRN_ACCRUAL_ACCOUNT_CODE) return makeAccount({ id: "grn-accrual-acc", code });
        if (code === PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE) return makeAccount({ id: "expense-wip-acc", code });
        return null;
      }),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "GRN-000001") };
    settingsService = { getTyped: jest.fn(async (_key: string, def: number) => def) };

    service = new GrnService(
      grnRepository as never,
      grnLineRepository as never,
      poLineRepository as never,
      poRepository as never,
      purchaseOrdersService as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      settingsService as never,
    );
  });

  describe("receive", () => {
    const oneLine = [{ poLineId: "poline-1", receivedQty: "5", unitCost: Money.fromInt(20) }];

    it("rejects zero lines", async () => {
      await expect(service.receive(em, { poId: "po-1", receivedBy: "user-1", lines: [] })).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("BR-PROC-01: rejects a PO that is not ISSUED/PARTIALLY_RECEIVED", async () => {
      poRepository.findByIdOrFail.mockResolvedValue(makePo({ status: "APPROVED" }));
      await expect(
        service.receive(em, { poId: "po-1", receivedBy: "user-1", lines: oneLine }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a PO line that does not belong to the PO", async () => {
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ poId: "some-other-po" }));
      await expect(
        service.receive(em, { poId: "po-1", receivedBy: "user-1", lines: oneLine }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive received_qty", async () => {
      await expect(
        service.receive(em, {
          poId: "po-1",
          receivedBy: "user-1",
          lines: [{ poLineId: "poline-1", receivedQty: "0", unitCost: Money.fromInt(20) }],
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-03: clamps a configured tolerance above 5% down to the DB's hard 5% ceiling — trg_proc_grn_qty_cap remains the real backstop", async () => {
      settingsService.getTyped.mockResolvedValue(20); // configured generously above the DB's hard cap
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ qty: "100" }));
      await expect(
        service.receive(em, {
          poId: "po-1",
          receivedBy: "user-1",
          // 106 > 100 * 1.05 (the clamped 5% ceiling), even though the configured 20% would allow it.
          lines: [{ poLineId: "poline-1", receivedQty: "106", unitCost: Money.fromInt(20) }],
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-03: enforces a TIGHTER-than-5% configured tolerance", async () => {
      settingsService.getTyped.mockResolvedValue(2);
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ qty: "100" }));
      await expect(
        service.receive(em, {
          poId: "po-1",
          receivedBy: "user-1",
          // 103 > 100 * 1.02 (the configured, tighter 2% ceiling).
          lines: [{ poLineId: "poline-1", receivedQty: "103", unitCost: Money.fromInt(20) }],
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts a receipt within the configured tolerance, increments received_qty, and rolls up PO status", async () => {
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ qty: "10", receivedQty: "0" }));
      await service.receive(em, { poId: "po-1", receivedBy: "user-1", lines: oneLine, notes: "partial delivery" });

      expect(grnLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ poLineId: "poline-1", receivedQty: "5", rejectedQty: "0" }),
        em,
      );
      expect(poLineRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ receivedQty: "5.0000" }),
        em,
      );
      expect(purchaseOrdersService.updateReceivingStatus).toHaveBeenCalledWith(em, "po-1");
    });

    it("starts the GRN in DRAFT with a placeholder number", async () => {
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ qty: "10" }));
      const grn = await service.receive(em, { poId: "po-1", receivedBy: "user-1", lines: oneLine });
      expect(grn.status).toBe("DRAFT");
      expect(grn.number).toMatch(/^DRAFT-/);
    });
  });

  describe("post", () => {
    it("rejects a non-DRAFT GRN", async () => {
      grnRepository.findByIdOrFail.mockResolvedValue(makeGrn({ status: "POSTED" }));
      await expect(service.post(em, "grn-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a GRN with no lines", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([]);
      await expect(service.post(em, "grn-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when every line is fully rejected (zero accepted value)", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([
        makeGrnLine({ receivedQty: "5", rejectedQty: "5" }),
      ]);
      await expect(service.post(em, "grn-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("P-19 (item_id null, today's only reachable branch): debits the Procurement Expense/WIP account, credits GRN Accrual, for acceptedQty * unit_cost", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([
        makeGrnLine({ receivedQty: "10", rejectedQty: "2", unitCost: Money.fromInt(20) }),
      ]);
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ itemId: null }));

      await service.post(em, "grn-1", "poster-1");

      // acceptedQty = 10 - 2 = 8; lineValue = 8 * 20 = 160.
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "expense-wip-acc", debit: Money.fromInt(160), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "grn-accrual-acc", debit: Money.ZERO, credit: Money.fromInt(160) }),
          ],
        }),
      );
      expect(glAccountRepository.findByControlDomain).not.toHaveBeenCalled();
    });

    it("P-18 (item_id set, future-ready once Module 13/Inventory populates it): debits the INVENTORY control account, credits the SAME GRN Accrual account", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([
        makeGrnLine({ receivedQty: "10", rejectedQty: "0", unitCost: Money.fromInt(20) }),
      ]);
      poLineRepository.findByIdOrFail.mockResolvedValue(makePoLine({ itemId: "item-1" }));

      await service.post(em, "grn-1", "poster-1");

      expect(glAccountRepository.findByControlDomain).toHaveBeenCalledWith("INVENTORY", em);
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "inventory-acc", debit: Money.fromInt(200), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "grn-accrual-acc", debit: Money.ZERO, credit: Money.fromInt(200) }),
          ],
        }),
      );
    });

    it("allocates the real GRN number, sets status=POSTED, and stamps journal_id", async () => {
      grnLineRepository.findByGrnId.mockResolvedValue([makeGrnLine({ receivedQty: "10", rejectedQty: "0" })]);
      const result = await service.post(em, "grn-1", "poster-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PROC_GRN");
      expect(result.number).toBe("GRN-000001");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});
