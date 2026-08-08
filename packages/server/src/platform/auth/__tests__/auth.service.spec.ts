import * as bcrypt from "bcryptjs";
import { DataSource, EntityManager } from "typeorm";
import { AuthService } from "../application/auth.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { FakeRedis } from "./support/fake-redis";

describe("AuthService", () => {
  const activeUser = {
    id: "user-1",
    username: "jdoe",
    email: "jdoe@example.com",
    phone: null,
    fullName: "Jane Doe",
    userType: "STAFF",
    status: "ACTIVE",
    twofaEnabled: false,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync("correct-password", 4),
  };

  let dataSource: DataSource;
  let userRepository: { findByIdentifier: jest.Mock; findById: jest.Mock; save: jest.Mock; touchLastLogin: jest.Mock };
  let sessionRepository: {
    create: jest.Mock;
    findByRefreshTokenHash: jest.Mock;
    findFamily: jest.Mock;
    revoke: jest.Mock;
    revokeFamily: jest.Mock;
  };
  let loginEventRepository: { record: jest.Mock };
  let permissionResolution: { resolveForUser: jest.Mock };
  let lockoutService: { isLocked: jest.Mock; registerFailure: jest.Mock; reset: jest.Mock };
  let jwtTokenService: { sign: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let config: { preauthTokenTtlSeconds: number; refreshTokenTtlDays: number };
  let redis: FakeRedis;
  let service: AuthService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    userRepository = {
      findByIdentifier: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(async (u: unknown) => u),
      touchLastLogin: jest.fn(),
    };
    sessionRepository = {
      create: jest.fn(async (data: Record<string, unknown>) => ({ id: "session-1", ...data })),
      findByRefreshTokenHash: jest.fn(),
      findFamily: jest.fn(),
      revoke: jest.fn(),
      revokeFamily: jest.fn(),
    };
    loginEventRepository = { record: jest.fn() };
    permissionResolution = {
      resolveForUser: jest.fn(async () => ({
        roleNames: ["Bursar"],
        permissionCodes: ["billing:invoice:view"],
        permsHash: "hash1",
      })),
    };
    lockoutService = {
      isLocked: jest.fn(async () => false),
      registerFailure: jest.fn(async () => false),
      reset: jest.fn(),
    };
    jwtTokenService = { sign: jest.fn(() => "signed.jwt.token") };
    outboxWriter = { write: jest.fn() };
    config = { preauthTokenTtlSeconds: 90, refreshTokenTtlDays: 7 };
    redis = new FakeRedis();

    service = new AuthService(
      dataSource,
      userRepository as never,
      sessionRepository as never,
      loginEventRepository as never,
      permissionResolution as never,
      lockoutService as never,
      jwtTokenService as never,
      outboxWriter as never,
      config as never,
      redis as never,
    );
  });

  it("logs in successfully without 2FA and writes a success login_event", async () => {
    userRepository.findByIdentifier.mockResolvedValue(activeUser);

    const result = await service.login("jdoe", "correct-password", "127.0.0.1", "jest-agent");

    expect(result.stage).toBe("complete");
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(loginEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, userId: "user-1" }),
      expect.anything(),
    );
  });

  it("rejects a wrong password and registers a lockout failure", async () => {
    userRepository.findByIdentifier.mockResolvedValue(activeUser);

    await expect(service.login("jdoe", "wrong-password", "127.0.0.1", "jest-agent")).rejects.toBeInstanceOf(
      AuthenticationException,
    );
    expect(lockoutService.registerFailure).toHaveBeenCalledWith("jdoe");
    expect(loginEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, failureReason: "INVALID_CREDENTIALS" }),
    );
  });

  it("rejects login outright once LockoutService reports the identifier locked", async () => {
    lockoutService.isLocked.mockResolvedValue(true);

    await expect(service.login("jdoe", "correct-password", "127.0.0.1", "jest-agent")).rejects.toBeInstanceOf(
      AuthenticationException,
    );
    expect(userRepository.findByIdentifier).not.toHaveBeenCalled();
    expect(loginEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: "LOCKED" }),
    );
  });

  it("issues a pre-auth token instead of a session when 2FA is enabled", async () => {
    userRepository.findByIdentifier.mockResolvedValue({ ...activeUser, twofaEnabled: true });

    const result = await service.login("jdoe", "correct-password", "127.0.0.1", "jest-agent");

    expect(result.stage).toBe("2fa");
    expect(result.preauthToken).toEqual(expect.any(String));
    expect(sessionRepository.create).not.toHaveBeenCalled();
    expect(await redis.get(`auth:preauth:${result.preauthToken}`)).toEqual(expect.any(String));
  });

  it("rejects password login for a PARENT user (FR-AUTH-013.1 — OTP only)", async () => {
    userRepository.findByIdentifier.mockResolvedValue({ ...activeUser, userType: "PARENT" });

    await expect(service.login("jdoe", "correct-password", "127.0.0.1", "jest-agent")).rejects.toBeInstanceOf(
      AuthenticationException,
    );
  });

  describe("refresh", () => {
    it("rotates the refresh token on a valid, non-revoked session", async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "session-1",
        familyId: "family-1",
        userId: "user-1",
        revokedAt: null,
        ip: "1.1.1.1",
        userAgent: "ua",
      });
      userRepository.findById.mockResolvedValue(activeUser);

      const result = await service.refresh("some-refresh-token");

      expect(result.stage).toBe("complete");
      expect(sessionRepository.revoke).toHaveBeenCalledWith("session-1", "ROTATED", expect.anything());
      expect(sessionRepository.revokeFamily).not.toHaveBeenCalled();
    });

    it("detects reuse of an already-rotated token and revokes the whole family (FR-AUTH-002.1)", async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "session-1",
        familyId: "family-1",
        userId: "user-1",
        revokedAt: new Date(),
        ip: "1.1.1.1",
        userAgent: "ua",
      });
      sessionRepository.findFamily.mockResolvedValue([
        { id: "session-1", userId: "user-1" },
        { id: "session-2", userId: "user-1" },
      ]);

      await expect(service.refresh("stolen-refresh-token")).rejects.toBeInstanceOf(AuthenticationException);

      expect(sessionRepository.revokeFamily).toHaveBeenCalledWith("family-1", "REUSE_DETECTED", expect.anything());
      expect(outboxWriter.write).toHaveBeenCalled();
    });

    it("rejects an unknown refresh token", async () => {
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);
      await expect(service.refresh("unknown-token")).rejects.toBeInstanceOf(AuthenticationException);
    });
  });

  describe("logout", () => {
    it("revokes the session and sets a Redis revocation tombstone", async () => {
      await service.logout("session-1");
      expect(sessionRepository.revoke).toHaveBeenCalledWith("session-1", "LOGOUT", expect.anything());
      expect(await redis.get("auth:session:revoked:session-1")).toBe("1");
    });
  });
});
