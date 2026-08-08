import { EntityManager } from "typeorm";
import { AccountingSyncService } from "../application/accounting-sync.service";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";

const EM = {} as EntityManager;

describe("AccountingSyncService", () => {
  let resolver: { resolve: jest.Mock };
  let syncLogRepository: { create: jest.Mock; list: jest.Mock };
  let adapter: { pushEntity: jest.Mock; testConnection: jest.Mock };
  let service: AccountingSyncService;

  beforeEach(() => {
    adapter = { pushEntity: jest.fn(), testConnection: jest.fn() };
    resolver = { resolve: jest.fn(async () => adapter) };
    syncLogRepository = {
      create: jest.fn(async (data: Partial<IntgSyncLogEntity>) => ({ id: "log-1", ...data }) as IntgSyncLogEntity),
      list: jest.fn(async () => [[], 0]),
    };
    service = new AccountingSyncService(resolver as never, syncLogRepository as never);
  });

  describe("pushEntity — log-then-classify", () => {
    it("logs a SUCCESS row with provider_ref when the adapter resolves", async () => {
      adapter.pushEntity.mockResolvedValue({ providerRef: "qb-invoice-145" });

      const logRow = await service.pushEntity(EM, {
        kind: "QUICKBOOKS",
        entityType: "INVOICE",
        entityId: "inv-1",
        payload: { Line: [] },
      });

      expect(resolver.resolve).toHaveBeenCalledWith("QUICKBOOKS");
      expect(adapter.pushEntity).toHaveBeenCalledWith("INVOICE", "PUSH", { Line: [] });
      expect(syncLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "QUICKBOOKS",
          direction: "PUSH",
          entityType: "INVOICE",
          entityId: "inv-1",
          status: "SUCCESS",
          providerRef: "qb-invoice-145",
          error: null,
        }),
        EM,
      );
      expect(logRow.status).toBe("SUCCESS");
    });

    it("logs a FAILED row with the error message when the adapter throws, WITHOUT rethrowing", async () => {
      adapter.pushEntity.mockRejectedValue(new Error("QuickBooks API responded 401: unauthorized"));

      const logRow = await service.pushEntity(EM, {
        kind: "QUICKBOOKS",
        entityType: "INVOICE",
        entityId: "inv-1",
        payload: {},
      });

      expect(syncLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "FAILED",
          providerRef: null,
          error: "QuickBooks API responded 401: unauthorized",
        }),
        EM,
      );
      expect(logRow.status).toBe("FAILED");
    });

    it("always writes exactly one log row regardless of outcome (log-then-classify, not classify-then-maybe-log)", async () => {
      adapter.pushEntity.mockResolvedValueOnce({ providerRef: "ok-1" });
      await service.pushEntity(EM, { kind: "XERO", entityType: "CUSTOMER", entityId: "c-1", payload: {} });

      adapter.pushEntity.mockRejectedValueOnce(new Error("boom"));
      await service.pushEntity(EM, { kind: "XERO", entityType: "CUSTOMER", entityId: "c-2", payload: {} });

      expect(syncLogRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("testConnection", () => {
    it("delegates to the resolved adapter's testConnection() (FR-SET-003.1)", async () => {
      adapter.testConnection.mockResolvedValue({ ok: true, message: "Connected" });

      const result = await service.testConnection("SAGE");

      expect(resolver.resolve).toHaveBeenCalledWith("SAGE");
      expect(result).toEqual({ ok: true, message: "Connected" });
    });
  });
});
