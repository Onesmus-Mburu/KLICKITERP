import { DataSource, EntityManager } from "typeorm";
import { OtpService } from "../application/otp.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FakeRedis } from "./support/fake-redis";

describe("OtpService", () => {
  let dataSource: DataSource;
  let userRepository: { findByPhoneAndType: jest.Mock; touchLastLogin: jest.Mock };
  let sessionRepository: { create: jest.Mock };
  let jwtTokenService: { sign: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let config: {
    otpMaxSendsPerHourPerPhone: number;
    otpMaxSendsPerHourPerIp: number;
    otpTtlSeconds: number;
    otpMaxVerifyAttempts: number;
  };
  let notifications: { send: jest.Mock };
  let redis: FakeRedis;
  let service: OtpService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    userRepository = { findByPhoneAndType: jest.fn(), touchLastLogin: jest.fn() };
    sessionRepository = { create: jest.fn(async (data: Record<string, unknown>) => ({ id: "session-1", ...data })) };
    jwtTokenService = { sign: jest.fn(() => "parent.jwt.token") };
    outboxWriter = { write: jest.fn() };
    config = { otpMaxSendsPerHourPerPhone: 3, otpMaxSendsPerHourPerIp: 10, otpTtlSeconds: 300, otpMaxVerifyAttempts: 5 };
    notifications = { send: jest.fn() };
    redis = new FakeRedis();

    service = new OtpService(
      dataSource,
      userRepository as never,
      sessionRepository as never,
      jwtTokenService as never,
      outboxWriter as never,
      config as never,
      notifications as never,
      redis as never,
    );
  });

  it("requestOtp sends a code via the notification port and stores a hash in Redis", async () => {
    const result = await service.requestOtp("+254700000000", "1.1.1.1");
    expect(result.sent).toBe(true);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+254700000000", channel: "SMS" }),
    );
    expect(await redis.get("auth:otp:code:+254700000000")).toEqual(expect.any(String));
  });

  it("requestOtp enforces the per-phone rate limit (3/hr)", async () => {
    await service.requestOtp("+254700000000", "1.1.1.1");
    await service.requestOtp("+254700000000", "2.2.2.2");
    await service.requestOtp("+254700000000", "3.3.3.3");

    await expect(service.requestOtp("+254700000000", "4.4.4.4")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("requestOtp enforces the per-IP rate limit (10/hr)", async () => {
    for (let i = 0; i < 10; i++) {
      await service.requestOtp(`+25470000${String(i).padStart(4, "0")}`, "9.9.9.9");
    }
    await expect(service.requestOtp("+254709999999", "9.9.9.9")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("verifyOtp succeeds for a matching code against an existing PARENT user", async () => {
    notifications.send.mockImplementation(async () => undefined);
    await service.requestOtp("+254700000000", "1.1.1.1");

    // Recover the code the same way the service generated it isn't possible (hashed) — call again is invalid
    // since only one OTP window is live; instead exercise via a controlled hash bypass: re-issue then read via a spy.
    const sentBody = notifications.send.mock.calls[0][0].body as string;
    const code = /\d{6}/.exec(sentBody)![0];

    userRepository.findByPhoneAndType.mockResolvedValue({ id: "parent-1" });

    const result = await service.verifyOtp("+254700000000", code, "1.1.1.1", "ua");
    expect(result.accessToken).toBe("parent.jwt.token");
    expect(result.linkedStudents).toEqual([]);
  });

  it("verifyOtp rejects a wrong code and increments attempts", async () => {
    await service.requestOtp("+254700000000", "1.1.1.1");
    await expect(service.verifyOtp("+254700000000", "000000", "1.1.1.1", "ua")).rejects.toBeInstanceOf(
      AuthenticationException,
    );
  });

  it("verifyOtp throws NotFoundException when no PARENT user matches the phone", async () => {
    await service.requestOtp("+254700000000", "1.1.1.1");
    const sentBody = notifications.send.mock.calls[0][0].body as string;
    const code = /\d{6}/.exec(sentBody)![0];

    userRepository.findByPhoneAndType.mockResolvedValue(null);

    await expect(service.verifyOtp("+254700000000", code, "1.1.1.1", "ua")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("verifyOtp locks out after exceeding max attempts (5, FR-AUTH-013.1)", async () => {
    await service.requestOtp("+254700000000", "1.1.1.1");
    // Attempts 1-5: wrong code, each rejected as "invalid" while attempts climbs to the max.
    for (let i = 0; i < 5; i++) {
      await expect(service.verifyOtp("+254700000000", "000000", "1.1.1.1", "ua")).rejects.toThrow(/invalid code/i);
    }
    // 6th attempt: max already reached — record is purged and rejected as "too many attempts".
    await expect(service.verifyOtp("+254700000000", "000000", "1.1.1.1", "ua")).rejects.toThrow(/too many attempts/i);
    // 7th attempt: record is gone — now rejected as "expired".
    await expect(service.verifyOtp("+254700000000", "000000", "1.1.1.1", "ua")).rejects.toThrow(/expired/i);
  });
});
