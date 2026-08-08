import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { STOCK_LOSS_EXPENSE_ACCOUNT_CODE } from "../application/gl-inventory-accounts.util";
import { StockTakesService } from "../application/stock-takes.service";
import { InvItemEntity } from "../domain/inv-item.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { InvStockTakeEntity } from "../domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";

function makeStockTake(overrides: Partial<InvStockTakeEntity> = {}): InvStockTakeEntity {
  return {
    id: "st-1",
    number: "STK-000001",
    storeId: "store-1",
    scope: { itemIds: "ALL" },
    snapshotAt: new Date("2026-07-01T00:00:00.000Z"),
    status: "OPEN",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as InvStockTakeEntity;
}

function makeLine(overrides: Partial<InvStockTakeLineEntity> = {}): InvStockTakeLineEntity {
  return {
    id: "line-1",
    stockTakeId: "st-1",
    itemId: "item-1",
    snapshotQty: "10.0000",
    countedQty: null,
    varianceQty: null,
    varianceValue: null,
    ...overrides,
  } as InvStockTakeLineEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("StockTakesService", () => {
  let stockTakeRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let stockTakeLineRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findByStockTakeId: jest.Mock };
  let stockBalanceRepository: { listByStore: jest.Mock; findByItemStore: jest.Mock };
  let itemRepository: { findByIdOrFail: jest.Mock };
  let stockMovementsService: { recordAdjustment: jest.Mock };
  let approvalEngine: { submit: jest.Mock; getStatus: jest.Mock };
  let postingService: { post: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let service: StockTakesService;

  const em = {} as EntityManager;

  beforeEach(() => {
    stockTakeRepository = {
      create: jest.fn(async (data) => makeStockTake(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeStockTake()),
      list: jest.fn(async () => []),
    };
    stockTakeLineRepository = {
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeLine()),
      findByStockTakeId: jest.fn(async () => []),
    };
    stockBalanceRepository = {
      listByStore: jest.fn(async () => []),
      findByItemStore: jest.fn(async () => null),
    };
    itemRepository = { findByIdOrFail: jest.fn(async () => ({ id: "item-1", avgCost: "10.000000" }) as InvItemEntity) };
    stockMovementsService = { recordAdjustment: jest.fn(async () => ({ id: "mv-1" })) };
    approvalEngine = {
      submit: jest.fn(async () => ({ id: "instance-1" })),
      getStatus: jest.fn(async () => ({ id: "instance-1", status: "APPROVED" })),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async () => [makeAccount({ id: "inventory-acc" })]),
      findByCode: jest.fn(async (code: string) => (code === STOCK_LOSS_EXPENSE_ACCOUNT_CODE ? makeAccount({ id: "loss-acc", code }) : null)),
    };
    numberingService = { allocate: jest.fn(async () => "STK-000001") };

    service = new StockTakesService(
      stockTakeRepository as never,
      stockTakeLineRepository as never,
      stockBalanceRepository as never,
      itemRepository as never,
      stockMovementsService as never,
      approvalEngine as never,
      postingService as never,
      glAccountRepository as never,
      numberingService as never,
    );
  });

  describe("createSession", () => {
    it("scope.itemIds='ALL' snapshots every item with a balance at this store", async () => {
      stockBalanceRepository.listByStore.mockResolvedValue([
        { itemId: "item-1", qty: "10.0000" } as InvStockBalanceEntity,
        { itemId: "item-2", qty: "5.0000" } as InvStockBalanceEntity,
      ]);
      stockBalanceRepository.findByItemStore.mockImplementation(async (itemId: string) =>
        itemId === "item-1" ? ({ qty: "10.0000" } as InvStockBalanceEntity) : ({ qty: "5.0000" } as InvStockBalanceEntity),
      );

      await service.createSession(em, { storeId: "store-1", scope: { itemIds: "ALL" } }, "user-1");

      expect(stockTakeLineRepository.create).toHaveBeenCalledTimes(2);
      expect(stockTakeLineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ itemId: "item-1", snapshotQty: "10.0000" }), em);
    });

    it("rejects scope.itemIds='ALL' when the store has no balance rows at all", async () => {
      stockBalanceRepository.listByStore.mockResolvedValue([]);
      await expect(service.createSession(em, { storeId: "store-1", scope: { itemIds: "ALL" } }, "user-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects an empty explicit itemIds array", async () => {
      await expect(service.createSession(em, { storeId: "store-1", scope: { itemIds: [] } }, "user-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("snapshots snapshot_qty=0 for an item with no existing balance row", async () => {
      stockBalanceRepository.findByItemStore.mockResolvedValue(null);
      await service.createSession(em, { storeId: "store-1", scope: { itemIds: ["item-3"] } }, "user-1");
      expect(stockTakeLineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ itemId: "item-3", snapshotQty: "0.0000" }), em);
    });
  });

  describe("recordCounts", () => {
    it("moves to COUNTING when not every line is counted yet", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([makeLine({ countedQty: "9" }), makeLine({ id: "line-2", countedQty: null })]);
      const result = await service.recordCounts(em, "st-1", [{ lineId: "line-1", countedQty: "9" }], "user-1");
      expect(result.status).toBe("COUNTING");
    });

    it("moves to REVIEW once every line has a non-null counted_qty", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([makeLine({ countedQty: "9" }), makeLine({ id: "line-2", countedQty: "5" })]);
      const result = await service.recordCounts(em, "st-1", [{ lineId: "line-1", countedQty: "9" }], "user-1");
      expect(result.status).toBe("REVIEW");
    });

    it("rejects recording counts once the session is past COUNTING", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "REVIEW" }));
      await expect(service.recordCounts(em, "st-1", [{ lineId: "line-1", countedQty: "9" }], "user-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });

  describe("submitForApproval", () => {
    it("computes variance_value = variance_qty * avg_cost per line and submits the ABS sum as the approval amount", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "REVIEW" }));
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([
        makeLine({ id: "line-1", varianceQty: "-2.0000" }), // loss: -2 * 10 = -20.00
        makeLine({ id: "line-2", varianceQty: "3.0000" }), //  gain: 3 * 10 = 30.00
      ]);

      await service.submitForApproval(em, "st-1", "user-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: "STOCK_ADJUSTMENTS", entityType: "inv_stock_take", entityId: "st-1", amount: Money.fromDecimalString("50.00") }),
      );
      expect(stockTakeLineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", varianceValue: Money.fromDecimalString("-20.00") }), em);
      expect(stockTakeLineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "line-2", varianceValue: Money.fromDecimalString("30.00") }), em);
    });

    it("rejects submitting a non-REVIEW stock take", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "COUNTING" }));
      await expect(service.submitForApproval(em, "st-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided", () => {
    it("approved=true leaves status at PENDING_APPROVAL (no APPROVED value exists on the enum — see doc comment)", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("st-1", true, "user-1");
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(stockTakeRepository.save).not.toHaveBeenCalled();
    });

    it("approved=false moves the stock take back to REVIEW", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("st-1", false, "user-1");
      expect(result.status).toBe("REVIEW");
    });

    it("rejects deciding a non-PENDING_APPROVAL stock take", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "REVIEW" }));
      await expect(service.onApprovalDecided("st-1", true, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("post", () => {
    beforeEach(() => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "PENDING_APPROVAL", approvalRef: "instance-1" }));
    });

    it("rejects a non-PENDING_APPROVAL stock take", async () => {
      stockTakeRepository.findByIdOrFail.mockResolvedValue(makeStockTake({ status: "REVIEW" }));
      await expect(service.post(em, "st-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when the underlying appr_instance is not APPROVED", async () => {
      approvalEngine.getStatus.mockResolvedValue({ id: "instance-1", status: "PENDING" });
      await expect(service.post(em, "st-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("net LOSS: debits Stock Loss Expense, credits INVENTORY, for the exact net variance", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([
        makeLine({ id: "line-1", varianceQty: "-2.0000", varianceValue: Money.fromDecimalString("-20.00") }),
      ]);

      await service.post(em, "st-1", "poster-1");

      expect(stockMovementsService.recordAdjustment).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ itemId: "item-1", storeId: "store-1", qtyDelta: "-2.0000", unitCost: "10.000000" }),
      );
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "loss-acc", debit: Money.fromDecimalString("20.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "inventory-acc", debit: Money.ZERO, credit: Money.fromDecimalString("20.00") }),
          ],
        }),
      );
    });

    it("net GAIN: debits INVENTORY, credits Stock Loss Expense (reversed per the P-24 posting map)", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([
        makeLine({ id: "line-1", varianceQty: "3.0000", varianceValue: Money.fromDecimalString("30.00") }),
      ]);

      await service.post(em, "st-1", "poster-1");

      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "inventory-acc", debit: Money.fromDecimalString("30.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "loss-acc", debit: Money.ZERO, credit: Money.fromDecimalString("30.00") }),
          ],
        }),
      );
    });

    it("net ZERO (offsetting gain/loss lines): still adjusts physical stock per line, but posts NO journal", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([
        makeLine({ id: "line-1", varianceQty: "-2.0000", varianceValue: Money.fromDecimalString("-20.00") }),
        makeLine({ id: "line-2", varianceQty: "2.0000", varianceValue: Money.fromDecimalString("20.00") }),
      ]);

      const result = await service.post(em, "st-1", "poster-1");

      expect(stockMovementsService.recordAdjustment).toHaveBeenCalledTimes(2);
      expect(postingService.post).not.toHaveBeenCalled();
      expect(result.journalId).toBeNull();
      expect(result.status).toBe("POSTED");
    });

    it("skips lines with zero variance_qty entirely", async () => {
      stockTakeLineRepository.findByStockTakeId.mockResolvedValue([makeLine({ id: "line-1", varianceQty: "0.0000", varianceValue: Money.ZERO })]);
      const result = await service.post(em, "st-1", "poster-1");
      expect(stockMovementsService.recordAdjustment).not.toHaveBeenCalled();
      expect(postingService.post).not.toHaveBeenCalled();
      expect(result.status).toBe("POSTED");
    });
  });
});
