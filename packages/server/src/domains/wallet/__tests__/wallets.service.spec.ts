import { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { WalletsService } from "../application/wallets.service";
import { WallWalletEntity } from "../domain/wall-wallet.entity";

const EM = {} as EntityManager;

function makeWallet(overrides: Partial<WallWalletEntity>): WallWalletEntity {
  return {
    id: "wallet-1",
    studentId: "student-1",
    status: "ACTIVE",
    balance: Money.ZERO,
    overdraftLimit: Money.ZERO,
    dailyLimit: null,
    txnLimit: null,
    categoryBlocks: [],
    statusReason: null,
    ...overrides,
  } as WallWalletEntity;
}

describe("WalletsService", () => {
  let walletRepository: { findByStudentId: jest.Mock; findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: WalletsService;

  beforeEach(() => {
    walletRepository = {
      findByStudentId: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeWallet({})),
      create: jest.fn(async (data: Partial<WallWalletEntity>) => makeWallet(data)),
      save: jest.fn(async (e: WallWalletEntity) => e),
    };
    settingsService = { getTyped: jest.fn(async (_key: string, def: unknown) => def) };
    outboxWriter = { write: jest.fn(async () => undefined) };
    dataSource = { transaction: jest.fn((_level: string, work: (em: EntityManager) => Promise<unknown>) => work(EM)) };
    service = new WalletsService(walletRepository as never, settingsService as never, outboxWriter as never, dataSource as never);
  });

  describe("getOrCreateWallet", () => {
    it("lazily provisions ACTIVE/balance=0 on first use", async () => {
      const wallet = await service.getOrCreateWallet("student-1", "actor-1");
      expect(walletRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: "student-1", status: "ACTIVE", balance: Money.ZERO }),
      );
      expect(wallet.status).toBe("ACTIVE");
    });

    it("returns the existing wallet idempotently", async () => {
      const existing = makeWallet({ id: "existing" });
      walletRepository.findByStudentId.mockResolvedValue(existing);
      const wallet = await service.getOrCreateWallet("student-1");
      expect(wallet).toBe(existing);
      expect(walletRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("setStatus", () => {
    it("rejects a direct transition to CLOSED", async () => {
      await expect(service.setStatus("wallet-1", "CLOSED", null, "actor-1")).rejects.toThrow(ValidationException);
    });

    it("rejects any transition on an already-CLOSED wallet", async () => {
      walletRepository.findByIdOrFail.mockResolvedValue(makeWallet({ status: "CLOSED" }));
      await expect(service.setStatus("wallet-1", "FROZEN", null, "actor-1")).rejects.toThrow(ValidationException);
    });

    it("sets LOCKED with a reason and publishes an event", async () => {
      const wallet = await service.setStatus("wallet-1", "LOCKED", "guardian request", "actor-1");
      expect(wallet.status).toBe("LOCKED");
      expect(wallet.statusReason).toBe("guardian request");
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateLimits", () => {
    it("rejects a dailyLimit exceeding the school-policy maximum (BR-WALL-04)", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) => (key.includes("daily") ? "1000.00" : def));
      await expect(service.updateLimits("wallet-1", { dailyLimit: Money.fromInt(2000) }, "actor-1")).rejects.toThrow(/BR-WALL-04/);
    });

    it("accepts a dailyLimit that tightens the school-policy maximum", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) => (key.includes("daily") ? "1000.00" : def));
      const wallet = await service.updateLimits("wallet-1", { dailyLimit: Money.fromInt(500) }, "actor-1");
      expect(wallet.dailyLimit?.equals(Money.fromInt(500))).toBe(true);
    });

    it("rejects an unknown category in categoryBlocks", async () => {
      await expect(
        service.updateLimits("wallet-1", { categoryBlocks: ["NOT_A_REAL_TYPE"] as unknown as WallWalletEntity["categoryBlocks"] }, "actor-1"),
      ).rejects.toThrow(ValidationException);
    });
  });
});
