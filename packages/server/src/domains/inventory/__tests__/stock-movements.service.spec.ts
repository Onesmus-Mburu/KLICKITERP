import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { StockMovementsService } from "../application/stock-movements.service";
import { InvItemEntity } from "../domain/inv-item.entity";
import { InvMovementEntity } from "../domain/inv-movement.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { InvStockTakeEntity } from "../domain/inv-stock-take.entity";

function makeItem(overrides: Partial<InvItemEntity> = {}): InvItemEntity {
  return { id: "item-1", code: "ITM-1", name: "Widget", avgCost: "10.000000", isActive: true, ...overrides } as InvItemEntity;
}

function makeBalance(overrides: Partial<InvStockBalanceEntity> = {}): InvStockBalanceEntity {
  return { id: "bal-1", itemId: "item-1", storeId: "store-1", qty: "0.0000", value: Money.ZERO, ...overrides } as InvStockBalanceEntity;
}

function makeMovement(overrides: Partial<InvMovementEntity> = {}): InvMovementEntity {
  return {
    id: "mv-1",
    itemId: "item-1",
    storeId: "store-1",
    movementType: "RECEIPT",
    qty: "0.0000",
    unitCost: "0.000000",
    value: Money.ZERO,
    refDocType: "test",
    refDocId: "ref-1",
    departmentId: null,
    journalId: null,
    at: new Date(),
    ...overrides,
  } as InvMovementEntity;
}

function makeStockTake(overrides: Partial<InvStockTakeEntity> = {}): InvStockTakeEntity {
  return {
    id: "st-1",
    number: "ST-000001",
    storeId: "store-1",
    scope: { itemIds: "ALL" },
    status: "OPEN",
    ...overrides,
  } as InvStockTakeEntity;
}

describe("StockMovementsService", () => {
  let stockBalanceRepository: {
    findByIdForUpdate: jest.Mock;
    findByItemStore: jest.Mock;
    listByStore: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let movementRepository: { listByRefDoc: jest.Mock; listForItemStore: jest.Mock; create: jest.Mock };
  let itemRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let stockTakeRepository: { listOpenForStore: jest.Mock };
  let service: StockMovementsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    stockBalanceRepository = {
      findByIdForUpdate: jest.fn(async () => null),
      findByItemStore: jest.fn(async () => null),
      listByStore: jest.fn(async () => []),
      create: jest.fn(async (data) => makeBalance(data)),
      save: jest.fn(async (e) => e),
    };
    movementRepository = {
      listByRefDoc: jest.fn(async () => []),
      listForItemStore: jest.fn(async () => []),
      create: jest.fn(async (data) => makeMovement(data)),
    };
    itemRepository = {
      findByIdOrFail: jest.fn(async () => makeItem()),
      save: jest.fn(async (e) => e),
    };
    stockTakeRepository = { listOpenForStore: jest.fn(async () => []) };

    service = new StockMovementsService(
      stockBalanceRepository as never,
      movementRepository as never,
      itemRepository as never,
      stockTakeRepository as never,
    );
  });

  describe("recordReceipt", () => {
    it("first-receipt-into-empty-balance: new_avg equals the receipt's own unit_cost", async () => {
      const movement = await service.recordReceipt(em, {
        itemId: "item-1",
        storeId: "store-1",
        qty: "10",
        unitCost: "5.500000",
        refDocType: "proc_grn_line",
        refDocId: "grn-line-1",
      });

      // value = 10 * 5.5 = 55.00
      expect(movement.value).toEqual(Money.fromDecimalString("55.00"));
      expect(stockBalanceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-1", storeId: "store-1", qty: "10.0000", value: Money.fromDecimalString("55.00") }),
        em,
      );
      expect(itemRepository.save).toHaveBeenCalledWith(expect.objectContaining({ avgCost: "5.500000" }), em);
    });

    it("exact FR-INV-006.1 weighted-average blend on a SECOND receipt into an existing balance", async () => {
      // on hand: 10 units @ value 50.00 (avg 5.00); receipt: 10 units @ 7.00 = 70.00.
      // new_avg = (50 + 70) / (10 + 10) = 120/20 = 6.000000
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "10.0000", value: Money.fromDecimalString("50.00") }));

      const movement = await service.recordReceipt(em, {
        itemId: "item-1",
        storeId: "store-1",
        qty: "10",
        unitCost: "7.000000",
        refDocType: "proc_grn_line",
        refDocId: "grn-line-2",
      });

      expect(movement.value).toEqual(Money.fromDecimalString("70.00"));
      expect(stockBalanceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "20.0000", value: Money.fromDecimalString("120.00") }),
        em,
      );
      expect(itemRepository.save).toHaveBeenCalledWith(expect.objectContaining({ avgCost: "6.000000" }), em);
    });

    it("rejects a non-positive qty", async () => {
      await expect(
        service.recordReceipt(em, { itemId: "item-1", storeId: "store-1", qty: "0", unitCost: "5", refDocType: "x", refDocId: "y" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("idempotency: replaying the same (refDocType, refDocId) returns the existing RECEIPT movement without re-applying", async () => {
      const existing = makeMovement({ movementType: "RECEIPT" });
      movementRepository.listByRefDoc.mockResolvedValue([existing]);

      const result = await service.recordReceipt(em, {
        itemId: "item-1",
        storeId: "store-1",
        qty: "10",
        unitCost: "5",
        refDocType: "proc_grn_line",
        refDocId: "grn-line-1",
      });

      expect(result).toBe(existing);
      expect(stockBalanceRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });
  });

  describe("recordIssue", () => {
    it("BR-INV-01: rejects when qty exceeds the current balance", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "5.0000", value: Money.fromDecimalString("50.00") }));

      await expect(
        service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "10", refDocType: "x", refDocId: "y" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-INV-03: rejects when an OPEN stock take's scope covers this item at this store", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "50.0000", value: Money.fromDecimalString("500.00") }));
      stockTakeRepository.listOpenForStore.mockResolvedValue([makeStockTake({ status: "COUNTING", scope: { itemIds: ["item-1"] } })]);

      await expect(
        service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "5", refDocType: "x", refDocId: "y" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-INV-03: does NOT block when the open stock take's scope does not cover this item", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "50.0000", value: Money.fromDecimalString("500.00") }));
      stockTakeRepository.listOpenForStore.mockResolvedValue([makeStockTake({ status: "COUNTING", scope: { itemIds: ["some-other-item"] } })]);

      await expect(
        service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "5", refDocType: "x", refDocId: "y" }),
      ).resolves.toBeDefined();
    });

    it("BR-INV-03: does NOT block against an APPROVED-equivalent... i.e. any status outside the frozen set", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "50.0000", value: Money.fromDecimalString("500.00") }));
      // listOpenForStore's own contract already excludes POSTED/CANCELLED; simulate a status this service treats as non-frozen.
      stockTakeRepository.listOpenForStore.mockResolvedValue([]);

      await expect(
        service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "5", refDocType: "x", refDocId: "y" }),
      ).resolves.toBeDefined();
    });

    it("values the issued qty at the item's CURRENT avg_cost and does not recalculate it", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(makeItem({ avgCost: "4.500000" }));
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "20.0000", value: Money.fromDecimalString("90.00") }));

      const movement = await service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "6", refDocType: "x", refDocId: "y" });

      expect(movement.qty).toBe("-6.0000");
      expect(movement.unitCost).toBe("4.500000");
      // value = -6 * 4.5 = -27.00
      expect(movement.value).toEqual(Money.fromDecimalString("-27.00"));
      expect(stockBalanceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "14.0000", value: Money.fromDecimalString("63.00") }),
        em,
      );
      expect(itemRepository.save).not.toHaveBeenCalled();
    });

    it("movement_type=ISSUE", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "20.0000", value: Money.fromDecimalString("90.00") }));
      const movement = await service.recordIssue(em, { itemId: "item-1", storeId: "store-1", qty: "1", refDocType: "x", refDocId: "y" });
      expect(movementRepository.create).toHaveBeenCalledWith(expect.objectContaining({ movementType: "ISSUE" }), em);
      void movement;
    });
  });

  describe("recordSale", () => {
    it("movement_type=SALE, same shortage/valuation mechanics as recordIssue", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "10.0000", value: Money.fromDecimalString("40.00") }));
      await service.recordSale(em, { itemId: "item-1", storeId: "store-1", qty: "2", refDocType: "pos", refDocId: "sale-1" });
      expect(movementRepository.create).toHaveBeenCalledWith(expect.objectContaining({ movementType: "SALE" }), em);
    });
  });

  describe("recordReturn", () => {
    it("traces the ORIGINAL ISSUE/SALE movement's cost via the same ref document", async () => {
      movementRepository.listByRefDoc.mockResolvedValue([makeMovement({ movementType: "SALE", unitCost: "9.000000" })]);
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "5.0000", value: Money.fromDecimalString("25.00") }));

      const movement = await service.recordReturn(em, { itemId: "item-1", storeId: "store-1", qty: "2", refDocType: "pos", refDocId: "sale-1" });

      expect(movement.unitCost).toBe("9.000000");
    });

    it("falls back to the item's current avg_cost when no original ISSUE/SALE is traceable", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(makeItem({ avgCost: "3.250000" }));
      movementRepository.listByRefDoc.mockResolvedValue([]);
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "5.0000", value: Money.fromDecimalString("25.00") }));

      const movement = await service.recordReturn(em, { itemId: "item-1", storeId: "store-1", qty: "2", refDocType: "note", refDocId: "note-1" });

      expect(movement.unitCost).toBe("3.250000");
    });
  });

  describe("recordAdjustment", () => {
    it("gain (positive qtyDelta) increases balance qty/value, no avg_cost recalculation", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "10.0000", value: Money.fromDecimalString("100.00") }));

      const movement = await service.recordAdjustment(em, {
        itemId: "item-1",
        storeId: "store-1",
        qtyDelta: "3",
        unitCost: "10.000000",
        refDocType: "inv_stock_take_line",
        refDocId: "line-1",
      });

      expect(movement.value).toEqual(Money.fromDecimalString("30.00"));
      expect(stockBalanceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "13.0000", value: Money.fromDecimalString("130.00") }),
        em,
      );
      expect(itemRepository.save).not.toHaveBeenCalled();
    });

    it("loss (negative qtyDelta) decreases balance qty/value", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "10.0000", value: Money.fromDecimalString("100.00") }));

      const movement = await service.recordAdjustment(em, {
        itemId: "item-1",
        storeId: "store-1",
        qtyDelta: "-4",
        unitCost: "10.000000",
        refDocType: "inv_stock_take_line",
        refDocId: "line-2",
      });

      expect(movement.value).toEqual(Money.fromDecimalString("-40.00"));
      expect(stockBalanceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "6.0000", value: Money.fromDecimalString("60.00") }),
        em,
      );
    });

    it("rejects a zero qtyDelta", async () => {
      await expect(
        service.recordAdjustment(em, { itemId: "item-1", storeId: "store-1", qtyDelta: "0", unitCost: "10", refDocType: "x", refDocId: "y" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("transfers primitives", () => {
    it("recordTransferOut values at current avg_cost, no recalculation", async () => {
      itemRepository.findByIdOrFail.mockResolvedValue(makeItem({ avgCost: "2.000000" }));
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(makeBalance({ qty: "10.0000", value: Money.fromDecimalString("20.00") }));

      const movement = await service.recordTransferOut(em, { itemId: "item-1", storeId: "store-1", qty: "4", refDocType: "inv_transfer_line", refDocId: "line-1" });

      expect(movement.movementType).toBe("TRANSFER_OUT");
      expect(movement.qty).toBe("-4.0000");
      expect(movement.unitCost).toBe("2.000000");
      expect(itemRepository.save).not.toHaveBeenCalled();
    });

    it("recordTransferIn recalculates the destination store's weighted average", async () => {
      stockBalanceRepository.findByIdForUpdate.mockResolvedValue(null);

      const movement = await service.recordTransferIn(em, {
        itemId: "item-1",
        storeId: "store-2",
        qty: "4",
        unitCost: "2.000000",
        refDocType: "inv_transfer_line",
        refDocId: "line-1",
      });

      expect(movement.movementType).toBe("TRANSFER_IN");
      expect(itemRepository.save).toHaveBeenCalledWith(expect.objectContaining({ avgCost: "2.000000" }), em);
    });
  });
});
