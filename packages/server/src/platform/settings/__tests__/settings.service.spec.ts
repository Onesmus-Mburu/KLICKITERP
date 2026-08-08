import { AppConfigService } from "../../../shared/config/app-config.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { SettingsService } from "../application/settings.service";
import { SetSettingEntity } from "../domain/set-setting.entity";

describe("SettingsService", () => {
  let repository: { findByKey: jest.Mock; list: jest.Mock; create: jest.Mock; save: jest.Mock };
  let service: SettingsService;

  beforeEach(() => {
    repository = {
      findByKey: jest.fn(async () => null),
      list: jest.fn(async () => []),
      create: jest.fn(async (data: Partial<SetSettingEntity>) => ({ id: "setting-1", ...data }) as SetSettingEntity),
      save: jest.fn(async (entity: SetSettingEntity) => entity),
    };
    service = new SettingsService(repository as never, new AppConfigService());
  });

  describe("secret round-trip (FR-SET-003.1)", () => {
    it("encrypts on write and decrypts transparently on read, never storing plaintext", async () => {
      let stored: SetSettingEntity | null = null;
      repository.findByKey.mockImplementation(async () => stored);
      repository.create.mockImplementation(async (data: Partial<SetSettingEntity>) => {
        stored = { id: "setting-1", ...data } as SetSettingEntity;
        return stored;
      });

      await service.set("integrations.smtp", { user: "a", pass: "s3cr3t-value" }, true, "actor-1");

      expect(stored).not.toBeNull();
      expect(stored!.isSecret).toBe(true);
      expect(typeof stored!.value).toBe("string");
      expect(JSON.stringify(stored!.value)).not.toContain("s3cr3t-value");

      const decoded = await service.get<{ user: string; pass: string }>("integrations.smtp");
      expect(decoded).toEqual({ user: "a", pass: "s3cr3t-value" });
    });

    it("updates (not duplicates) an existing secret setting on a second set()", async () => {
      let stored: SetSettingEntity = {
        id: "setting-1",
        key: "integrations.smtp",
        value: "irrelevant",
        isSecret: true,
      } as SetSettingEntity;
      repository.findByKey.mockImplementation(async () => stored);
      repository.save.mockImplementation(async (entity: SetSettingEntity) => {
        stored = entity;
        return entity;
      });

      await service.set("integrations.smtp", { pass: "new-secret" }, true, "actor-2");

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(await service.get("integrations.smtp")).toEqual({ pass: "new-secret" });
    });
  });

  it("stores non-secret values verbatim (no encryption)", async () => {
    let stored: SetSettingEntity | null = null;
    repository.create.mockImplementation(async (data: Partial<SetSettingEntity>) => {
      stored = { id: "setting-2", ...data } as SetSettingEntity;
      return stored;
    });
    repository.findByKey.mockImplementation(async () => stored);

    await service.set("app.displayName", "Klickit Finance", false, null);

    expect(stored!.value).toBe("Klickit Finance");
    expect(await service.get("app.displayName")).toBe("Klickit Finance");
  });

  it("list() redacts secret values but passes non-secret values through", async () => {
    repository.list.mockResolvedValue([
      { key: "app.displayName", value: "Klickit Finance", isSecret: false },
      { key: "integrations.smtp", value: "ZW5jcnlwdGVkLWJsb2I=", isSecret: true },
    ]);

    expect(await service.list()).toEqual([
      { key: "app.displayName", value: "Klickit Finance", isSecret: false },
      { key: "integrations.smtp", value: "***", isSecret: true },
    ]);
  });

  describe("getTyped", () => {
    it("returns the provided default when the key is missing", async () => {
      expect(await service.getTyped("missing.key", "fallback")).toBe("fallback");
    });

    it("throws NotFoundException when the key is missing and no default is given", async () => {
      await expect(service.getTyped("missing.key")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns the stored value when present", async () => {
      repository.findByKey.mockResolvedValue({ key: "app.locale", value: "en", isSecret: false } as SetSettingEntity);
      expect(await service.getTyped("app.locale", "fr")).toBe("en");
    });
  });
});
