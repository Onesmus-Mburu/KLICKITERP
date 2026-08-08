import { LockoutService } from "../application/lockout.service";
import { FakeRedis } from "./support/fake-redis";

describe("LockoutService", () => {
  let redis: FakeRedis;
  let auditLogRepository: { append: jest.Mock };
  let config: { lockoutMaxFailures: number; lockoutWindowMinutes: number; lockoutDurationMinutes: number };
  let service: LockoutService;

  beforeEach(() => {
    redis = new FakeRedis();
    auditLogRepository = { append: jest.fn() };
    config = { lockoutMaxFailures: 5, lockoutWindowMinutes: 15, lockoutDurationMinutes: 15 };
    service = new LockoutService(redis as never, config as never, auditLogRepository as never);
  });

  it("is not locked before any failures", async () => {
    expect(await service.isLocked("jdoe")).toBe(false);
  });

  it("locks the identifier on the 5th failure within the window (FR-AUTH-007.1)", async () => {
    for (let i = 0; i < 4; i++) {
      const tripped = await service.registerFailure("jdoe");
      expect(tripped).toBe(false);
      expect(await service.isLocked("jdoe")).toBe(false);
    }

    const trippedOnFifth = await service.registerFailure("jdoe");
    expect(trippedOnFifth).toBe(true);
    expect(await service.isLocked("jdoe")).toBe(true);
  });

  it("reset clears both the failure counter and the lock", async () => {
    for (let i = 0; i < 5; i++) {
      await service.registerFailure("jdoe");
    }
    expect(await service.isLocked("jdoe")).toBe(true);

    await service.reset("jdoe");
    expect(await service.isLocked("jdoe")).toBe(false);
  });

  it("unlock resets the lock and writes an audit entry", async () => {
    for (let i = 0; i < 5; i++) {
      await service.registerFailure("jdoe");
    }
    await service.unlock("user-1", "jdoe", "admin-1");

    expect(await service.isLocked("jdoe")).toBe(false);
    expect(auditLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", entityId: "user-1", action: "UNLOCK" }),
    );
  });
});
