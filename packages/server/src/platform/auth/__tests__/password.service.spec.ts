import * as bcrypt from "bcryptjs";
import { DataSource, EntityManager } from "typeorm";
import { PasswordService } from "../application/password.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FakeRedis } from "./support/fake-redis";

describe("PasswordService", () => {
  let dataSource: DataSource;
  let userRepository: { findById: jest.Mock; findByIdentifier: jest.Mock; save: jest.Mock };
  let passwordHistoryRepository: { findRecent: jest.Mock; record: jest.Mock };
  let sessionRepository: { revokeAllForUser: jest.Mock };
  let config: { passwordResetTtlSeconds: number };
  let notifications: { send: jest.Mock };
  let redis: FakeRedis;
  let service: PasswordService;

  const user = { id: "user-1", username: "jdoe", email: "jdoe@example.com", phone: null, passwordHash: bcrypt.hashSync("old-password-1", 4) };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    userRepository = {
      findById: jest.fn(async () => ({ ...user })),
      findByIdentifier: jest.fn(async () => ({ ...user })),
      save: jest.fn(async (u: unknown) => u),
    };
    passwordHistoryRepository = { findRecent: jest.fn(async () => []), record: jest.fn() };
    sessionRepository = { revokeAllForUser: jest.fn() };
    config = { passwordResetTtlSeconds: 1800 };
    notifications = { send: jest.fn() };
    redis = new FakeRedis();

    service = new PasswordService(
      dataSource,
      userRepository as never,
      passwordHistoryRepository as never,
      sessionRepository as never,
      config as never,
      notifications as never,
      redis as never,
    );
  });

  describe("changePassword", () => {
    it("rejects an incorrect current password", async () => {
      await expect(service.changePassword("user-1", "wrong", "new-password-123")).rejects.toBeInstanceOf(
        AuthenticationException,
      );
    });

    it("rejects reuse of one of the last 5 passwords", async () => {
      const reusedHash = bcrypt.hashSync("previously-used-1", 4);
      passwordHistoryRepository.findRecent.mockResolvedValue([{ passwordHash: reusedHash }]);

      await expect(service.changePassword("user-1", "old-password-1", "previously-used-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("accepts a genuinely new password and records history", async () => {
      await service.changePassword("user-1", "old-password-1", "brand-new-password-1");
      expect(passwordHistoryRepository.record).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });
  });

  describe("forgotPassword / resetPassword", () => {
    it("forgotPassword returns a uniform response even for an unknown identifier (no enumeration)", async () => {
      userRepository.findByIdentifier.mockResolvedValue(null);
      const result = await service.forgotPassword("nobody@example.com");
      expect(result.sent).toBe(true);
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it("resetPassword validates the token, sets the password, and invalidates all sessions", async () => {
      await service.forgotPassword("jdoe");
      const body = notifications.send.mock.calls[0][0].body as string;
      const token = /Token: (\S+)/.exec(body)![1];

      await service.resetPassword(token, "brand-new-password-2");

      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith("user-1", "PASSWORD_RESET", expect.anything());
    });

    it("resetPassword rejects an invalid/expired token", async () => {
      await expect(service.resetPassword("does-not-exist", "brand-new-password-3")).rejects.toBeInstanceOf(
        AuthenticationException,
      );
    });
  });
});
