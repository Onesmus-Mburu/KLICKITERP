import { LicenseApiService } from "../application/license-api.service";
import { LicenseEntity, LicenseState } from "../domain/license.entity";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";

function makeLicense(overrides: Partial<LicenseEntity> = {}): LicenseEntity {
  return {
    id: "lic-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    version: 1,
    schoolId: "school-1",
    plan: "STANDARD",
    features: [],
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    graceDays: 14,
    state: "ACTIVE" as LicenseState,
    licenseBlob: null,
    verifiedAt: null,
    stateChangedAt: null,
    ...overrides,
  } as LicenseEntity;
}

describe("LicenseApiService — the 9 enumerated /license/v1/* handlers", () => {
  let licenseRepository: {
    findCurrent: jest.Mock;
    findCurrentOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let usageStatsViewRepository: { read: jest.Mock };
  let usageSnapshotRepository: { create: jest.Mock };
  let updateNoticesService: { record: jest.Mock };
  let service: LicenseApiService;

  beforeEach(() => {
    licenseRepository = {
      findCurrent: jest.fn(),
      findCurrentOrFail: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    usageStatsViewRepository = { read: jest.fn() };
    usageSnapshotRepository = { create: jest.fn() };
    updateNoticesService = { record: jest.fn() };
    service = new LicenseApiService(
      licenseRepository as never,
      usageStatsViewRepository as never,
      usageSnapshotRepository as never,
      updateNoticesService as never,
    );
  });

  describe("register", () => {
    it("creates a new PROVISIONED license when none exists", async () => {
      licenseRepository.findCurrent.mockResolvedValue(null);
      licenseRepository.create.mockImplementation(async (data: Partial<LicenseEntity>) => makeLicense(data));

      const result = await service.register({
        schoolId: "school-1",
        plan: "STANDARD",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      });

      expect(result.state).toBe("PROVISIONED");
      expect(licenseRepository.create).toHaveBeenCalledWith(expect.objectContaining({ state: "PROVISIONED", schoolId: "school-1" }));
    });

    it("re-provisions (resets to PROVISIONED) an existing row", async () => {
      licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "SUSPENDED" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.register({ schoolId: "school-1", plan: "STANDARD", validFrom: "2026-01-01", validTo: "2026-12-31" });

      expect(result.state).toBe("PROVISIONED");
    });

    it("rejects a request missing required fields", async () => {
      await expect(
        service.register({ schoolId: "", plan: "", validFrom: "", validTo: "" }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("subscription", () => {
    it("updates plan/features without touching state", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE", plan: "STANDARD" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.subscription({ plan: "PREMIUM", features: ["a", "b"] });

      expect(result.plan).toBe("PREMIUM");
      expect(result.features).toEqual(["a", "b"]);
      expect(result.state).toBe("ACTIVE");
    });
  });

  describe("activate", () => {
    it("transitions PROVISIONED -> ACTIVE", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "PROVISIONED" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.activate({});

      expect(result.state).toBe("ACTIVE");
    });

    it("rejects activating a DEACTIVATED license", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "DEACTIVATED" }));

      await expect(service.activate({})).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("suspend", () => {
    it("transitions ACTIVE -> SUSPENDED", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.suspend();

      expect(result.state).toBe("SUSPENDED");
    });

    it("rejects suspending a PROVISIONED license", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "PROVISIONED" }));

      await expect(service.suspend()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("renew", () => {
    it("extends valid_to and re-derives ACTIVE out of SUSPENDED", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "SUSPENDED", validTo: "2020-01-01" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.renew({ validTo: "2099-01-01" });

      expect(result.state).toBe("ACTIVE");
      expect(result.validTo).toBe("2099-01-01");
    });

    it("rejects renewing a DEACTIVATED license", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "DEACTIVATED" }));

      await expect(service.renew({ validTo: "2099-01-01" })).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a request missing validTo", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE" }));

      await expect(service.renew({} as never)).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("deactivate", () => {
    it("transitions any state to DEACTIVATED", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE" }));
      licenseRepository.save.mockImplementation(async (entity: LicenseEntity) => entity);

      const result = await service.deactivate();

      expect(result.state).toBe("DEACTIVATED");
    });
  });

  describe("status", () => {
    it("returns the current license view", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense());

      const result = await service.status();

      expect(result.schoolId).toBe("school-1");
      expect(result.plan).toBe("STANDARD");
    });
  });

  describe("usage", () => {
    it("assembles the EXACT FR-LIC-005.1 payload shape and writes a usage_snapshot row", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE" }));
      usageStatsViewRepository.read.mockResolvedValue({
        active_users_30d: "5",
        student_count: "120",
        storage_bytes: "204800",
        last_backup_at: "2026-07-01T00:00:00.000Z",
      });

      const result = await service.usage();

      expect(Object.keys(result).sort()).toEqual(
        ["version", "uptime_s", "active_users_30d", "student_count", "storage_bytes", "last_backup_at", "license_state"].sort(),
      );
      expect(result.active_users_30d).toBe(5);
      expect(result.student_count).toBe(120);
      expect(result.storage_bytes).toBe(204800);
      expect(result.last_backup_at).toBe("2026-07-01T00:00:00.000Z");
      expect(result.license_state).toBe("ACTIVE");
      expect(typeof result.uptime_s).toBe("number");
      expect(typeof result.version).toBe("string");
      expect(usageSnapshotRepository.create).toHaveBeenCalledWith(expect.objectContaining({ payload: result }));
    });

    it("reports null last_backup_at when no backup has ever run", async () => {
      licenseRepository.findCurrentOrFail.mockResolvedValue(makeLicense({ state: "ACTIVE" }));
      usageStatsViewRepository.read.mockResolvedValue({
        active_users_30d: 0,
        student_count: 0,
        storage_bytes: 0,
        last_backup_at: null,
      });

      const result = await service.usage();

      expect(result.last_backup_at).toBeNull();
    });
  });

  describe("updateNotice", () => {
    it("records a new PENDING notice via UpdateNoticesService", async () => {
      updateNoticesService.record.mockResolvedValue({ id: "notice-1", decision: "PENDING" });

      const result = await service.updateNotice({ version: "2.0.0", notes: "Security fix", urgency: "SECURITY" });

      expect(updateNoticesService.record).toHaveBeenCalledWith({ version: "2.0.0", notes: "Security fix", urgency: "SECURITY" });
      expect(result).toEqual({ id: "notice-1", decision: "PENDING" });
    });

    it("rejects a request missing required fields", async () => {
      await expect(service.updateNotice({ version: "", notes: "", urgency: "" as never })).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
