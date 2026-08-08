import { DataSource, EntityManager } from "typeorm";
import { CashierSessionsService } from "../application/cashier-sessions.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";

function makeSession(overrides: Partial<PayCashierSessionEntity>): PayCashierSessionEntity {
  return {
    id: "session-1",
    cashierId: "cashier-1",
    till: "TILL-01",
    status: "OPEN",
    openedAt: new Date("2026-07-15T08:00:00Z"),
    floatAmount: Money.fromInt(5000),
    closedAt: null,
    counted: null,
    expectedTotals: null,
    varianceAmount: null,
    varianceReason: null,
    supervisorId: null,
    ...overrides,
  } as PayCashierSessionEntity;
}

function makeReceipt(overrides: Partial<PayReceiptEntity>): PayReceiptEntity {
  return {
    id: "receipt-1",
    status: "POSTED",
    sessionId: "session-1",
    ...overrides,
  } as PayReceiptEntity;
}

function makeSplit(overrides: Partial<PayReceiptSplitEntity>): PayReceiptSplitEntity {
  return {
    id: "split-1",
    receiptId: "receipt-1",
    method: "CASH",
    amount: Money.fromInt(1000),
    ...overrides,
  } as PayReceiptSplitEntity;
}

describe("CashierSessionsService", () => {
  let sessionRepository: {
    create: jest.Mock;
    findOpenForCashier: jest.Mock;
    findByIdOrFail: jest.Mock;
    save: jest.Mock;
  };
  let receiptRepository: { listBySession: jest.Mock };
  let splitRepository: { listByReceipt: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let dataSource: DataSource;
  let service: CashierSessionsService;

  beforeEach(() => {
    sessionRepository = {
      create: jest.fn(async (data) => makeSession(data)),
      findOpenForCashier: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makeSession({})),
      save: jest.fn(async (e) => e),
    };
    receiptRepository = { listBySession: jest.fn(async () => []) };
    splitRepository = { listByReceipt: jest.fn(async () => []) };
    settingsService = { getTyped: jest.fn(async (_key: string, defaultValue: unknown) => defaultValue) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new CashierSessionsService(
      sessionRepository as never,
      receiptRepository as never,
      splitRepository as never,
      settingsService as never,
      dataSource,
    );
  });

  describe("openSession", () => {
    it("creates an OPEN session", async () => {
      const session = await service.openSession("cashier-1", "TILL-01", Money.fromInt(5000));
      expect(session.status).toBe("OPEN");
      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ cashierId: "cashier-1", till: "TILL-01", status: "OPEN" }),
        expect.anything(),
      );
    });

    it("BR-PAY-04: translates a unique-violation into ConflictException", async () => {
      const error = Object.assign(new Error("duplicate key"), { code: "23505" });
      sessionRepository.create.mockRejectedValueOnce(error);
      await expect(service.openSession("cashier-1", "TILL-01", Money.fromInt(5000))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("rethrows non-unique-violation errors unchanged", async () => {
      const error = new Error("boom");
      sessionRepository.create.mockRejectedValueOnce(error);
      await expect(service.openSession("cashier-1", "TILL-01", Money.fromInt(5000))).rejects.toThrow("boom");
    });
  });

  describe("closeSession", () => {
    it("rejects closing a session that is not OPEN", async () => {
      sessionRepository.findByIdOrFail.mockResolvedValueOnce(makeSession({ status: "CLOSED" }));
      await expect(service.closeSession("session-1", {}, "closer-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("closes directly when counted matches expected (zero variance, within default tolerance)", async () => {
      receiptRepository.listBySession.mockResolvedValueOnce([makeReceipt({})]);
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ method: "CASH", amount: Money.fromInt(1000) })]);

      const session = await service.closeSession("session-1", { CASH: "1000.00" }, "closer-1");

      expect(session.status).toBe("CLOSED");
      expect(session.varianceAmount?.isZero()).toBe(true);
      expect(session.supervisorId).toBeNull();
      expect(session.varianceReason).toBeNull();
    });

    it("ignores splits from non-POSTED (REVERSED) receipts when computing expected totals", async () => {
      receiptRepository.listBySession.mockResolvedValueOnce([makeReceipt({ id: "r-1", status: "REVERSED" })]);
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ amount: Money.fromInt(1000) })]);

      // expected total is 0 (the only receipt is REVERSED), counted is 0 -> zero variance.
      const session = await service.closeSession("session-1", { CASH: "0.00" }, "closer-1");
      expect(session.varianceAmount?.isZero()).toBe(true);
    });

    it("BR-PAY-05: beyond-tolerance variance without supervisor approval is rejected", async () => {
      receiptRepository.listBySession.mockResolvedValueOnce([makeReceipt({})]);
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ amount: Money.fromInt(1000) })]);

      await expect(service.closeSession("session-1", { CASH: "900.00" }, "closer-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("BR-PAY-05: beyond-tolerance variance closes when supervisor credential + reason supplied", async () => {
      receiptRepository.listBySession.mockResolvedValueOnce([makeReceipt({})]);
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ amount: Money.fromInt(1000) })]);

      const session = await service.closeSession("session-1", { CASH: "900.00" }, "closer-1", {
        supervisorId: "supervisor-1",
        varianceReason: "Till short — under investigation",
      });

      expect(session.status).toBe("CLOSED");
      expect(session.supervisorId).toBe("supervisor-1");
      expect(session.varianceReason).toBe("Till short — under investigation");
      expect(session.varianceAmount?.equals(Money.fromInt(100))).toBe(true);
    });

    it("respects a non-zero configured tolerance", async () => {
      settingsService.getTyped.mockResolvedValueOnce("50.00");
      receiptRepository.listBySession.mockResolvedValueOnce([makeReceipt({})]);
      splitRepository.listByReceipt.mockResolvedValueOnce([makeSplit({ amount: Money.fromInt(1000) })]);

      // Variance of 30 is within a 50 tolerance -> closes without approval.
      const session = await service.closeSession("session-1", { CASH: "970.00" }, "closer-1");
      expect(session.status).toBe("CLOSED");
      expect(session.supervisorId).toBeNull();
    });
  });
});
