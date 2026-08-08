import { AdapterResolverService } from "../infrastructure/adapter-resolver.service";
import { GenericHttpSmsAdapter } from "../infrastructure/adapters/generic-http-sms.adapter";
import { LogOnlyAdapter } from "../infrastructure/adapters/log-only.adapter";
import { SmtpMailAdapter } from "../infrastructure/adapters/smtp-mail.adapter";

describe("AdapterResolverService", () => {
  let integrationConfigService: { list: jest.Mock; getDecryptedConfig: jest.Mock };
  let logOnlyAdapter: LogOnlyAdapter;
  let service: AdapterResolverService;

  beforeEach(() => {
    integrationConfigService = { list: jest.fn(async () => []), getDecryptedConfig: jest.fn() };
    logOnlyAdapter = new LogOnlyAdapter();
    service = new AdapterResolverService(integrationConfigService as never, logOnlyAdapter);
  });

  it("falls back to LogOnlyAdapter for SMS when no SMS integration config is enabled", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "SMS", isEnabled: false, priority: 0 }]);

    const adapter = await service.resolveSms();

    expect(adapter).toBe(logOnlyAdapter);
    expect(integrationConfigService.getDecryptedConfig).not.toHaveBeenCalled();
  });

  it("falls back to LogOnlyAdapter for EMAIL when no SMTP config exists at all", async () => {
    integrationConfigService.list.mockResolvedValue([]);
    const adapter = await service.resolveMail();
    expect(adapter).toBe(logOnlyAdapter);
  });

  it("falls back to LogOnlyAdapter for WHATSAPP/INAPP channels unconditionally (no adapter kind exists for either)", async () => {
    expect(await service.resolve("WHATSAPP")).toBe(logOnlyAdapter);
    expect(await service.resolve("INAPP")).toBe(logOnlyAdapter);
    expect(integrationConfigService.list).not.toHaveBeenCalled();
  });

  it("resolves the highest-priority enabled SMS config into a real GenericHttpSmsAdapter", async () => {
    integrationConfigService.list.mockResolvedValue([
      { id: "low", kind: "SMS", isEnabled: true, priority: 1 },
      { id: "high", kind: "SMS", isEnabled: true, priority: 10 },
      { id: "disabled", kind: "SMS", isEnabled: false, priority: 100 },
    ]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ endpoint: "https://gw.example.com/send" });

    const adapter = await service.resolveSms();

    expect(adapter).toBeInstanceOf(GenericHttpSmsAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledWith("high");
  });

  it("caches the resolved adapter instance across calls while the enabled config id is unchanged", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "smtp-1", kind: "SMTP", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ host: "smtp.example.com", port: 587, fromAddress: "no-reply@example.com" });

    const first = await service.resolveMail();
    const second = await service.resolveMail();

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(SmtpMailAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(1);
  });
});
