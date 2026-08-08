import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { StockMovementsService } from "../application/stock-movements.service";
import { TransfersService } from "../application/transfers.service";
import { InvItemEntity } from "../domain/inv-item.entity";
import { InvMovementEntity } from "../domain/inv-movement.entity";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";
import { InvTransferEntity } from "../domain/inv-transfer.entity";
import { InvTransferLineEntity } from "../domain/inv-transfer-line.entity";
import { InvItemRepository } from "../infrastructure/inv-item.repository";
import { InvMovementRepository } from "../infrastructure/inv-movement.repository";
import { InvStockBalanceRepository } from "../infrastructure/inv-stock-balance.repository";
import { InvStockTakeRepository } from "../infrastructure/inv-stock-take.repository";

function makeTransfer(overrides: Partial<InvTransferEntity> = {}): InvTransferEntity {
  return {
    id: "transfer-1",
    number: "TRF-000001",
    fromStoreId: "store-a",
    toStoreId: "store-b",
    status: "ISSUED",
    issuedBy: "user-1",
    receivedBy: null,
    ...overrides,
  } as InvTransferEntity;
}

function makeTransferLine(overrides: Partial<InvTransferLineEntity> = {}): InvTransferLineEntity {
  return {
    id: "line-1",
    transferId: "transfer-1",
    lineNo: 1,
    itemId: "item-1",
    qty: "10.0000",
    unitCost: "5.000000",
    ...overrides,
  } as InvTransferLineEntity;
}

/**
 * `TransfersService` composed against a REAL `StockMovementsService`
 * instance (mocked repos underneath) rather than a mocked
 * `StockMovementsService` — the task brief specifically wants the
 * issue->receive round trip to demonstrate VALUE is preserved end to end,
 * which is best proven by exercising the real weighted-average engine both
 * services share, not by stubbing it away.
 */
describe("TransfersService", () => {
  let transferRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let transferLineRepository: { create: jest.Mock; findByTransferId: jest.Mock };
  let numberingService: { allocate: jest.Mock };
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
  let stockMovementsService: StockMovementsService;
  let service: TransfersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    transferRepository = {
      create: jest.fn(async (data) => makeTransfer(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeTransfer()),
      list: jest.fn(async () => []),
    };
    transferLineRepository = {
      create: jest.fn(async (data) => makeTransferLine(data)),
      findByTransferId: jest.fn(async () => [makeTransferLine()]),
    };
    numberingService = { allocate: jest.fn(async () => "TRF-000001") };

    // Two independent balance rows keyed by (itemId, storeId) so the round trip is realistic.
    const balances = new Map<string, InvStockBalanceEntity>();
    stockBalanceRepository = {
      findByIdForUpdate: jest.fn(async (_em: unknown, itemId: string, storeId: string) => balances.get(`${itemId}:${storeId}`) ?? null),
      findByItemStore: jest.fn(async (itemId: string, storeId: string) => balances.get(`${itemId}:${storeId}`) ?? null),
      listByStore: jest.fn(async () => []),
      create: jest.fn(async (data: Partial<InvStockBalanceEntity>) => {
        const row = { id: `bal-${balances.size + 1}`, ...data } as InvStockBalanceEntity;
        balances.set(`${row.itemId}:${row.storeId}`, row);
        return row;
      }),
      save: jest.fn(async (entity: InvStockBalanceEntity) => {
        balances.set(`${entity.itemId}:${entity.storeId}`, entity);
        return entity;
      }),
    };
    movementRepository = {
      listByRefDoc: jest.fn(async () => []),
      listForItemStore: jest.fn(async () => []),
      create: jest.fn(async (data) => ({ id: `mv-${Math.random()}`, at: new Date(), ...data }) as InvMovementEntity),
    };
    itemRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "item-1", avgCost: "5.000000" }) as InvItemEntity),
      save: jest.fn(async (e) => e),
    };
    stockTakeRepository = { listOpenForStore: jest.fn(async () => []) };

    stockMovementsService = new StockMovementsService(
      stockBalanceRepository as unknown as InvStockBalanceRepository,
      movementRepository as unknown as InvMovementRepository,
      itemRepository as unknown as InvItemRepository,
      stockTakeRepository as unknown as InvStockTakeRepository,
    );

    // Seed store-a with 10 units @ value 50.00 so the outbound leg has something to draw from.
    void stockBalanceRepository.create(
      { itemId: "item-1", storeId: "store-a", qty: "10.0000", value: Money.fromDecimalString("50.00") },
      em,
    );

    service = new TransfersService(transferRepository as never, transferLineRepository as never, stockMovementsService, numberingService as never);
  });

  describe("issue", () => {
    it("rejects fromStoreId === toStoreId", async () => {
      await expect(
        service.issue(em, { fromStoreId: "store-a", toStoreId: "store-a", lines: [{ itemId: "item-1", qty: "1", unitCost: "5" }] }, "user-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects zero lines", async () => {
      await expect(service.issue(em, { fromStoreId: "store-a", toStoreId: "store-b", lines: [] }, "user-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("creates the transfer ISSUED, its lines, and deducts the source store", async () => {
      const transfer = await service.issue(
        em,
        { fromStoreId: "store-a", toStoreId: "store-b", lines: [{ itemId: "item-1", qty: "4", unitCost: "5.000000" }] },
        "user-1",
      );

      expect(transfer.status).toBe("ISSUED");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "INV_TRANSFER");

      const sourceBalance = await stockBalanceRepository.findByItemStore("item-1", "store-a");
      expect(sourceBalance.qty).toBe("6.0000");
      expect(sourceBalance.value).toEqual(Money.fromDecimalString("30.00"));
    });
  });

  describe("issue -> receive round trip", () => {
    it("preserves the transferred VALUE exactly at the destination store", async () => {
      const transfer = await service.issue(
        em,
        { fromStoreId: "store-a", toStoreId: "store-b", lines: [{ itemId: "item-1", qty: "4", unitCost: "5.000000" }] },
        "user-1",
      );

      // TransfersController would look the transfer + its lines back up by id — wire the mocks to return what issue() actually created.
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ id: transfer.id, status: "ISSUED" }));
      const issuedLine = await transferLineRepository.create.mock.results[0].value;
      transferLineRepository.findByTransferId.mockResolvedValue([issuedLine]);

      const received = await service.receive(em, transfer.id, "user-2");

      expect(received.status).toBe("RECEIVED");
      expect(received.receivedBy).toBe("user-2");

      const destinationBalance = await stockBalanceRepository.findByItemStore("item-1", "store-b");
      expect(destinationBalance.qty).toBe("4.0000");
      // Exactly the value that left store-a: 4 * 5.00 = 20.00.
      expect(destinationBalance.value).toEqual(Money.fromDecimalString("20.00"));
    });
  });

  describe("receive", () => {
    it("rejects a transfer that is not ISSUED/IN_TRANSIT", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "RECEIVED" }));
      await expect(service.receive(em, "transfer-1", "user-2")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("cancel", () => {
    it("reverses the source-side deduction via an ADJUSTMENT gain", async () => {
      await service.issue(em, { fromStoreId: "store-a", toStoreId: "store-b", lines: [{ itemId: "item-1", qty: "4", unitCost: "5.000000" }] }, "user-1");
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "ISSUED" }));
      const issuedLine = await transferLineRepository.create.mock.results[0].value;
      transferLineRepository.findByTransferId.mockResolvedValue([issuedLine]);

      await service.cancel(em, "transfer-1", "user-1");

      const sourceBalance = await stockBalanceRepository.findByItemStore("item-1", "store-a");
      expect(sourceBalance.qty).toBe("10.0000");
      expect(sourceBalance.value).toEqual(Money.fromDecimalString("50.00"));
      expect(transferRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "CANCELLED" }), em);
    });

    it("rejects cancelling an already-RECEIVED transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "RECEIVED" }));
      await expect(service.cancel(em, "transfer-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
