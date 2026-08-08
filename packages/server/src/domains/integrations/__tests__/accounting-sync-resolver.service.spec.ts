import { AccountingSyncResolverService } from "../infrastructure/accounting-sync-resolver.service";
import { QuickBooksAdapter } from "../infrastructure/adapters/quickbooks.adapter";
import { XeroAdapter } from "../infrastructure/adapters/xero.adapter";
import { SageAdapter } from "../infrastructure/adapters/sage.adapter";
import { SyncLogOnlyAdapter } from "../infrastructure/adapters/sync-log-only.adapter";

/** Mirrors `platform/comms`' `adapter-resolver.service.spec.ts` pattern exactly. */
describe("AccountingSyncResolverService", () => {
  let integrationConfigService: { list: jest.Mock; getDecryptedConfig: jest.Mock };
  let syncLogOnlyAdapter: SyncLogOnlyAdapter;
  let service: AccountingSyncResolverService;

  beforeEach(() => {
    integrationConfigService = { list: jest.fn(async () => []), getDecryptedConfig: jest.fn() };
    syncLogOnlyAdapter = new SyncLogOnlyAdapter();
    service = new AccountingSyncResolverService(integrationConfigService as never, syncLogOnlyAdapter);
  });

  it("falls back to SyncLogOnlyAdapter for QUICKBOOKS when no config is enabled", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "QUICKBOOKS", isEnabled: false, priority: 0 }]);

    const adapter = await service.resolve("QUICKBOOKS");

    expect(adapter).toBe(syncLogOnlyAdapter);
    expect(integrationConfigService.getDecryptedConfig).not.toHaveBeenCalled();
  });

  it("falls back to SyncLogOnlyAdapter for XERO when no config exists at all", async () => {
    integrationConfigService.list.mockResolvedValue([]);
    const adapter = await service.resolve("XERO");
    expect(adapter).toBe(syncLogOnlyAdapter);
  });

  it("resolves the highest-priority enabled QUICKBOOKS config into a real QuickBooksAdapter", async () => {
    integrationConfigService.list.mockResolvedValue([
      { id: "low", kind: "QUICKBOOKS", isEnabled: true, priority: 1 },
      { id: "high", kind: "QUICKBOOKS", isEnabled: true, priority: 10 },
      { id: "disabled", kind: "QUICKBOOKS", isEnabled: false, priority: 100 },
    ]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      environment: "sandbox",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      realmId: "realm-1",
    });

    const adapter = await service.resolve("QUICKBOOKS");

    expect(adapter).toBeInstanceOf(QuickBooksAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledWith("high");
  });

  it("resolves an enabled XERO config into a real XeroAdapter", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "xero-1", kind: "XERO", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      tenantId: "tenant-1",
    });

    const adapter = await service.resolve("XERO");

    expect(adapter).toBeInstanceOf(XeroAdapter);
  });

  it("resolves an enabled SAGE config into a real SageAdapter", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "sage-1", kind: "SAGE", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
    });

    const adapter = await service.resolve("SAGE");

    expect(adapter).toBeInstanceOf(SageAdapter);
  });

  it("caches the resolved adapter instance across calls while the enabled config id is unchanged", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "qb-1", kind: "QUICKBOOKS", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      environment: "sandbox",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      realmId: "realm-1",
    });

    const first = await service.resolve("QUICKBOOKS");
    const second = await service.resolve("QUICKBOOKS");

    expect(first).toBe(second);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(1);
  });

  it("re-resolves a fresh adapter once the enabled config id changes", async () => {
    integrationConfigService.list.mockResolvedValueOnce([{ id: "qb-1", kind: "QUICKBOOKS", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      environment: "sandbox",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      realmId: "realm-1",
    });
    const first = await service.resolve("QUICKBOOKS");

    integrationConfigService.list.mockResolvedValueOnce([{ id: "qb-2", kind: "QUICKBOOKS", isEnabled: true, priority: 0 }]);
    const second = await service.resolve("QUICKBOOKS");

    expect(first).not.toBe(second);
  });
});
